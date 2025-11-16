// server.js – Railway-safe, R2-sicher, fehlerfest

import express from "express";
import cors from "cors";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import pkg from "pg";
const { Pool } = pkg;
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// ============================================================
// Pfade fixen
// ============================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// EXPRESS
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const upload = multer({ storage: multer.memoryStorage() });

// ============================================================
// DATABASE
// ============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function query(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ============================================================
// R2 – Environment Checking
// ============================================================
const REQUIRED_R2_VARS = [
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL"
];

function checkR2Env() {
  const missing = REQUIRED_R2_VARS.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.log("❌ R2 ENV ERROR – folgende Variablen fehlen:");
    missing.forEach(v => console.log("   ➤ " + v));

    console.log("\nℹ Hinweis:");
    console.log("   → In Railway müssen **ALLE** diese Variablen als Shared Variable gesetzt sein.");
    console.log("   → Anders lädt Railpack sie im Build nicht.");

    return false;
  }

  console.log("✅ R2-Konfiguration vollständig geladen.");
  return true;
}

const R2_ENABLED = checkR2Env();

// ============================================================
// R2 CLIENT optional initialisieren
// ============================================================
let r2 = null;

if (R2_ENABLED) {
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
}

// ============================================================
// R2 UPLOAD FUNCTION
// ============================================================
async function uploadToR2(buffer, filename, mimetype) {
  if (!R2_ENABLED) return null;

  const Key = `uploads/${Date.now()}-${filename}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key,
      Body: buffer,
      ContentType: mimetype
    })
  );

  return `${process.env.R2_PUBLIC_BASE_URL}/${Key}`;
}

// ============================================================
// MIGRATION
// ============================================================
async function migrate() {
  console.log("🔧 Starte Migration…");

  await query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'student',
      xp INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      xp_reward INTEGER NOT NULL,
      requires_upload BOOLEAN DEFAULT false,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bonus (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      xp_cost INTEGER NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS student_uploads (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mission_id INTEGER REFERENCES missions(id) ON DELETE CASCADE,
      file_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      required_xp INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log("✅ Migration abgeschlossen.");
}

// ============================================================
// LOGIN
// ============================================================
app.post("/api/login", async (req, res) => {
  const { name, password } = req.body;

  const r = await query(
    "SELECT * FROM users WHERE name=$1 AND password=$2",
    [name, password]
  );

  if (!r[0]) return res.status(400).json({ error: "Login fehlgeschlagen" });

  res.json({
    id: r[0].id,
    role: r[0].role,
    name: r[0].name
  });
});

// ============================================================
// ADMIN – CLASSES
// ============================================================
app.get("/api/admin/classes", async (req, res) => {
  const classes = await query("SELECT * FROM classes ORDER BY id ASC");
  res.json({ classes });
});

app.post("/api/admin/classes", async (req, res) => {
  await query("INSERT INTO classes(name) VALUES($1)", [req.body.name]);
  res.json({ ok: true });
});

app.delete("/api/admin/classes/:id", async (req, res) => {
  await query("DELETE FROM classes WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// ADMIN – STUDENTS
// ============================================================
app.get("/api/admin/students/:classId", async (req, res) => {
  const s = await query("SELECT * FROM users WHERE class_id=$1 ORDER BY id ASC", [
    req.params.classId
  ]);
  res.json(s);
});

app.post("/api/admin/students", async (req, res) => {
  const { name, password, class_id } = req.body;
  await query(
    "INSERT INTO users(name, password, class_id, role) VALUES($1,$2,$3,'student')",
    [name, password, class_id]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/students/:id", async (req, res) => {
  await query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// ADMIN – MISSIONS
// ============================================================
app.get("/api/admin/missions", async (req, res) => {
  const m = await query("SELECT * FROM missions ORDER BY id ASC");
  res.json(m);
});

app.post("/api/admin/missions", upload.single("image"), async (req, res) => {
  let image_url = null;
  if (req.file) {
    image_url = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
  }

  const { title, xp_reward, requires_upload } = req.body;

  await query(
    "INSERT INTO missions(title, xp_reward, requires_upload, image_url) VALUES($1,$2,$3,$4)",
    [title, xp_reward, requires_upload === "on", image_url]
  );

  res.json({ ok: true });
});

// ============================================================
// ADMIN – BONUS
// ============================================================
app.get("/api/admin/bonus", async (req, res) => {
  const b = await query("SELECT * FROM bonus ORDER BY id ASC");
  res.json(b);
});

app.post("/api/admin/bonus", upload.single("image"), async (req, res) => {
  let image_url = null;
  if (req.file) {
    image_url = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
  }

  await query(
    "INSERT INTO bonus(title, xp_cost, image_url) VALUES($1,$2,$3)",
    [req.body.title, req.body.xp_cost, image_url]
  );

  res.json({ ok: true });
});

// ============================================================
// ADMIN – CHARACTERS
// ============================================================
app.get("/api/admin/characters", async (req, res) => {
  const c = await query("SELECT * FROM characters ORDER BY id ASC");
  res.json(c);
});

app.post("/api/admin/characters", upload.single("image"), async (req, res) => {
  let image_url = null;
  if (req.file) {
    image_url = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
  }

  await query(
    "INSERT INTO characters(name, image_url) VALUES($1,$2)",
    [req.body.name, image_url]
  );

  res.json({ ok: true });
});

// ============================================================
// ADMIN – LEVELS
// ============================================================
app.get("/api/admin/levels", async (req, res) => {
  const l = await query("SELECT * FROM levels ORDER BY required_xp ASC");
  res.json(l);
});

app.post("/api/admin/levels", async (req, res) => {
  const { name, required_xp } = req.body;
  await query(
    "INSERT INTO levels(name, required_xp) VALUES($1,$2)",
    [name, required_xp]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/levels/:id", async (req, res) => {
  await query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 8080;

await migrate();

app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});
