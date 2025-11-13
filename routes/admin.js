import express from "express";
import { query } from "../db.js";

const router = express.Router();

// Klassen anlegen
router.post("/class/create", async (req, res) => {
    const { name } = req.body;

    try {
        await query("INSERT INTO classes (name) VALUES ($1)", [name]);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: "Klasse existiert bereits" });
    }
});

// Schüler anlegen
router.post("/student/create", async (req, res) => {
    const { name, password, class_id } = req.body;

    try {
        await query(
            "INSERT INTO users (name, password, role) VALUES ($1,$2,'student')",
            [name, password]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: "Fehler beim Anlegen" });
    }
});

// Mission anlegen
router.post("/mission/create", async (req, res) => {
    const { title, description, xp } = req.body;

    try {
        await query(
            "INSERT INTO missions (title, description, xp_reward) VALUES ($1,$2,$3)",
            [title, description, xp]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: "Fehler beim Anlegen" });
    }
});

export default router;
