// ================================
// routes/admin.js – FERTIGER CODE
// ================================
import express from "express";
import { query } from "../db.js";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// Upload-Pfad bestimmen
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "..", "public", "uploads");

// ====================================
// KLASSEN
// ====================================

// Klasse anlegen
router.post("/class/create", async (req, res) => {
    const { name } = req.body;

    try {
        await query("INSERT INTO classes (name) VALUES ($1)", [name]);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: "Klasse existiert bereits" });
    }
});

// ====================================
// SCHÜLER
// ====================================

// Schüler anlegen
router.post("/student/create", async (req, res) => {
    const { name, password, class_id } = req.body;

    try {
        await query(
            "INSERT INTO users (name, password, role, class_id) VALUES ($1,$2,'student',$3)",
            [name, password, class_id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Fehler beim Anlegen des Schülers" });
    }
});

// ====================================
// MISSIONEN
// ====================================

// Mission anlegen
router.post("/mission/create", async (req, res) => {
    const { title, description, xp, requires_upload } = req.body;

    if (!title || !xp) {
        return res.status(400).json({ error: "Titel und XP sind Pflichtfelder" });
    }

    let imageUrl = null;

    try {
        // Falls ein Bild hochgeladen wurde
        if (req.files && req.files.image) {
            const img = req.files.image;

            const filename = "mission_" + Date.now() + "_" + img.name;
            const uploadPath = path.join(uploadDir, filename);

            await img.mv(uploadPath);

            imageUrl = "/uploads/" + filename;
        }

        await query(
            `INSERT INTO missions (title, description, xp_reward, image_url, requires_upload)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                title,
                description || "",
                xp,
                imageUrl,
                requires_upload === "true"
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Fehler Mission erstellen:", err);
        res.status(400).json({ error: "Mission konnte nicht angelegt werden" });
    }
});

// Missionen ausgeben
router.get("/mission/list", async (req, res) => {
    try {
        const missions = await query(
            "SELECT id, title, description, xp_reward, image_url, requires_upload FROM missions ORDER BY id DESC"
        );

        res.json({ success: true, missions: missions.rows });
    } catch (err) {
        console.error("Fehler Missionen laden:", err);
        res.status(500).json({ error: "Fehler beim Laden" });
    }
});

// Mission löschen
router.delete("/mission/delete/:id", async (req, res) => {
    const id = req.params.id;

    try {
        await query("DELETE FROM missions WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error("Fehler beim Löschen:", err);
        res.status(400).json({ error: "Mission konnte nicht gelöscht werden" });
    }
});

export default router;
