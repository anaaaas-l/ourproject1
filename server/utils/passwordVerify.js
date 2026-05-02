const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/** bcrypt hashes always start with $2a$, $2b$, or $2y$ */
function looksLikeBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

function timingSafeStringEqual(a, b) {
  try {
    const bufA = Buffer.from(String(a), "utf8");
    const bufB = Buffer.from(String(b), "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verify password against value stored in DB (bcrypt hash or legacy plain text).
 * Returns { ok: boolean, wasPlainText: boolean }
 */
async function verifyStoredPassword(plainPassword, storedValue) {
  if (storedValue == null || storedValue === "") {
    return { ok: false, wasPlainText: false };
  }
  const stored = String(storedValue);
  if (looksLikeBcryptHash(stored)) {
    const ok = await bcrypt.compare(plainPassword, stored);
    return { ok, wasPlainText: false };
  }
  const ok = timingSafeStringEqual(plainPassword, stored);
  return { ok, wasPlainText: ok };
}

/**
 * Which column actually holds the credential (first non-empty), for safe UPDATE after migration.
 */
function pickPasswordSourceColumn(userRow) {
  const h = userRow.password_hash;
  const p = userRow.password;
  if (h !== undefined && h !== null && String(h).length > 0) return "password_hash";
  if (p !== undefined && p !== null && String(p).length > 0) return "password";
  return null;
}

module.exports = {
  looksLikeBcryptHash,
  verifyStoredPassword,
  pickPasswordSourceColumn,
  bcrypt,
};
