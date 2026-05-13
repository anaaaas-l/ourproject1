const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../config/db");
const upload = require("../middleware/uploadMiddleware");
const { authRequired, studentRequired, studentOrAdminRequired } = require("../middleware/authMiddleware");

const router = express.Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_shared_documents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      file_name VARCHAR(500) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      visibility VARCHAR(20) NOT NULL CHECK (visibility IN ('public', 'private')),
      access_code VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_student_shared_documents_access_code
    ON student_shared_documents (access_code) WHERE access_code IS NOT NULL
  `);
  await pool.query(`
    ALTER TABLE student_shared_documents
    ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_student_shared_documents_category
    ON student_shared_documents (category_id) WHERE category_id IS NOT NULL
  `);
}

router.get("/private/resolve", authRequired, studentRequired, async (req, res) => {
  try {
    await ensureTable();
    const code = (req.query.code || "").trim();
    if (!code) {
      return res.status(400).json({ message: "Code requis." });
    }
    const result = await pool.query(
      `SELECT d.id, d.title, d.file_name, d.created_at, u.name AS uploader_name,
              c.name AS category_name
       FROM student_shared_documents d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN categories c ON c.id = d.category_id
       WHERE d.visibility = 'private' AND UPPER(TRIM(d.access_code)) = UPPER(TRIM($1))`,
      [code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Code invalide ou document introuvable." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.get("/", authRequired, studentRequired, async (req, res) => {
  try {
    await ensureTable();
    const search = String(req.query.search || "").trim();
    const categoryId = String(req.query.categoryId || "").trim();

    let sql = `
      SELECT d.id, d.title, d.file_name, d.created_at, u.name AS uploader_name,
             d.category_id, c.name AS category_name
      FROM student_shared_documents d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN categories c ON c.id = d.category_id
      WHERE d.visibility = 'public'
    `;
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      sql += ` AND (
        LOWER(d.title) LIKE LOWER($${values.length})
        OR LOWER(d.file_name) LIKE LOWER($${values.length})
        OR LOWER(COALESCE(c.name, '')) LIKE LOWER($${values.length})
      )`;
    }

    if (categoryId) {
      values.push(categoryId);
      sql += ` AND d.category_id = $${values.length}`;
    }

    sql += ` ORDER BY d.created_at DESC`;

    const result = await pool.query(sql, values);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.post("/", authRequired, studentRequired, upload.single("file"), async (req, res) => {
  try {
    await ensureTable();
    const { title, visibility, categoryId } = req.body;
    if (!title || !req.file) {
      return res.status(400).json({ message: "Titre et fichier sont obligatoires." });
    }
    if (!categoryId) {
      return res.status(400).json({ message: "La catégorie est obligatoire." });
    }
    const catCheck = await pool.query("SELECT id FROM categories WHERE id = $1", [categoryId]);
    if (catCheck.rows.length === 0) {
      return res.status(400).json({ message: "Catégorie invalide." });
    }
    const vis = String(visibility || "").toLowerCase();
    if (vis !== "public" && vis !== "private") {
      return res.status(400).json({ message: "Visibilité invalide : choisissez public ou private." });
    }
    const accessCode = vis === "private" ? crypto.randomBytes(5).toString("hex").toUpperCase() : null;

    const result = await pool.query(
      `INSERT INTO student_shared_documents (user_id, title, file_name, file_path, visibility, access_code, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, file_name, visibility, access_code, category_id, created_at`,
      [req.user.id, title.trim(), req.file.originalname, req.file.filename, vis, accessCode, categoryId]
    );
    const row = result.rows[0];
    return res.status(201).json({
      message:
        vis === "private"
          ? "Document privé enregistré. Communiquez le code uniquement aux personnes autorisées."
          : "Document public publié. Il est visible par tous les étudiants connectés.",
      document: {
        id: row.id,
        title: row.title,
        file_name: row.file_name,
        visibility: row.visibility,
        accessCode: vis === "private" ? row.access_code : undefined,
        created_at: row.created_at,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

function isPdfFileName(name) {
  return String(name || "").toLowerCase().endsWith(".pdf");
}

router.get("/:id/view", authRequired, studentOrAdminRequired, async (req, res) => {
  try {
    await ensureTable();
    const { id } = req.params;
    const code = (req.query.code || "").trim();
    const result = await pool.query(`SELECT d.* FROM student_shared_documents d WHERE d.id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Document introuvable." });
    }

    const doc = result.rows[0];
    if (!isPdfFileName(doc.file_name)) {
      return res.status(400).json({ message: "Seuls les fichiers PDF peuvent être affichés dans le navigateur." });
    }

    if (doc.visibility === "public") {
      /* ok */
    } else if (req.user.role === "admin") {
      /* administrateur : accès sans code */
    } else if (Number(doc.user_id) === Number(req.user.id)) {
      /* propriétaire */
    } else if (code && doc.access_code && code.toUpperCase() === String(doc.access_code).toUpperCase()) {
      /* code valide */
    } else {
      return res.status(403).json({ message: "Code d'accès requis ou incorrect pour ce document privé." });
    }

    const filePath = path.join(__dirname, "..", "uploads", doc.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Fichier introuvable sur le serveur." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: "Erreur serveur.", error: error.message });
    }
    return undefined;
  }
});

router.get("/:id/download", authRequired, studentOrAdminRequired, async (req, res) => {
  try {
    await ensureTable();
    const { id } = req.params;
    const code = (req.query.code || "").trim();
    const result = await pool.query(
      `SELECT d.* FROM student_shared_documents d WHERE d.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Document introuvable." });
    }
    const doc = result.rows[0];
    if (doc.visibility === "public") {
      // tous les étudiants
    } else if (req.user.role === "admin") {
      // administrateur : accès sans code
    } else if (Number(doc.user_id) === Number(req.user.id)) {
      // propriétaire
    } else if (code && doc.access_code && code.toUpperCase() === String(doc.access_code).toUpperCase()) {
      // code valide
    } else {
      return res.status(403).json({ message: "Code d'accès requis ou incorrect pour ce document privé." });
    }

    const filePath = path.join(__dirname, "..", "uploads", doc.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Fichier introuvable sur le serveur." });
    }
    return res.download(filePath, doc.file_name);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

module.exports = router;
