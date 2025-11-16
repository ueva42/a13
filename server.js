// -------------------------------------------------------------
// Temple of Logic – FINAL SERVER VERSION (vollständig)
// -------------------------------------------------------------
import express from "express";
import multer from "multer";
import cors from "cors";
import session from "express-session";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

// R2 Upload Modul
import { uploadToR2, R2_ENABLED } from "./r2.js";

// -------------------------------------------------------------
// Basis Setup
// -------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(cors());

app.use(
  session({
    secret: "tol-super-secret",
    resave: false,
    saveUninitialized: false,
  })
);

const upload = multer({ storage: multer.memoryStorage() });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// -------------------------------------------------------------
// PostgreSQL
// -------------------------------------------------------------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function query(sql, params) {
  return await pool.query(sql, params);
}

// -------------------------------------------------------------
// AUTH
// -------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  const r = await query("SELECT * FROM users WHERE name=$1", [username]);

  if (!r.rows[0]) return res.status(400).json({ error: "Benutzer existiert nicht" });
  if (r.rows[0].password !== password)
    return res.status(400).json({ error: "Falsches Passwort" });

  req.session.userId = r.rows[0].id;
  req.session.role = r.rows[0].role;

  res.json({ ok: true, role: r.rows[0].role });
});

app.get("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// -------------------------------------------------------------
// ADMIN-CHECK
// -------------------------------------------------------------
function isAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.status(403).json({ error: "Nicht erlaubt" });
  }
  next();
}

// -------------------------------------------------------------
// LEVEL
// -------------------------------------------------------------
app.get("/api/admin/levels", isAdmin, async (req, res) => {
  const r = await query("SELECT * FROM levels ORDER BY xp_required ASC");
  res.json(r.rows);
});

app.post("/api/admin/levels", isAdmin, async (req, res) => {
  const { name, xp_required, reward } = req.body;

  if (!name || xp_required === undefined) {
    return res.status(400).json({ error: "Fehlende Daten" });
  }

  const r = await query(
    "INSERT INTO levels (name, xp_required, reward) VALUES ($1,$2,$3) RETURNING *",
    [name, xp_required, reward || null]
  );

  res.json(r.rows[0]);
});

// -------------------------------------------------------------
// MISSIONEN
// -------------------------------------------------------------
app.get("/api/admin/missions", isAdmin, async (req, res) => {
  const r = await query("SELECT * FROM missions ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/missions", isAdmin, upload.single("image"), async (req, res) => {
  const { title, xp } = req.body;
  let imageUrl = null;

  if (req.file && R2_ENABLED) {
    try {
      imageUrl = await uploadToR2(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
    } catch (err) {
      console.log("Mission Upload Fehler:", err);
    }
  }

  const r = await query(
    "INSERT INTO missions (title, xp, image_url) VALUES ($1,$2,$3) RETURNING *",
    [title, xp, imageUrl]
  );

  res.json(r.rows[0]);
});

// -------------------------------------------------------------
// BONUSKARTEN
// -------------------------------------------------------------
app.get("/api/admin/cards", isAdmin, async (req, res) => {
  const r = await query("SELECT * FROM bonuscards ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/cards", isAdmin, upload.single("image"), async (req, res) => {
  const { title, text } = req.body;
  let imageUrl = null;

  if (req.file && R2_ENABLED) {
    try {
      imageUrl = await uploadToR2(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
    } catch (err) {
      console.log("Bonuskarten Upload Fehler:", err);
    }
  }

  const r = await query(
    "INSERT INTO bonuscards (title, text, image_url) VALUES ($1,$2,$3) RETURNING *",
    [title, text, imageUrl]
  );

  res.json(r.rows[0]);
});

// -------------------------------------------------------------
// CHARAKTER
// -------------------------------------------------------------
app.get("/api/admin/chars", isAdmin, async (req, res) => {
  const r = await query("SELECT * FROM characters ORDER BY id DESC");
  res.json(r.rows);
});

app.post("/api/admin/chars", isAdmin, upload.single("image"), async (req, res) => {
  const { title } = req.body;
  let imageUrl = null;

  if (req.file && R2_ENABLED) {
    try {
      imageUrl = await uploadToR2(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
    } catch (err) {
      console.log("Charakter Upload Fehler:", err);
    }
  }

  const r = await query(
    "INSERT INTO characters (title, image_url) VALUES ($1,$2) RETURNING *",
    [title, imageUrl]
  );

  res.json(r.rows[0]);
});

// -------------------------------------------------------------
// DELETE-ENDPUNKTE (Missionen / Charakter / Karten / Level)
// -------------------------------------------------------------
app.delete("/api/admin/missions/:id", isAdmin, async (req, res) => {
  await query("DELETE FROM missions WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.delete("/api/admin/cards/:id", isAdmin, async (req, res) => {
  await query("DELETE FROM bonuscards WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.delete("/api/admin/chars/:id", isAdmin, async (req, res) => {
  await query("DELETE FROM characters WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.delete("/api/admin/levels/:id", isAdmin, async (req, res) => {
  await query("DELETE FROM levels WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// -------------------------------------------------------------
// HTML ROUTES
// -------------------------------------------------------------
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin.html"));
});

app.get("/student", (req, res) => {
  res.sendFile(path.join(__dirname, "public/student.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// -------------------------------------------------------------
// SERVER START
// -------------------------------------------------------------
app.listen(8080, () => console.log("Server läuft auf Port 8080"));
