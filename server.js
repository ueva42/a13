// ================================
// server.js – Temple of Logic
// ================================
import express from "express";
import fileUpload from "express-fileupload";
import dotenv from "dotenv";
import pg from "pg";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// ------------------------------------
// PG CONNECTION
// ------------------------------------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(q, params) {
  const client = await pool.connect();
  try {
    return await client.query(q, params);
  } finally {
    client.release();
  }
}

// ------------------------------------
// MIGRATION
// ------------------------------------
async function migrate() {
  console.log("Starte Migration …");

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
      xp INTEGER DEFAULT 0,
      highest_xp INTEGER DEFAULT 0,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // ACTIVE CLASS
  await query(`
    CREATE TABLE IF NOT EXISTS active_class (
      id INTEGER PRIMARY KEY DEFAULT 1,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL
    );
  `);

  await query(`
    INSERT INTO active_class (id, class_id)
    VALUES (1, NULL)
    ON CONFLICT (id) DO NOTHING;
  `);

  // MISSIONS
  await query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      xp_reward INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      requires_upload BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("Migration abgeschlossen.");
}

// ------------------------------------
// EXPRESS SETUP
// ------------------------------------
const app = express();

app.use(cors());
app.use(express.json());
app.use(fileUpload());

// STATIC
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// Upload-Ordner erstellen falls nötig
import fs from "fs";
const uploadFolder = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}


// ====================================
// API — ADMIN: KLASSEN
// ====================================

// 1) ALLE KLASSEN + aktive Klasse holen
app.get("/api/admin/classes", async (req, res) => {
  try {
    const classes = await query("SELECT id, name FROM classes ORDER BY name ASC");
    const active = await query("SELECT class_id FROM active_class WHERE id = 1");

    res.json({
      classes: classes.rows,
      activeClassId: active.rows[0]?.class_id || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Laden der Klassen" });
  }
});

// 2) Klasse anlegen
app.post("/api/admin/classes", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name darf nicht leer sein" });
    }

    const r = await query(
      "INSERT INTO classes (name) VALUES ($1) RETURNING id, name",
      [name.trim()]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Klasse existiert bereits" });
    }
    console.error(err);
    res.status(500).json({ error: "Fehler beim Anlegen" });
  }
});

// 3) Klasse löschen
app.delete("/api/admin/classes/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);

    await query(
      "UPDATE active_class SET class_id = NULL WHERE id = 1 AND class_id = $1",
      [classId]
    );

    const r = await query("DELETE FROM classes WHERE id = $1", [classId]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Klasse nicht gefunden" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Löschen" });
  }
});

// 4) Aktive Klasse setzen
app.post("/api/admin/classes/active", async (req, res) => {
  try {
    const { classId } = req.body;

    const r = await query("SELECT id FROM classes WHERE id = $1", [classId]);
    if (!r.rows[0]) {
      return res.status(404).json({ error: "Klasse nicht gefunden" });
    }

    await query(
      `
      INSERT INTO active_class (id, class_id)
      VALUES (1, $1)
      ON CONFLICT (id) DO UPDATE SET class_id = EXCLUDED.class_id;
      `,
      [classId]
    );

    res.json({ success: true, activeClassId: classId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Setzen der aktiven Klasse" });
  }
});


// ====================================
// API — ADMIN: MISSIONEN
// ====================================

// GET: Missionen
app.get("/api/admin/missions", async (req, res) => {
  try {
    const r = await query(
      "SELECT id, title, description, xp_reward, image_url, requires_upload FROM missions ORDER BY id DESC"
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Laden der Missionen" });
  }
});

// POST: Mission anlegen
app.post("/api/admin/missions", async (req, res) => {
  try {
    const title = req.body.title;
    const description = req.body.description || "";
    const xp = Number(req.body.xp_reward || 0);
    const requiresUpload = req.body.requires_upload === "true";

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Missionstitel fehlt" });
    }

    let imageUrl = null;

    // Bild speichern
    if (req.files && req.files.image) {
      const img = req.files.image;
      const filename = `mission_${Date.now()}_${img.name}`;
      const uploadPath = path.join(uploadFolder, filename);

      await img.mv(uploadPath);
      imageUrl = `/uploads/${filename}`;
    }

    const r = await query(
      `
      INSERT INTO missions (title, description, xp_reward, image_url, requires_upload)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, title, description, xp_reward, image_url, requires_upload
      `,
      [title.trim(), description, xp, imageUrl, requiresUpload]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("Fehler beim Anlegen der Mission:", err);
    res.status(500).json({ error: "Mission konnte nicht angelegt werden" });
  }
});

// DELETE: Mission löschen
app.delete("/api/admin/missions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) return res.status(400).json({ error: "Ungültige ID" });

    await query("DELETE FROM missions WHERE id = $1", [id]);

    res.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Löschen:", err);
    res.status(500).json({ error: "Mission konnte nicht gelöscht werden" });
  }
});


// ------------------------------------
// STARTUP
// ------------------------------------
migrate().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
});
