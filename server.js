import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fileUpload from "express-fileupload";
import { query } from "./db.js"; 

// ROUTES
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import studentRoutes from "./routes/student.js";

dotenv.config();

const app = express();

// MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static("public"));

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentRoutes);

// ROOT
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "views" });
});


// ----------------------------------------------------------
// 🔥 FULL AUTOMATIC DATABASE MIGRATION
// ----------------------------------------------------------

async function migrate() {
  console.log("🔧 Starte Datenbank-Migration ...");

  const steps = [

    // USERS
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      xp INTEGER DEFAULT 0,
      highest_xp INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );`,

    // CLASSES
    `CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );`,

    // MISSIONS
    `CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      xp_reward INTEGER NOT NULL DEFAULT 0
    );`,

    // STUDENT UPLOADS
    `CREATE TABLE IF NOT EXISTS student_mission_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      file_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );`,

    // XP TRANSACTIONS
    `CREATE TABLE IF NOT EXISTS xp_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      awarded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );`,

    // DEFAULT ADMIN
    `INSERT INTO users (name, password, role)
     VALUES ('admin', 'admin', 'admin')
     ON CONFLICT (name) DO NOTHING;`
  ];

  for (const sql of steps) {
    const firstLine = sql.split("\n")[0].trim();
    console.log("➡️  Führe aus:", firstLine);
    await query(sql);
  }

  console.log("✅ Migration abgeschlossen!");
}

// ----------------------------------------------------------
// START SERVER AFTER MIGRATION
// ----------------------------------------------------------

const PORT = process.env.PORT || 8080;

migrate()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`🚀 Server läuft auf Port ${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ Migration fehlgeschlagen:", err);
    process.exit(1);
  });
