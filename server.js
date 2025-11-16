// ===============================
// FINAL server.js TEMPLE OF LOGIC
// ===============================

import express from "express";
import pkg from "pg";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const { Pool } = pkg;

// --------------------------------------
// Pfad-Fix (wegen ES Module)
// --------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------
// Express
// --------------------------------------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// --------------------------------------
// PostgreSQL
// --------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function query(q, params = []) {
  const res = await pool.query(q, params);
  return res.rows;
}

// --------------------------------------
// Cloudflare R2 Client
// --------------------------------------
let r2Enabled = true;

if (
  !process.env.R2_ACCESS_KEY_ID ||
  !process.env.R2_SECRET_ACCESS_KEY ||
  !process.env.R2_ACCOUNT_ID ||
  !process.env.R2_BUCKET_NAME
) {
  console.log("R2: NICHT KONFIGURIERT → Uploads gehen ohne Bild weiter.");
  r2Enabled = false;
}

let s3 = null;

if (r2Enabled) {
  s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
}

// --------------------------------------
// Multer: File im RAM halten
// --------------------------------------
const upload = multer({ storage: multer.memoryStorage() });

// --------------------------------------
// Tabelle sicherstellen (keine Auto-Daten!)
// --------------------------------------
async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS levels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp_required INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      xp_reward INTEGER NOT NULL,
      requires_upload BOOLEAN DEFAULT false,
      image_url TEXT
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bonuscards (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      xp_cost INTEGER NOT NULL,
      image_url TEXT
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT
    );
  `);
}

await migrate();
console.log("Migration abgeschlossen.");

// --------------------------------------
// R2 Upload Helper
// --------------------------------------
async function uploadToR2(fileBuffer, originalName) {
  if (!r2Enabled) return null;

  try {
    const key = crypto.randomBytes(16).toString("hex") + "-" + originalName;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
      })
    );

    return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
  } catch (err) {
    console.log("R2 FEHLER:", err);
    return null;
  }
}

// ===================================================================
// ADMIN ENDPOINTS
// ===================================================================

// ---------------- LEVELS ----------------
app.get("/api/admin/levels", async (req, res) => {
  const rows = await query(`SELECT * FROM levels ORDER BY xp_required ASC`);
  res.json(rows);
});

app.post("/api/admin/levels", async (req, res) => {
  const { name, xp_required } = req.body;

  if (!name || !xp_required) {
    return res.status(400).json({ error: "Name und XP sind erforderlich" });
  }

  const rows = await query(
    `INSERT INTO levels (name, xp_required) VALUES ($1,$2) RETURNING *`,
    [name, xp_required]
  );

  res.json(rows[0]);
});

app.delete("/api/admin/levels/:id", async (req, res) => {
  await query(`DELETE FROM levels WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
});

// ---------------- MISSIONS ----------------
app.get("/api/admin/missions", async (req, res) => {
  const rows = await query(`SELECT * FROM missions ORDER BY id DESC`);
  res.json(rows);
});

app.post(
  "/api/admin/missions",
  upload.single("image"),
  async (req, res) => {
    let image_url = null;

    if (req.file) {
      image_url = await uploadToR2(req.file.buffer, req.file.originalname);
    }

    const { title, xp_reward, requires_upload } = req.body;

    const rows = await query(
      `INSERT INTO missions (title, xp_reward, requires_upload, image_url)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [title, xp_reward, requires_upload === "on", image_url]
    );

    res.json(rows[0]);
  }
);

app.delete("/api/admin/missions/:id", async (req, res) => {
  await query(`DELETE FROM missions WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
});

// ---------------- BONUSKARTEN ----------------
app.get("/api/admin/bonus", async (req, res) => {
  const rows = await query(`SELECT * FROM bonuscards ORDER BY id DESC`);
  res.json(rows);
});

app.post(
  "/api/admin/bonus",
  upload.single("image"),
  async (req, res) => {
    let image_url = null;
    if (req.file) {
      image_url = await uploadToR2(req.file.buffer, req.file.originalname);
    }

    const { title, xp_cost } = req.body;

    const rows = await query(
      `INSERT INTO bonuscards (title, xp_cost, image_url)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [title, xp_cost, image_url]
    );

    res.json(rows[0]);
  }
);

app.delete("/api/admin/bonus/:id", async (req, res) => {
  await query(`DELETE FROM bonuscards WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
});

// ---------------- CHARACTERS ----------------
app.get("/api/admin/characters", async (req, res) => {
  const rows = await query(`SELECT * FROM characters ORDER BY id DESC`);
  res.json(rows);
});

app.post(
  "/api/admin/characters",
  upload.single("image"),
  async (req, res) => {
    let image_url = null;

    if (req.file) {
      image_url = await uploadToR2(req.file.buffer, req.file.originalname);
    }

    const { name } = req.body;

    const rows = await query(
      `INSERT INTO characters (name, image_url)
       VALUES ($1,$2)
       RETURNING *`,
      [name, image_url]
    );

    res.json(rows[0]);
  }
);

app.delete("/api/admin/characters/:id", async (req, res) => {
  await query(`DELETE FROM characters WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
});

// ===================================================================
// ROUTING — absolut stabil (keine Wildcard!)
// ===================================================================
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/login.html"))
);

app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "public/admin.html"))
);

app.get("/student", (req, res) =>
  res.sendFile(path.join(__dirname, "public/student.html"))
);

// ===================================================================
// SERVER START
// ===================================================================
app.listen(8080, () =>
  console.log("Server läuft auf Port 8080")
);
