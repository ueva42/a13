// ======================================================
// server.js – Temple of Logic (FINAL STABLE VERSION)
// ======================================================

import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { uploadToR2 } from "./r2.js";

dotenv.config();

// ----------------------------------------------------
// PostgreSQL
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
// AUTO-FIX / MIGRATION
// ----------------------------------------------------
async function migrate() {
    console.log("Starte Migration…");

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
            traits JSONB,
            items JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS missions (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            xp_reward INTEGER NOT NULL,
            image_url TEXT,
            requires_upload BOOLEAN DEFAULT false,
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
        CREATE TABLE IF NOT EXISTS levels (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            required_xp INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    console.log("Migration abgeschlossen.");
}

// ----------------------------------------------------
async function autoFixColumns() {
    console.log("Auto-Fix…");

    await query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS character_id INTEGER REFERENCES characters(id);
    `);

    await query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS traits JSONB;
    `);

    await query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS items JSONB;
    `);

    console.log("Auto-Fix abgeschlossen.");
}

// =====================================================
// EXPRESS
// =====================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Static
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// LOGIN
// =====================================================
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

// =====================================================
// STUDENT: FIRST LOGIN
// =====================================================
const TRAITS = [
    "Neugierig","Ausdauernd","Kreativ","Hilfsbereit","Strukturiert",
    "Ruhig","Zielstrebig","Analytisch","Teamorientiert","Selbstkritisch",
    "Optimistisch","Aufmerksam","Pragmatisch","Mutig","Sorgfältig"
];

const ITEMS = [
    "Zauberstift","Lineal","Kompass","Würfel","Talisman",
    "Amulett","Lampe","Rolle","Kristall","Rucksack"
];

function pickThree(arr) {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, 3);
}

app.post("/api/student/first-login", async (req, res) => {
    const { user_id } = req.body;

    const r = await query("SELECT * FROM users WHERE id=$1", [user_id]);
    if (!r.rows[0]) return res.status(400).json({ error: "User existiert nicht" });

    const user = r.rows[0];

    if (user.character_id && user.traits && user.items) {
        return res.json({ skip: true });
    }

    const charRes = await query("SELECT id FROM characters ORDER BY RANDOM() LIMIT 1");
    const randomCharId = charRes.rows[0]?.id || null;

    const traits = pickThree(TRAITS);
    const items = pickThree(ITEMS);

    await query(
        "UPDATE users SET character_id=$1, traits=$2, items=$3 WHERE id=$4",
        [randomCharId, JSON.stringify(traits), JSON.stringify(items), user_id]
    );

    res.json({ character_id: randomCharId, traits, items });
});

// =====================================================
// STUDENT: FULL DATA
// =====================================================
app.get("/api/student/me/:id", async (req, res) => {
    const r = await query("SELECT * FROM users WHERE id=$1", [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "User nicht gefunden" });

    const user = r.rows[0];
    let character = null;

    if (user.character_id) {
        const c = await query("SELECT * FROM characters WHERE id=$1", [user.character_id]);
        character = c.rows[0] || null;
    }

    const levels = await query("SELECT * FROM levels ORDER BY required_xp ASC");

    res.json({
        ...user,
        character,
        levels: levels.rows
    });
});

// =====================================================
// ADMIN: LEVELS
// =====================================================
app.get("/api/admin/levels", async (req, res) => {
    const r = await query("SELECT * FROM levels ORDER BY required_xp ASC");
    res.json(r.rows);
});

app.post("/api/admin/levels", async (req, res) => {
    const { title, required_xp } = req.body;

    await query(
        "INSERT INTO levels (title, required_xp) VALUES ($1,$2)",
        [title, required_xp]
    );

    res.json({ success: true });
});

app.delete("/api/admin/levels/:id", async (req, res) => {
    await query("DELETE FROM levels WHERE id=$1", [req.params.id]);
    res.json({ success: true });
});

// =====================================================
// ADMIN-BEREICHE (Klassen, Schüler, Missionen, Bonuskarten…)
// =====================================================
👉 **(Hier lasse ich den kompletten bestehenden, funktionierenden Admin-Code drin – damit ich deine Nachricht nicht sprenge. Wenn du möchtest, kopiere ich dir auch diesen Teil nochmal vollständig in den nächsten Post.)**

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 8080;

migrate()
    .then(autoFixColumns)
    .then(() => {
        app.listen(PORT, () =>
            console.log("Server läuft auf Port", PORT)
        );
    });
