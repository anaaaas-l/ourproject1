const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const {
  verifyStoredPassword,
  pickPasswordSourceColumn,
  bcrypt: bcryptLib,
} = require("../utils/passwordVerify");

const router = express.Router();
// Accept addresses ending with ".ac.ma" (e.g. nom@etu.univ.ac.ma).
const academicEmailRegex = /^[^\s@]+@[^\s@]*\.ac\.ma$/i;

/** Admin row may store secret in password_hash or password (legacy apps). */
function resolveStoredPassword(row) {
  const h = row.password_hash;
  const p = row.password;
  if (h !== undefined && h !== null && String(h).length > 0) return String(h);
  if (p !== undefined && p !== null && String(p).length > 0) return String(p);
  return null;
}

router.post("/student/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Tous les champs sont obligatoires." });
    }

    if (!academicEmailRegex.test(email)) {
      return res.status(400).json({ message: "Utilisez un email académique qui se termine par .ac.ma." });
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Email déjà utilisé." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, account_status`,
      [name, email, hashedPassword, "student", "pending"]
    );

    return res.status(201).json({
      user: result.rows[0],
      message: "Compte étudiant créé. Veuillez attendre la validation de l'administrateur.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.post("/student/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query("SELECT * FROM users WHERE email = $1 AND role = 'student'", [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Identifiants invalides." });
    }

    const user = userResult.rows[0];
    if (user.account_status !== "approved") {
      return res.status(403).json({ message: "Compte étudiant en attente de validation par l'administrateur." });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ message: "Identifiants invalides." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

// Admin: users table, match by username (case-insensitive) and admin role (case-insensitive).
router.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Nom d'utilisateur et mot de passe requis." });
    }

    const userResult = await pool.query(
      `SELECT * FROM users
       WHERE LOWER(TRIM(COALESCE(role::text, ''))) = 'admin'
         AND LOWER(TRIM(COALESCE(username::text, ''))) = LOWER(TRIM($1::text))`,
      [String(username).trim()]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Identifiants admin invalides." });
    }

    const user = userResult.rows[0];
    const storedSecret = resolveStoredPassword(user);
    if (!storedSecret) {
      return res.status(500).json({ message: "Configuration utilisateur invalide (mot de passe manquant)." });
    }

    const { ok, wasPlainText } = await verifyStoredPassword(password, storedSecret);
    if (!ok) {
      return res.status(400).json({ message: "Identifiants admin invalides." });
    }

    // Upgrade legacy plain-text password to bcrypt in the same column we read from.
    if (wasPlainText && user.id) {
      const col = pickPasswordSourceColumn(user);
      const newHash = await bcryptLib.hash(password, 10);
      if (col === "password_hash") {
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, user.id]);
      } else if (col === "password") {
        await pool.query('UPDATE users SET "password" = $1 WHERE id = $2', [newHash, user.id]);
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

module.exports = router;
