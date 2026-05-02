const express = require("express");
const pool = require("../config/db");
const { authRequired, adminRequired } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", async (_, res) => {
  try {
    const result = await pool.query("SELECT * FROM categories ORDER BY name ASC");
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.post("/", authRequired, adminRequired, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Nom de catégorie requis." });
    }

    const result = await pool.query("INSERT INTO categories (name) VALUES ($1) RETURNING *", [name]);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.put("/:id", authRequired, adminRequired, async (req, res) => {
  try {
    const { name } = req.body;
    const { id } = req.params;
    const result = await pool.query("UPDATE categories SET name = $1 WHERE id = $2 RETURNING *", [name, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.delete("/:id", authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM categories WHERE id = $1", [id]);
    return res.json({ message: "Catégorie supprimée." });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

module.exports = router;
