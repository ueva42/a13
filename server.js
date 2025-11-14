// ==========================================
// server.js – Temple of Logic (AUTO-FIX VERSION)
// ==========================================

import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

// DB --------------------------------------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function query(q, params) {
  const client = await pool.connect();
  try {
    return await client.query(q, params);
  } finally {
    client.release();
  }
}

// PATHS -----------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadFolder = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

// ------------------------------------------
// MIGRATION (inkl. AUTO-FIX für Missions)
// ------------------------------------------
async function migrate() {
  console.log("Starte Migration…");

  // CLASSES
  await query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
  `);

  // USERS
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      xp INTEGER DEFAULT 0,
      highest_xp INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // *** MISSIONS AUTO-FIX ***
  // DROP alte Tabelle falls falsche Spalten existieren
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='missions'
        AND column_name NOT IN ('id','title','xp_reward','image_url','requires_upload','created_at')
      ) THEN
        DROP TABLE missions;
      END IF;
    END $$;
  `);

  // MISSIONS (korrekt)
  await query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      xp_reward INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      requires_upload BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // DEFAULT ADMIN
  await query(`
    INSERT INTO users (name, password, role)
    VALUES ('admin','admin','admin')
    ON CONFLICT (name) DO NOTHING;
  `);

  console.log("Migration abgeschlossen.");
}

// ------------------------------------
// EXPRESS APP
// ------------------------------------
const app = express();

app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------
// LOGIN
// ----------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  const { name, password } = req.body;

  const r = await query("SELECT * FROM users WHERE name=$1 AND password=$2", [
    name,
    password,
  ]);

  if (!r.rows[0]) {
    return res.status(400).json({ error: "Login fehlgeschlagen" });
  }

  res.json({
    id: r.rows[0].id,
    name: r.rows[0].name,
    role: r.rows[0].role,
  });
});

// ----------------------------------------------------
// KLASSEN
// ----------------------------------------------------
app.get("/api/admin/classes", async (req, res) => {
  const classes = await query("SELECT id, name FROM classes ORDER BY name ASC");
  res.json({ classes: classes.rows });
});

app.post("/api/admin/classes", async (req, res) => {
  const { name } = req.body;
  try {
    await query("INSERT INTO classes (name) VALUES ($1)", [name]);
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Klasse existiert bereits" });
  }
});

app.delete("/api/admin/classes/:id", async (req, res) => {
  await query("DELETE FROM classes WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ----------------------------------------------------
// MISSIONEN
// ----------------------------------------------------
app.get("/api/admin/missions", async (req, res) => {
  const r = await query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/missions", async (req, res) => {
  const title = req.body.title;
  const xp = Number(req.body.xp_reward);
  const requiresUpload = req.body.requires_upload === "true";

  if (!title || !xp) {
    return res.status(400).json({ error: "Titel und XP benötigt" });
  }

  let imageUrl = null;

  if (req.files && req.files.image) {
    const img = req.files.image;
    const filename = "mission_" + Date.now() + "_" + img.name;
    const dest = path.join(uploadFolder, filename);
    await img.mv(dest);
    imageUrl = "/uploads/" + filename;
  }

  await query(
    `INSERT INTO missions (title, xp_reward, image_url, requires_upload)
     VALUES ($1,$2,$3,$4)`,
    [title, xp, imageUrl, requiresUpload]
  );

  res.json({ success: true });
});

app.delete("/api/admin/missions/:id", async (req, res) => {
  await query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ----------------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// START ----------------------------------------------
migrate().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
});
