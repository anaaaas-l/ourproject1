const express = require("express");
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");
const upload = require("../middleware/uploadMiddleware");
const { authRequired } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { search = "", categoryId = "", fileType = "" } = req.query;
    const ft = String(fileType || "").toLowerCase().trim();

    let query = `
      SELECT r.id, r.title, r.file_name, r.file_path, r.download_count, r.like_count, r.status, r.created_at,
             c.id AS category_id, c.name AS category_name, u.name AS uploader_name
      FROM resources r
      JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.user_id = u.id
      WHERE r.status = 'approved'
    `;
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      query += ` AND (
        LOWER(r.title) LIKE LOWER($${values.length})
        OR LOWER(c.name) LIKE LOWER($${values.length})
        OR LOWER(r.file_name) LIKE LOWER($${values.length})
        OR LOWER(u.name) LIKE LOWER($${values.length})
      )`;
    }

    if (categoryId) {
      values.push(categoryId);
      query += ` AND r.category_id = $${values.length}`;
    }

    if (ft === "pdf") {
      query += ` AND LOWER(r.file_name) LIKE '%.pdf'`;
    } else if (ft === "word") {
      query += ` AND (LOWER(r.file_name) LIKE '%.doc' OR LOWER(r.file_name) LIKE '%.docx')`;
    } else if (ft === "image") {
      query += ` AND (
        LOWER(r.file_name) LIKE '%.png'
        OR LOWER(r.file_name) LIKE '%.jpg'
        OR LOWER(r.file_name) LIKE '%.jpeg'
        OR LOWER(r.file_name) LIKE '%.webp'
      )`;
    }

    query += " ORDER BY r.created_at DESC";

    const result = await pool.query(query, values);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.get("/pending", authRequired, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé aux admins." });
  }

  try {
    const result = await pool.query(`
      SELECT r.id, r.title, r.file_name, r.file_path, r.status, r.created_at,
             c.name AS category_name, u.name AS uploader_name
      FROM resources r
      JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.user_id = u.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.post("/", authRequired, upload.single("file"), async (req, res) => {
  try {
    const { title, categoryId } = req.body;
    if (!title || !categoryId || !req.file) {
      return res.status(400).json({ message: "Titre, catégorie et fichier sont obligatoires." });
    }

    const result = await pool.query(
      `INSERT INTO resources (title, category_id, user_id, file_name, file_path, status, download_count, like_count)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0)
       RETURNING *`,
      [title, categoryId, req.user.id, req.file.originalname, req.file.filename, "pending"]
    );

    return res.status(201).json({
      message: "Fichier envoyé. En attente de validation admin.",
      resource: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

function isPdfFileName(name) {
  return String(name || "").toLowerCase().endsWith(".pdf");
}

router.get("/:id/view", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM resources WHERE id = $1 AND status = 'approved'", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ressource introuvable." });
    }

    const resource = result.rows[0];
    if (!isPdfFileName(resource.file_name)) {
      return res.status(400).json({ message: "Seuls les fichiers PDF peuvent être affichés dans le navigateur." });
    }

    const filePath = path.join(__dirname, "..", "uploads", resource.file_path);
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

router.get("/:id/download", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM resources WHERE id = $1 AND status = 'approved'", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ressource introuvable." });
    }

    const resource = result.rows[0];
    const filePath = path.join(__dirname, "..", "uploads", resource.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Fichier introuvable sur le serveur." });
    }

    await pool.query("UPDATE resources SET download_count = download_count + 1 WHERE id = $1", [id]);
    return res.download(filePath, resource.file_name);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.post("/:id/like", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE resources SET like_count = like_count + 1 WHERE id = $1 AND status = 'approved' RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ressource introuvable." });
    }
    return res.json({ message: "Like ajouté.", resource: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé aux admins." });
  }

  try {
    const { id } = req.params;
    const result = await pool.query("SELECT file_path FROM resources WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ressource introuvable." });
    }

    const filePath = path.join(__dirname, "..", "uploads", result.rows[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await pool.query("DELETE FROM resources WHERE id = $1", [id]);
    return res.json({ message: "Ressource supprimée." });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

module.exports = router;
