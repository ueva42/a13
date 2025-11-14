// ==========================================
// server.js – Temple of Logic (VOLLSTÄNDIG)
// ==========================================

import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

// Router
import adminRouter from "./routes/admin.js";

dotenv.config();

// ----------------------------------------------------
// PostgreSQL Verbindung
// ----------------------------------------------------
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

// ----------------------------------------------------
// MIGRATION
// ----------------------------------------------------
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

// ----------------------------------------------------
// EXPRESS APP
// ----------------------------------------------------
const app = express();

// Grundlegende Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Pfade berechnen
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static Files (Frontend)
app.use(express.static(path.join(__dirname, "public")));

// Upload-Verzeichnis sicherstellen
import fs from "fs";
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ----------------------------------------------------
// ROUTEN
// ----------------------------------------------------
app.use("/api/admin", adminRouter);

// Standardroute → index.html / login.html / admin.html / student.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ----------------------------------------------------
// SERVER STARTEN
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;

migrate()
    .then(() => {
        app.listen(PORT, () =>
            console.log(`Server läuft auf Port ${PORT}`)
        );
    })
    .catch((err) => {
        console.error("Migration fehlgeschlagen:", err);
    });
