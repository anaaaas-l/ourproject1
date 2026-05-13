const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const pool = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const studentDocumentRoutes = require("./routes/studentDocumentRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/student-documents", studentDocumentRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_, res) => {
  res.json({ message: "API Plateforme de Partage de Ressources active." });
});

async function startServer() {
  const skipDb = process.env.SKIP_DB_CHECK === "true";
  if (!skipDb) {
    try {
      await pool.query("SELECT 1");
    } catch (error) {
      console.error("Connexion PostgreSQL échouée:", error.message);
      console.error(
        "Astuce: pour tester les pages statiques sans base, définissez SKIP_DB_CHECK=true dans .env"
      );
      process.exit(1);
    }
  } else {
    console.warn(
      "SKIP_DB_CHECK=true: démarrage sans vérification PostgreSQL (API et auth nécessitent une DB)."
    );
  }
  app.listen(port, () => {
    console.log(`Serveur lancé sur http://localhost:${port}`);
  });
}

startServer();
