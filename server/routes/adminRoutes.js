const express = require("express");
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");
const { authRequired, adminRequired } = require("../middleware/authMiddleware");

const router = express.Router();

async function ensureStudentSharedDocumentsTable() {
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

async function ensureStudentPendingRegistrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_pending_registrations (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

router.get("/student-documents", authRequired, adminRequired, async (_, res) => {
  try {
    await ensureStudentSharedDocumentsTable();
    const result = await pool.query(
      `SELECT d.id, d.title, d.file_name, d.created_at, d.visibility, d.access_code,
              u.id AS uploader_id, u.name AS uploader_name, u.email AS uploader_email,
              d.category_id, c.name AS category_name
       FROM student_shared_documents d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN categories c ON c.id = d.category_id
       ORDER BY d.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.delete("/student-documents/:id", authRequired, adminRequired, async (req, res) => {
  try {
    await ensureStudentSharedDocumentsTable();
    const numericId = Number(req.params.id);
    if (!Number.isInteger(numericId) || numericId < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }
    const result = await pool.query("SELECT file_path FROM student_shared_documents WHERE id = $1", [numericId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Document introuvable." });
    }
    const filePath = path.join(__dirname, "..", "uploads", result.rows[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await pool.query("DELETE FROM student_shared_documents WHERE id = $1", [numericId]);
    return res.json({ message: "Document supprimé." });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.get("/students", authRequired, adminRequired, async (_, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, COALESCE(account_status::text, '') AS account_status
       FROM users
       WHERE LOWER(TRIM(COALESCE(role::text, ''))) = 'student'
       ORDER BY LOWER(name) ASC, id ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.delete("/students/:id", authRequired, adminRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const numericId = Number(req.params.id);
    if (!Number.isInteger(numericId) || numericId < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id FROM users WHERE id = $1 AND LOWER(TRIM(COALESCE(role::text, ''))) = 'student' FOR UPDATE`,
      [numericId]
    );
    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Étudiant introuvable." });
    }

    await client.query("DELETE FROM student_shared_documents WHERE user_id = $1", [numericId]);
    await client.query("DELETE FROM resources WHERE user_id = $1", [numericId]);
    await client.query("DELETE FROM users WHERE id = $1", [numericId]);
    await client.query("COMMIT");
    return res.json({ message: "Étudiant supprimé." });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  } finally {
    client.release();
  }
});

router.get("/students/pending", authRequired, adminRequired, async (_, res) => {
  try {
    await ensureStudentPendingRegistrationsTable();
    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM student_pending_registrations
       ORDER BY created_at ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.patch("/students/:id/approve", authRequired, adminRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureStudentPendingRegistrationsTable();
    const { id } = req.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId < 1) {
      return res.status(400).json({ message: "Identifiant invalide." });
    }

    await client.query("BEGIN");
    const pending = await client.query(
      `SELECT id, email, name, password_hash
       FROM student_pending_registrations
       WHERE id = $1
       FOR UPDATE`,
      [numericId]
    );
    if (pending.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Demande d'inscription introuvable ou déjà traitée." });
    }

    const row = pending.rows[0];
    const dupUser = await client.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [row.email]);
    if (dupUser.rows.length > 0) {
      await client.query("DELETE FROM student_pending_registrations WHERE id = $1", [numericId]);
      await client.query("COMMIT");
      return res.status(409).json({ message: "Un compte existe déjà pour cet email. La demande en attente a été retirée." });
    }

    // Seul ce chemin crée une ligne étudiant dans `users` (après validation admin).
    const inserted = await client.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES ($1, $2, $3, 'student', 'approved')
       RETURNING id, name, email, role, account_status`,
      [row.name, row.email, row.password_hash]
    );

    await client.query("DELETE FROM student_pending_registrations WHERE id = $1", [numericId]);
    await client.query("COMMIT");

    return res.json({ message: "Compte étudiant créé et approuvé.", student: inserted.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  } finally {
    client.release();
  }
});

router.patch("/resources/:id/approve", authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("UPDATE resources SET status = 'approved' WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ressource introuvable." });
    }
    return res.json({ message: "Ressource approuvée.", resource: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

module.exports = router;
