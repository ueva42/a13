import express from "express";
import { query } from "../db.js";

const router = express.Router();

router.post("/login", async (req, res) => {
    const { name, password } = req.body;

    try {
        const r = await query("SELECT * FROM users WHERE name=$1", [name]);

        if (r.rowCount === 0) {
            return res.status(400).json({ error: "User existiert nicht" });
        }

        const user = r.rows[0];

        if (password !== user.password) {
            return res.status(400).json({ error: "Passwort falsch" });
        }

        res.json({
            id: user.id,
            name: user.name,
            role: user.role
        });

    } catch (err) {
        res.status(500).json({ error: "DB Fehler" });
    }
});

export default router;


