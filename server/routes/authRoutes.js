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
// Étudiant : jamais d'INSERT dans `users` ici — uniquement `student_pending_registrations`.
// L'INSERT dans `users` (role student) est réservé à PATCH /admin/students/:id/approve.
// Accept addresses ending with ".ac.ma" (e.g. nom@etu.univ.ac.ma).
const academicEmailRegex = /^[^\s@]+@[^\s@]*\.ac\.ma$/i;
const tokenTtlMinutes = Number(process.env.STUDENT_SIGNUP_TOKEN_TTL_MINUTES || 30);
const passwordResetTtlMinutes = Number(process.env.STUDENT_PASSWORD_RESET_TTL_MINUTES || 60);

let ensuredSignupTokensTable = false;
let ensuredPendingRegistrationsTable = false;
let ensuredPasswordResetTokensTable = false;

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

async function ensureStudentPendingRegistrationsTable() {
  if (ensuredPendingRegistrationsTable) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_pending_registrations (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  ensuredPendingRegistrationsTable = true;
}

async function ensureStudentPasswordResetTokensTable() {
  if (ensuredPasswordResetTokensTable) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_student_password_reset_user_active ON student_password_reset_tokens(user_id) WHERE used = false"
  );
  ensuredPasswordResetTokensTable = true;
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

function buildStudentPasswordResetLink(rawToken) {
  const fallbackOrigin = `http://localhost:${process.env.PORT || 5000}`;
  const appOrigin = (process.env.APP_BASE_URL || fallbackOrigin).replace(/\/$/, "");
  return `${appOrigin}/pages/student-reset-password.html?token=${encodeURIComponent(rawToken)}`;
}

async function sendPasswordResetEmail(recipientEmail, resetLink) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    console.warn("SMTP non configuré. Lien de réinitialisation (mode dev):", resetLink);
    return { delivered: false, fallbackLink: resetLink };
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
    subject: "Réinitialisation de votre mot de passe (plateforme ressources)",
    html: `
      <p>Bonjour,</p>
      <p>Vous avez demandé la réinitialisation du mot de passe de votre compte étudiant.</p>
      <p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>Ce lien expire dans ${passwordResetTtlMinutes} minute${passwordResetTtlMinutes > 1 ? "s" : ""}.</p>
      <p>Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>
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
    await ensureStudentPendingRegistrationsTable();
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Tous les champs sont obligatoires." });
    }

    if (!academicEmailRegex.test(email)) {
      return res.status(400).json({ message: "Utilisez un email académique qui se termine par .ac.ma." });
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Email déjà utilisé." });
    }

    const pendingRow = await pool.query("SELECT id FROM student_pending_registrations WHERE LOWER(email) = LOWER($1)", [
      email,
    ]);
    if (pendingRow.rows.length > 0) {
      return res.status(400).json({
        message: "Une demande d'inscription est déjà en attente pour cet email.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO student_pending_registrations (email, name, password_hash)
       VALUES ($1, $2, $3)`,
      [email.trim().toLowerCase(), name.trim(), hashedPassword]
    );

    return res.status(201).json({
      message:
        "Demande enregistrée. Votre compte sera créé lorsque l'administrateur aura validé votre inscription.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.post("/student/register/request-link", async (req, res) => {
  try {
    await ensureSignupTokensTable();
    await ensureStudentPendingRegistrationsTable();
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

    const pendingExisting = await pool.query(
      "SELECT id FROM student_pending_registrations WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    if (pendingExisting.rows.length > 0) {
      return res.status(400).json({
        message: "Une demande d'inscription est déjà en attente de validation pour cet email.",
      });
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
    await ensureStudentPendingRegistrationsTable();
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

    await client.query(
      `INSERT INTO student_pending_registrations (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         created_at = NOW()`,
      [String(email).trim().toLowerCase(), name, hashedPassword]
    );

    await client.query("UPDATE student_signup_tokens SET used = true WHERE id = $1", [tokenId]);
    await client.query("COMMIT");

    return res.status(201).json({
      message:
        "Inscription finalisée. Votre demande sera examinée : le compte ne sera créé qu'après validation par un administrateur.",
      registration: { name, email },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  } finally {
    client.release();
  }
});

const forgotPasswordStudentResponse =
  "Si un compte étudiant approuvé existe pour cet email, un message contenant un lien de réinitialisation vient d’être envoyé. Vérifiez votre boîte de réception et les courriers indésirables.";

router.post("/student/forgot-password", async (req, res) => {
  try {
    await ensureStudentPasswordResetTokensTable();
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email académique requis." });
    }
    if (!academicEmailRegex.test(email)) {
      return res.status(400).json({ message: "Utilisez un email académique qui se termine par .ac.ma." });
    }

    const userResult = await pool.query(
      `SELECT id FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
         AND LOWER(TRIM(COALESCE(role::text, ''))) = 'student'
         AND COALESCE(account_status::text, '') = 'approved'`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.json({ message: forgotPasswordStudentResponse });
    }

    const userId = userResult.rows[0].id;
    await pool.query(
      `UPDATE student_password_reset_tokens SET used = true WHERE user_id = $1 AND used = false`,
      [userId]
    );

    const rawToken = crypto.randomBytes(32).toString("hex");
    const resetLink = buildStudentPasswordResetLink(rawToken);
    await pool.query(
      `INSERT INTO student_password_reset_tokens (user_id, token, expires_at, used)
       VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval, false)`,
      [userId, rawToken, passwordResetTtlMinutes]
    );

    const payload = { message: forgotPasswordStudentResponse };

    let mailResult;
    try {
      mailResult = await sendPasswordResetEmail(email, resetLink);
    } catch (mailError) {
      console.error("Echec SMTP (forgot-password):", mailError.message);
      mailResult = { delivered: false, fallbackLink: resetLink, mailError: mailError.message };
    }

    if (!mailResult.delivered && mailResult.fallbackLink) {
      payload.devResetLink = mailResult.fallbackLink;
      payload.message =
        "SMTP non configuré ou envoi impossible. Utilisez le lien ci-dessous en mode test pour définir un nouveau mot de passe.";
      if (mailResult.mailError) {
        payload.smtpError = mailResult.mailError;
      }
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur.", error: error.message });
  }
});

router.get("/student/reset-password/verify-token", async (req, res) => {
  try {
    await ensureStudentPasswordResetTokensTable();
    const token = String(req.query?.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Token manquant." });
    }

    const result = await pool.query(
      `SELECT t.id, u.email
       FROM student_password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token = $1 AND t.used = false AND t.expires_at > NOW()`,
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

router.post("/student/reset-password", async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureStudentPasswordResetTokensTable();
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");

    if (!token || !password) {
      return res.status(400).json({ message: "Token et nouveau mot de passe requis." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caractères." });
    }

    await client.query("BEGIN");
    const tokenResult = await client.query(
      `SELECT t.id, t.user_id
       FROM student_password_reset_tokens t
       WHERE t.token = $1 AND t.used = false AND t.expires_at > NOW()
       FOR UPDATE`,
      [token]
    );
    if (tokenResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Lien invalide ou expiré." });
    }

    const { id: tokenRowId, user_id: userId } = tokenResult.rows[0];
    const hashedPassword = await bcrypt.hash(password, 10);
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashedPassword, userId]);
    await client.query("UPDATE student_password_reset_tokens SET used = true WHERE id = $1", [tokenRowId]);
    await client.query("COMMIT");

    return res.json({ message: "Mot de passe mis à jour. Vous pouvez vous connecter avec votre nouveau mot de passe." });
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
