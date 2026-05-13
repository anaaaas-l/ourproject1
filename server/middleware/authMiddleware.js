const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token manquant." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalide." });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé aux admins." });
  }
  next();
}

function studentRequired(req, res, next) {
  if (!req.user || req.user.role !== "student") {
    return res.status(403).json({ message: "Accès réservé aux étudiants." });
  }
  next();
}

function studentOrAdminRequired(req, res, next) {
  if (!req.user) {
    return res.status(403).json({ message: "Authentification requise." });
  }
  const role = req.user.role;
  if (role === "student" || role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Accès réservé aux étudiants et administrateurs." });
}

module.exports = {
  authRequired,
  adminRequired,
  studentRequired,
  studentOrAdminRequired,
};
