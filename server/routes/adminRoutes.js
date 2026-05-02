const express = require("express");
const pool = require("../config/db");
const { authRequired, adminRequired } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/students/pending", authRequired, adminRequired, async (_, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE role = 'student' AND account_status = 'pending'
       ORDER BY created_at ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.patch("/students/:id/approve", authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE users SET account_status = 'approved' WHERE id = $1 AND role = 'student' RETURNING id, name, email, account_status",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Étudiant introuvable." });
    }
    return res.json({ message: "Compte étudiant approuvé.", student: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
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
