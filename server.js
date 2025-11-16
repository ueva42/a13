import express from "express";
import fileUpload from "express-fileupload";
import pkg from "pg";
const { Pool } = pkg;
import cors from "cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const app = express();
app.use(express.json());
app.use(cors());
app.use(fileUpload());

// -------------------------------------------------------
// DATABASE
// -------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function query(sql, params) {
  const res = await pool.query(sql, params);
  return res;
}

// -------------------------------------------------------
// R2 CLIENT
// -------------------------------------------------------
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;

let r2Enabled = true;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_PUBLIC_BASE_URL) {
  console.log("⚠️ R2 NICHT vollständig konfiguriert – Uploads laufen ohne Bilder weiter.");
  r2Enabled = false;
}

let r2 = null;
if (r2Enabled) {
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
}

// -------------------------------------------------------
// R2 UPLOAD-FUNKTION
// -------------------------------------------------------
async function uploadToR2(buffer, filename, mimetype) {
  if (!r2Enabled) return null;

  try {
    const key = `uploads/${Date.now()}_${filename}`;

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype
    }));

    return `${R2_PUBLIC_BASE_URL}/${key}`;
  } catch (err) {
    console.log("R2 Upload Error:", err);
    return null;
  }
}

// -------------------------------------------------------
// LOGIN
// -------------------------------------------------------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const q = await query("SELECT * FROM users WHERE name=$1", [username]);

    if (!q.rows.length) return res.status(400).json({ error: "User nicht gefunden" });
    if (q.rows[0].password !== password) return res.status(400).json({ error: "Passwort falsch" });

    return res.json({ id: q.rows[0].id, role: q.rows[0].role });
  } catch (err) {
    console.log("Login Error:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// -------------------------------------------------------
// ADMIN: KLASSEN
// -------------------------------------------------------
app.get("/api/admin/classes", async (req, res) => {
  const r = await query("SELECT * FROM classes ORDER BY name ASC");
  res.json({ classes: r.rows });
});

app.post("/api/admin/classes", async (req, res) => {
  await query("INSERT INTO classes (name) VALUES ($1)", [req.body.name]);
  res.json({ ok: true });
});

app.delete("/api/admin/classes/:id", async (req, res) => {
  await query("DELETE FROM classes WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// ADMIN: STUDENTS
// -------------------------------------------------------
app.get("/api/admin/students/:class_id", async (req, res) => {
  const r = await query("SELECT * FROM users WHERE class_id=$1 ORDER BY name ASC", [req.params.class_id]);
  res.json(r.rows);
});

app.post("/api/admin/students", async (req, res) => {
  const { name, password, class_id } = req.body;
  await query("INSERT INTO users (name, password, class_id, xp, role) VALUES ($1,$2,$3,0,'student')",
    [name, password, class_id]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/students/:id", async (req, res) => {
  await query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// XP: MANUELL
// -------------------------------------------------------
app.post("/api/admin/xp/student", async (req, res) => {
  const { student_id, amount } = req.body;

  await query("UPDATE users SET xp = xp + $1 WHERE id=$2", [amount, student_id]);
  await query(
    "INSERT INTO xp_transactions (student_id, amount, awarded_by) VALUES ($1,$2,$3)",
    [student_id, amount, null]
  );

  res.json({ ok: true });
});

app.post("/api/admin/xp/class", async (req, res) => {
  const { class_id, amount } = req.body;

  await query("UPDATE users SET xp = xp + $1 WHERE class_id=$2", [amount, class_id]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// ADMIN: MISSIONEN
// -------------------------------------------------------
app.get("/api/admin/missions", async (req, res) => {
  const r = await query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/missions", async (req, res) => {
  try {
    let imageUrl = null;

    if (req.files?.image) {
      imageUrl = await uploadToR2(req.files.image.data, req.files.image.name, req.files.image.mimetype);
    }

    await query(
      "INSERT INTO missions (title, xp_reward, requires_upload, image_url) VALUES ($1,$2,$3,$4)",
      [
        req.body.title,
        req.body.xp_reward,
        req.body.requires_upload === "on",
        imageUrl
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.log("Mission Upload Fehler:", err);
    res.status(500).json({ error: "Mission konnte nicht gespeichert werden" });
  }
});

app.delete("/api/admin/missions/:id", async (req, res) => {
  await query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// ADMIN: BONUSKARTEN
// -------------------------------------------------------
app.get("/api/admin/bonus", async (req, res) => {
  const r = await query("SELECT * FROM bonus_cards ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/bonus", async (req, res) => {
  try {
    let imageUrl = null;
    if (req.files?.image) {
      imageUrl = await uploadToR2(req.files.image.data, req.files.image.name, req.files.image.mimetype);
    }

    await query(
      "INSERT INTO bonus_cards (title, xp_cost, image_url) VALUES ($1,$2,$3)",
      [req.body.title, req.body.xp_cost, imageUrl]
    );

    res.json({ ok: true });
  } catch (err) {
    console.log("Bonus Upload Fehler:", err);
    res.status(500).json({ error: "Bonuskarte konnte nicht gespeichert werden" });
  }
});

app.delete("/api/admin/bonus/:id", async (req, res) => {
  await query("DELETE FROM bonus_cards WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// ADMIN: CHARACTERS
// -------------------------------------------------------
app.get("/api/admin/characters", async (req, res) => {
  const r = await query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/characters", async (req, res) => {
  try {
    let imageUrl = null;
    if (req.files?.image) {
      imageUrl = await uploadToR2(req.files.image.data, req.files.image.name, req.files.image.mimetype);
    }

    await query(
      "INSERT INTO characters (name, image_url) VALUES ($1,$2)",
      [req.body.name, imageUrl]
    );

    res.json({ ok: true });
  } catch (err) {
    console.log("Character Upload Fehler:", err);
    res.status(500).json({ error: "Charakter konnte nicht gespeichert werden" });
  }
});

app.delete("/api/admin/characters/:id", async (req, res) => {
  await query("DELETE FROM characters WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// ADMIN: LEVELS (final fix!)
// -------------------------------------------------------
app.get("/api/admin/levels", async (req, res) => {
  try {
    const r = await query("SELECT * FROM levels ORDER BY xp_required ASC");
    res.json(r.rows);
  } catch (err) {
    console.log("Level Load Error:", err);
    res.status(500).json([]);
  }
});

app.post("/api/admin/levels", async (req, res) => {
  try {
    const { name, xp_required, description } = req.body;

    await query(
      "INSERT INTO levels (name, xp_required, description) VALUES ($1,$2,$3)",
      [name, xp_required, description || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.log("Level Insert Error:", err);
    res.status(500).json({ error: "Level konnte nicht gespeichert werden" });
  }
});

app.delete("/api/admin/levels/:id", async (req, res) => {
  await query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------
app.listen(8080, () => console.log("Server läuft auf Port 8080"));
