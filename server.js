// ==========================================
// server.js – Temple of Logic (FINAL VERSION)
// ==========================================

import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

// ----------------------------------------------------
// PostgreSQL Verbindung
// ----------------------------------------------------
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export async function query(q, params) {
    const client = await pool.connect();
    try {
        return await client.query(q, params);
    } finally {
        client.release();
    }
}

// ----------------------------------------------------
// MIGRATION
// ----------------------------------------------------
async function migrate() {

    // Tabellen anlegen
    await query(`
        CREATE TABLE IF NOT EXISTS classes (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS characters (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            image_url TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
            xp INTEGER DEFAULT 0,
            highest_xp INTEGER DEFAULT 0,
            character_id INTEGER REFERENCES characters(id),
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

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

    await query(`
        CREATE TABLE IF NOT EXISTS bonus_cards (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            xp_cost INTEGER NOT NULL,
            image_url TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS student_uploads (
            id SERIAL PRIMARY KEY,
            student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            file_url TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Default Admin nur wenn nicht existiert
    await query(`
        INSERT INTO users (name, password, role)
        SELECT 'steffen', 'admin123', 'admin'
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE name='steffen');
    `);
}

// ----------------------------------------------------
// EXPRESS EINRICHTEN
// ----------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// STATIC FILES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

if (!fs.existsSync(path.join(__dirname, "public", "uploads"))) {
    fs.mkdirSync(path.join(__dirname, "public", "uploads"), { recursive: true });
}

// ----------------------------------------------------
// LOGIN
// ----------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
    const { name, password } = req.body;

    const r = await query("SELECT * FROM users WHERE name=$1", [name]);
    if (!r.rows[0]) return res.status(400).json({ error: "Benutzer existiert nicht" });

    if (r.rows[0].password !== password)
        return res.status(400).json({ error: "Falsches Passwort" });

    res.json({
        id: r.rows[0].id,
        role: r.rows[0].role,
        class_id: r.rows[0].class_id
    });
});

// ----------------------------------------------------
// KLASSEN
// ----------------------------------------------------
app.get("/api/admin/classes", async (req, res) => {
    const r = await query("SELECT * FROM classes ORDER BY name ASC");
    res.json({ classes: r.rows });
});

app.post("/api/admin/classes", async (req, res) => {
    await query("INSERT INTO classes (name) VALUES ($1)", [req.body.name]);
    res.json({ success: true });
});

app.delete("/api/admin/classes/:id", async (req, res) => {
    await query("DELETE FROM classes WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});

// ----------------------------------------------------
// SCHÜLER
// ----------------------------------------------------
app.get("/api/admin/students/:class_id", async (req, res) => {
    const r = await query(
        "SELECT * FROM users WHERE class_id=$1 ORDER BY name ASC",
        [req.params.class_id]
    );
    res.json(r.rows);
});

app.post("/api/admin/students", async (req, res) => {
    const { name, password, class_id } = req.body;

    await query(
        "INSERT INTO users (name, password, role, class_id, xp, highest_xp) VALUES ($1,$2,'student',$3,0,0)",
        [name, password, class_id]
    );

    res.json({ success: true });
});

app.delete("/api/admin/students/:id", async (req, res) => {
    await query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});

// ----------------------------------------------------
// XP
// ----------------------------------------------------
app.post("/api/admin/xp/student", async (req, res) => {
    const { student_id, amount } = req.body;

    await query(
        "UPDATE users SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1) WHERE id=$2",
        [amount, student_id]
    );

    res.json({ success: true });
});

app.post("/api/admin/xp/class", async (req, res) => {
    const { class_id, amount } = req.body;

    await query(
        "UPDATE users SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1) WHERE class_id=$2",
        [amount, class_id]
    );

    res.json({ success: true });
});

// Mission → Schüler
app.post("/api/admin/xp/mission-students", async (req, res) => {
    const { student_ids, mission_id } = req.body;

    const r = await query("SELECT xp_reward FROM missions WHERE id=$1", [mission_id]);
    const xp = r.rows[0].xp_reward;

    for (let id of student_ids) {
        await query(
            "UPDATE users SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1) WHERE id=$2",
            [xp, id]
        );
    }

    res.json({ success: true });
});

// Mission → Klasse
app.post("/api/admin/xp/mission-class", async (req, res) => {
    const { class_id, mission_id } = req.body;

    const r = await query("SELECT xp_reward FROM missions WHERE id=$1", [mission_id]);
    const xp = r.rows[0].xp_reward;

    await query(
        "UPDATE users SET xp = xp + $1, highest_xp = GREATEST(highest_xp, xp + $1) WHERE class_id=$2",
        [xp, class_id]
    );

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
    const { title, xp_reward } = req.body;

    let imageUrl = null;

    if (req.files?.image) {
        const img = req.files.image;
        const filename = "mission_" + Date.now() + "_" + img.name;
        await img.mv(path.join(__dirname, "public", "uploads", filename));
        imageUrl = "/uploads/" + filename;
    }

    await query(
        "INSERT INTO missions (title, xp_reward, image_url, requires_upload) VALUES ($1,$2,$3,$4)",
        [title, xp_reward, imageUrl, req.body.requires_upload === "true"]
    );

    res.json({ success: true });
});

app.delete("/api/admin/missions/:id", async (req, res) => {
    await query("DELETE FROM missions WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});

// ----------------------------------------------------
// BONUSKARTEN
// ----------------------------------------------------
app.get("/api/admin/bonus", async (req, res) => {
    const r = await query("SELECT * FROM bonus_cards ORDER BY id DESC");
    res.json(r.rows);
});

app.post("/api/admin/bonus", async (req, res) => {
    const { title, xp_cost } = req.body;

    let imageUrl = null;

    if (req.files?.image) {
        const img = req.files.image;
        const filename = "bonus_" + Date.now() + "_" + img.name;
        await img.mv(path.join(__dirname, "public", "uploads", filename));
        imageUrl = "/uploads/" + filename;
    }

    await query(
        "INSERT INTO bonus_cards (title, xp_cost, image_url) VALUES ($1,$2,$3)",
        [title, xp_cost, imageUrl]
    );

    res.json({ success: true });
});

app.delete("/api/admin/bonus/:id", async (req, res) => {
    await query("DELETE FROM bonus_cards WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});

// ----------------------------------------------------
// CHARACTERS
// ----------------------------------------------------
app.get("/api/admin/characters", async (req, res) => {
    const r = await query("SELECT * FROM characters ORDER BY id DESC");
    res.json(r.rows);
});

app.post("/api/admin/characters", async (req, res) => {
    const { name } = req.body;

    let imageUrl = null;

    if (req.files?.image) {
        const img = req.files.image;
        const filename = "character_" + Date.now() + "_" + img.name;
        await img.mv(path.join(__dirname, "public", "uploads", filename));
        imageUrl = "/uploads/" + filename;
    }

    await query(
        "INSERT INTO characters (name, image_url) VALUES ($1,$2)",
        [name, imageUrl]
    );

    res.json({ success: true });
});

app.delete("/api/admin/characters/:id", async (req, res) => {
    await query("DELETE FROM characters WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});

// ----------------------------------------------------
// STARTUP
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;

migrate().then(() => {
    app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
});
