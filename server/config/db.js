const { Pool } = require("pg");
require("dotenv").config();

const hasConnectionString = Boolean(process.env.DATABASE_URL);

const pool = new Pool(
  hasConnectionString
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      }
);

pool.on("error", (error) => {
  console.error("Erreur PostgreSQL:", error.message);
});

module.exports = pool;
