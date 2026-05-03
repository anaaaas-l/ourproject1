const express = require("express");
const pool = require("../config/db");
const { authRequired, adminRequired } = require("../middleware/authMiddleware");

const router = express.Router();

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

router.get("/stats", authRequired, adminRequired, async (_, res) => {
  try {
    const totalFilesResult = await pool.query("SELECT COUNT(*)::int AS total_files FROM resources");
    const downloadResult = await pool.query("SELECT COALESCE(SUM(download_count), 0)::int AS total_downloads FROM resources");

    return res.json({
      totalFiles: totalFilesResult.rows[0].total_files,
      totalDownloads: downloadResult.rows[0].total_downloads,
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

module.exports = router;
