const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const pool = require("../config/db");
const {
  verifyStoredPassword,
  pickPasswordSourceColumn,
  bcrypt: bcryptLib,
} = require("../utils/passwordVerify");

const router = express.Router();
// Accept addresses ending with ".ac.ma" (e.g. nom@etu.univ.ac.ma).
const academicEmailRegex = /^[^\s@]+@[^\s@]*\.ac\.ma$/i;
const tokenTtlMinutes = Number(process.env.STUDENT_SIGNUP_TOKEN_TTL_MINUTES || 30);

let ensuredSignupTokensTable = false;

async function ensureSignupTokensTable() {
  if (ensuredSignupTokensTable) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_signup_tokens (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_student_signup_tokens_email ON student_signup_tokens(email)"
  );
  ensuredSignupTokensTable = true;
}

function buildStudentSignupLink(token) {
  const fallbackOrigin = `http://localhost:${process.env.PORT || 5000}`;
  const appOrigin = (process.env.APP_BASE_URL || fallbackOrigin).replace(/\/$/, "");
  return `${appOrigin}/pages/student-register-complete.html?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(recipientEmail, verificationLink) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    // Keep developer flow unblocked when SMTP is not configured.
    console.warn("SMTP non configuré. Lien de validation (mode dev):", verificationLink);
    return { delivered: false, fallbackLink: verificationLink };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: recipientEmail,
    subject: "Validation de votre email académique",
    html: `
      <p>Bonjour,</p>
      <p>Veuillez cliquer sur le lien ci-dessous pour continuer votre inscription étudiante :</p>
      <p><a href="${verificationLink}">${verificationLink}</a></p>
      <p>Ce lien expire dans ${tokenTtlMinutes} minutes.</p>
    `,
  });
  return { delivered: true };
}

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

router.post("/student/register/request-link", async (req, res) => {
  try {
    await ensureSignupTokensTable();
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email académique requis." });
    }
    if (!academicEmailRegex.test(email)) {
      return res.status(400).json({ message: "Utilisez un email académique qui se termine par .ac.ma." });
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Un compte existe déjà avec cet email." });
    }

    await pool.query("UPDATE student_signup_tokens SET used = true WHERE LOWER(email) = LOWER($1) AND used = false", [
      email,
    ]);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const verificationLink = buildStudentSignupLink(rawToken);
    await pool.query(
      `INSERT INTO student_signup_tokens (email, token, expires_at, used)
       VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval, false)`,
      [email, rawToken, tokenTtlMinutes]
    );

    let mailResult;
    try {
      mailResult = await sendVerificationEmail(email, verificationLink);
    } catch (mailError) {
      console.error("Echec SMTP (request-link):", mailError.message);
      mailResult = { delivered: false, fallbackLink: verificationLink, mailError: mailError.message };
    }
    const payload = {
      message: "Lien de vérification envoyé. Vérifiez votre email académique.",
    };

    if (!mailResult.delivered && mailResult.fallbackLink) {
      payload.devVerificationLink = mailResult.fallbackLink;
      payload.message =
        "SMTP non configuré. Utilisez le lien de validation renvoyé par l'API pour continuer en mode test.";
      if (mailResult.mailError) {
        payload.smtpError = mailResult.mailError;
      }
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.get("/student/register/verify-token", async (req, res) => {
  try {
    await ensureSignupTokensTable();
    const token = String(req.query?.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Token de validation manquant." });
    }

    const result = await pool.query(
      `SELECT id, email
       FROM student_signup_tokens
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Lien invalide ou expiré." });
    }

    return res.json({ valid: true, email: result.rows[0].email });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.post("/student/register/complete", async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureSignupTokensTable();
    const token = String(req.body?.token || "").trim();
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");

    if (!token || !name || !password) {
      return res.status(400).json({ message: "Token, nom et mot de passe sont requis." });
    }

    await client.query("BEGIN");
    const tokenResult = await client.query(
      `SELECT id, email
       FROM student_signup_tokens
       WHERE token = $1 AND used = false AND expires_at > NOW()
       FOR UPDATE`,
      [token]
    );
    if (tokenResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Lien invalide ou expiré." });
    }

    const { id: tokenId, email } = tokenResult.rows[0];
    const existingUser = await client.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Un compte existe déjà avec cet email." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const createdUser = await client.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES ($1, $2, $3, 'student', 'pending')
       RETURNING id, name, email, role, account_status`,
      [name, email, hashedPassword]
    );

    await client.query("UPDATE student_signup_tokens SET used = true WHERE id = $1", [tokenId]);
    await client.query("COMMIT");

    return res.status(201).json({
      user: createdUser.rows[0],
      message: "Inscription finalisée. Votre compte étudiant est en attente de validation admin.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  } finally {
    client.release();
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
