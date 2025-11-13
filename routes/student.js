import express from "express";
import { query } from "../db.js";

const router = express.Router();

router.get("/missions/:id", async (req, res) => {
    try {
        const missions = await query("SELECT * FROM missions", []);
        res.json(missions.rows);
    } catch {
        res.status(500).json({ error: "Fehler" });
    }
});

export default router;
