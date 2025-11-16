// server.js – FINAL VERSION (Railway + R2 + XP + Level 0 Allowed)

import express from "express";
import session from "express-session";
import pg from "pg";
import multer from "multer";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------
// STATIC FILES
// -----------------------------
app.use(express.static("public"));

// -----------------------------
// SESSION
// -----------------------------
app.use(
  session({
    secret: "tol-super-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// -----------------------------
// POSTGRES
// -----------------------------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper query
async function query(q, p = []) {
  const r = await pool.query(q, p);
  return r;
}

// -----------------------------
// R2 CONFIG
// -----------------------------
const R2_ENABLED =
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_BUCKET_NAME &&
  process.env.R2_PUBLIC_BASE_URL;

let r2 = null;

if (R2_ENABLED) {
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// -----------------------------
// MULTER (in Memory)
// -----------------------------
const upload = multer({ storage: multer.memoryStorage() });

// -----------------------------
// MIGRATION: CREATE TABLES
// -----------------------------
async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS characters(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bonuscards(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS missions(
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      xp INT NOT NULL DEFAULT 0,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS levels(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      xp_required INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
}

await migrate();

// -----------------------------
// HELPERS
// -----------------------------

async function uploadToR2(file, folderName) {
  if (!R2_ENABLED) return null;

  const key = `${folderName}/${Date.now()}-${file.originalname}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}

// -----------------------------
// AUTH
// -----------------------------
function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.post("/api/login", async (req, res) => {
  const { user, pass } = req.body;

  if (user === "admin" && pass === "toladmin") {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "wrong" });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.redirect("/login.html");
});

// -----------------------------
// ADMIN – LEVELS
// -----------------------------
app.get("/api/admin/levels", requireAdmin, async (req, res) => {
  const r = await query("SELECT * FROM levels ORDER BY xp_required ASC");
  res.json(r.rows);
});

app.post("/api/admin/levels", requireAdmin, async (req, res) => {
  const { name, xp_required } = req.body;

  if (!name) return res.status(400).json({ error: "Name missing" });
  if (xp_required < 0 || xp_required === "" || xp_required === null)
    return res.status(400).json({ error: "XP missing" });

  const r = await query(
    "INSERT INTO levels(name, xp_required) VALUES($1,$2) RETURNING *",
    [name, xp_required]
  );
  res.json(r.rows[0]);
});

app.delete("/api/admin/levels/:id", requireAdmin, async (req, res) => {
  await query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -----------------------------
// ADMIN – CHARACTERS
// -----------------------------
app.get("/api/admin/characters", requireAdmin, async (req, res) => {
  const r = await query("SELECT * FROM characters ORDER BY id ASC");
  res.json(r.rows);
});

app.post(
  "/api/admin/characters",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    const name = req.body.name;
    if (!name) return res.status(400).json({ error: "Name fehlt" });

    let img = null;
    if (req.file) img = await uploadToR2(req.file, "characters");

    const r = await query(
      "INSERT INTO characters(name,image_url) VALUES($1,$2) RETURNING *",
      [name, img]
    );

    res.json(r.rows[0]);
  }
);

app.delete("/api/admin/characters/:id", requireAdmin, async (req, res) => {
  await query("DELETE FROM characters WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -----------------------------
// ADMIN – BONUS CARDS
// -----------------------------
app.get("/api/admin/bonuscards", requireAdmin, async (req, res) => {
  const r = await query("SELECT * FROM bonuscards ORDER BY id ASC");
  res.json(r.rows);
});

app.post(
  "/api/admin/bonuscards",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    let img = null;
    if (req.file) img = await uploadToR2(req.file, "bonuscards");

    const r = await query(
      "INSERT INTO bonuscards(name,image_url) VALUES($1,$2) RETURNING *",
      [req.body.name, img]
    );
    res.json(r.rows[0]);
  }
);

app.delete("/api/admin/bonuscards/:id", requireAdmin, async (req, res) => {
  await query("DELETE FROM bonuscards WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -----------------------------
// ADMIN – MISSIONS
// -----------------------------
app.get("/api/admin/missions", requireAdmin, async (req, res) => {
  const r = await query("SELECT * FROM missions ORDER BY id ASC");
  res.json(r.rows);
});

app.post(
  "/api/admin/missions",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    const { title, xp } = req.body;
    if (!title) return res.status(400).json({ error: "Titel fehlt" });

    let img = null;
    if (req.file) img = await uploadToR2(req.file, "missions");

    const r = await query(
      "INSERT INTO missions(title,xp,image_url) VALUES($1,$2,$3) RETURNING *",
      [title, xp, img]
    );
    res.json(r.rows[0]);
  }
);

app.delete("/api/admin/missions/:id", requireAdmin, async (req, res) => {
  await query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -----------------------------
// FALLBACK – ALWAYS RETURN login/admin/student
// -----------------------------
app.get("/", (req, res) => res.redirect("/login.html"));

app.get("*", (req, res) =>
  res.sendFile(path.resolve("public", "login.html"))
);

// -----------------------------
app.listen(8080, () => console.log("Server läuft auf Port 8080"));
