// =====================================================
// server.js – Temple of Logic (Railway-SAFE FINAL VERSION)
// =====================================================

import express from "express";
import fileUpload from "express-fileupload";   // korrekt
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// R2 Upload
import { uploadToR2 } from "./r2.js";

dotenv.config();

// =====================================================
// PostgreSQL Verbindung
// =====================================================
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

// =====================================================
// MIGRATION (tabellen anlegen wenn sie fehlen)
// =====================================================
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

    // LEVELS – fest, ohne Auto-Einträge
    await query(`
        CREATE TABLE IF NOT EXISTS levels (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            required_xp INTEGER NOT NULL
        );
    `);

    console.log("Migration abgeschlossen.");
}

// =====================================================
// EXPRESS
// =====================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Static files
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
// STUDENT FIRST LOGIN (Charakter/Traits/Items)
// =====================================================

const TRAITS = [
    "Neugierig","Ausdauernd","Kreativ","Hilfsbereit","Strukturiert",
    "Risikofreudig","Ruhig","Zielstrebig","Analytisch","Teamorientiert",
    "Selbstkritisch","Optimistisch","Aufmerksam","Pragmatisch","Mutig",
    "Sorgfältig","Logisch denkend","Erfinderisch","Geduldig","Inspirierend"
];

const ITEMS = [
    "Zirkel der Präzision","Rechenamulett","Logikstein","Notizrolle der Klarheit",
    "Schutzbrille der Konzentration","Zauberstift des Beweises","Kompass der Richtung",
    "Rucksack der Ideen","Lineal des Gleichgewichts","Lampe des Einfalls",
    "Formelbuch des Wissens","Tasche der Zufälle","Würfel der Wahrscheinlichkeit",
    "Chronometer der Geduld","Mantel der Logik","Rechenbrett des Ausgleichs",
    "Trank der Übersicht","Kristall des Beweises","Talisman der Motivation",
    "Zauberstab des Verständnisses"
];

function pickThree(arr) {
    return [...arr].sort(() => Math.random() - 0.5).slice(0,3);
}

app.post("/api/student/first-login", async (req, res) => {
    const { user_id } = req.body;

    const r = await query("SELECT * FROM users WHERE id=$1", [user_id]);
    if (!r.rows[0]) return res.status(400).json({ error: "User existiert nicht" });

    const u = r.rows[0];

    if (u.character_id && u.traits && u.items) {
        return res.json({ skip:true });
    }

    const char = await query("SELECT id FROM characters ORDER BY RANDOM() LIMIT 1");

    const traits = pickThree(TRAITS);
    const items = pickThree(ITEMS);

    await query(
        "UPDATE users SET character_id=$1, traits=$2, items=$3 WHERE id=$4",
        [char.rows[0]?.id || null, JSON.stringify(traits), JSON.stringify(items), user_id]
    );

    res.json({ character_id: char.rows[0]?.id || null, traits, items });
});

// =====================================================
// STUDENT /me
// =====================================================
app.get("/api/student/me/:id", async (req, res) => {
    const id = req.params.id;

    const r = await query("SELECT * FROM users WHERE id=$1", [id]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });

    const u = r.rows[0];

    const level = await query(
        "SELECT * FROM levels WHERE required_xp <= $1 ORDER BY required_xp DESC LIMIT 1",
        [u.xp]
    );

    let character = null;
    if (u.character_id) {
        const c = await query("SELECT * FROM characters WHERE id=$1", [u.character_id]);
        character = c.rows[0] || null;
    }

    res.json({
        id: u.id,
        name: u.name,
        xp: u.xp,
        highest_xp: u.highest_xp,
        class_id: u.class_id,
        traits: u.traits,
        items: u.items,
        character,
        level: level.rows[0] || null
    });
});

// =====================================================
// STUDENT Upload
// =====================================================
app.post("/api/student/upload", async (req, res) => {
    if (!req.files?.file) return res.status(400).json({ error:"Keine Datei" });

    const { student_id } = req.body;
    const file = req.files.file;

    const filename = "upload_" + Date.now() + "_" + file.name;
    const url = await uploadToR2(file, filename);

    await query(
        "INSERT INTO student_uploads (student_id, file_url) VALUES ($1,$2)",
        [student_id, url]
    );

    res.json({ success:true });
});

// =====================================================
// ADMIN – Klassen
// =====================================================
app.get("/api/admin/classes", async (req,res) => {
    const r = await query("SELECT * FROM classes ORDER BY name ASC");
    res.json({ classes: r.rows });
});

app.post("/api/admin/classes", async (req,res) => {
    await query("INSERT INTO classes (name) VALUES ($1)", [req.body.name]);
    res.json({ success:true });
});

app.delete("/api/admin/classes/:id", async (req,res) => {
    await query("DELETE FROM classes WHERE id=$1", [req.params.id]);
    res.json({ success:true });
});

// =====================================================
// ADMIN – Schüler
// =====================================================
app.get("/api/admin/students/:classId", async (req,res) => {
    const r = await query(
        "SELECT * FROM users WHERE class_id=$1 ORDER BY name ASC",
        [req.params.classId]
    );
    res.json(r.rows);
});

app.post("/api/admin/students", async (req,res) => {
    const { name, password, class_id } = req.body;
    await query(
        "INSERT INTO users (name,password,role,class_id) VALUES ($1,$2,'student',$3)",
        [name, password, class_id]
    );
    res.json({ success:true });
});

app.delete("/api/admin/students/:id", async (req,res) => {
    await query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ success:true });
});

// =====================================================
// ADMIN – XP
// =====================================================
app.post("/api/admin/xp/student", async (req,res) => {
    const { student_id, amount } = req.body;

    await query(
        "UPDATE users SET xp=xp+$1, highest_xp=GREATEST(highest_xp, xp+$1) WHERE id=$2",
        [amount, student_id]
    );

    res.json({ success:true });
});

app.post("/api/admin/xp/class", async (req,res) => {
    const { class_id, amount } = req.body;

    await query(
        "UPDATE users SET xp=xp+$1, highest_xp=GREATEST(highest_xp, xp+$1) WHERE class_id=$2",
        [amount, class_id]
    );

    res.json({ success:true });
});

// Mission XP → Schüler
app.post("/api/admin/xp/mission-students", async (req,res) => {
    const { student_ids, mission_id } = req.body;

    const r = await query("SELECT xp_reward FROM missions WHERE id=$1", [mission_id]);
    const xp = r.rows[0].xp_reward;

    for (let id of student_ids) {
        await query(
            "UPDATE users SET xp=xp+$1, highest_xp=GREATEST(highest_xp, xp+$1) WHERE id=$2",
            [xp, id]
        );
    }

    res.json({ success:true });
});

// Mission XP → Klasse
app.post("/api/admin/xp/mission-class", async (req,res) => {
    const { class_id, mission_id } = req.body;

    const r = await query("SELECT xp_reward FROM missions WHERE id=$1", [mission_id]);
    const xp = r.rows[0].xp_reward;

    await query(
        "UPDATE users SET xp=xp+$1, highest_xp=GREATEST(highest_xp, xp+$1) WHERE class_id=$2",
        [xp, class_id]
    );

    res.json({ success:true });
});

// =====================================================
// ADMIN – Missionen
// =====================================================
app.get("/api/admin/missions", async (req,res) => {
    const r = await query("SELECT * FROM missions ORDER BY id DESC");
    res.json(r.rows);
});

app.post("/api/admin/missions", async (req,res) => {
    const { title, xp_reward } = req.body;

    let url = null;
    if (req.files?.image) {
        const f = req.files.image;
        const filename = "mission_"+Date.now()+"_"+f.name;
        url = await uploadToR2(f, filename);
    }

    await query(
        "INSERT INTO missions (title, xp_reward, image_url, requires_upload) VALUES ($1,$2,$3,$4)",
        [title, xp_reward, url, req.body.requires_upload === "true"]
    );

    res.json({ success:true });
});

app.delete("/api/admin/missions/:id", async (req,res) => {
    await query("DELETE FROM missions WHERE id=$1", [req.params.id]);
    res.json({ success:true });
});

// =====================================================
// ADMIN – Bonuskarten
// =====================================================
app.get("/api/admin/bonus", async (req,res) => {
    const r = await query("SELECT * FROM bonus_cards ORDER BY id DESC");
    res.json(r.rows);
});

app.post("/api/admin/bonus", async (req,res) => {
    const { title, xp_cost } = req.body;

    let url = null;
    if (req.files?.image) {
        const f = req.files.image;
        const filename = "bonus_"+Date.now()+"_"+f.name;
        url = await uploadToR2(f, filename);
    }

    await query(
        "INSERT INTO bonus_cards (title, xp_cost, image_url) VALUES ($1,$2,$3)",
        [title, xp_cost, url]
    );

    res.json({ success:true });
});

app.delete("/api/admin/bonus/:id", async (req,res) => {
    await query("DELETE FROM bonus_cards WHERE id=$1", [req.params.id]);
    res.json({ success:true });
});

// =====================================================
// ADMIN – Charaktere
// =====================================================
app.get("/api/admin/characters", async (req,res) => {
    const r = await query("SELECT * FROM characters ORDER BY id DESC");
    res.json(r.rows);
});

app.post("/api/admin/characters", async (req,res) => {
    const { name } = req.body;

    let url = null;
    if (req.files?.image) {
        const f = req.files.image;
        const filename = "character_"+Date.now()+"_"+f.name;
        url = await uploadToR2(f, filename);
    }

    await query(
        "INSERT INTO characters (name, image_url) VALUES ($1,$2)",
        [name, url]
    );

    res.json({ success:true });
});

app.delete("/api/admin/characters/:id", async (req,res) => {
    await query("DELETE FROM characters WHERE id=$1", [req.params.id]);
    res.json({ success:true });
});

// =====================================================
// ADMIN – LEVEL
// =====================================================
app.get("/api/admin/levels", async (req,res) => {
    const r = await query("SELECT * FROM levels ORDER BY required_xp ASC");
    res.json(r.rows);
});

app.post("/api/admin/levels", async (req,res) => {
    const { name, required_xp } = req.body;

    await query(
        "INSERT INTO levels (name, required_xp) VALUES ($1,$2)",
        [name, required_xp]
    );

    res.json({ success:true });
});

app.delete("/api/admin/levels/:id", async (req,res) => {
    await query("DELETE FROM levels WHERE id=$1", [req.params.id]);
    res.json({ success:true });
});

// =====================================================
// ADMIN – Uploads ansehen & löschen
// =====================================================
app.get("/api/admin/uploads/:studentId", async (req,res) => {
    const r = await query(
        "SELECT * FROM student_uploads WHERE student_id=$1 ORDER BY id DESC",
        [req.params.studentId]
    );
    res.json(r.rows);
});

app.delete("/api/admin/uploads/:id", async (req,res) => {
    await query("DELETE FROM student_uploads WHERE id=$1", [req.params.id]);
    res.json({ success:true });
});

// =====================================================
// START
// =====================================================
const PORT = process.env.PORT || 3000;

migrate().then(() => {
    app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
});
