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

  // CLASSES
  await query(`
    CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
  `);

  // ACTIVE CLASS (nur ein Eintrag)
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

  // Für Missionen usw. brauchst du später weitere Tabellen – ist hier nicht relevant.
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

    // Existenz check
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

// ------------------------------------
// STARTUP
// ------------------------------------
migrate().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
});
