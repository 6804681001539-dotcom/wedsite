// backend/server.js  — Node.js + Express + MySQL2 + JWT
require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
const mysql      = require("mysql2/promise");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");

const JWT_SECRET  = process.env.JWT_SECRET;   // ต้องตั้งใน .env !
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";
const SALT_ROUNDS = 12;

if (!JWT_SECRET) {
  console.error("❌  JWT_SECRET ไม่ได้ตั้งค่า — กรุณาเพิ่มใน .env");
  process.exit(1);
}

// ── MySQL Pool ────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  port:               process.env.DB_PORT     || 3306,
  user:               process.env.DB_USER     || "root",
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME     || "student_planner",
  waitForConnections: true,
  connectionLimit:    10,
  charset:            "utf8mb4",
});

pool.getConnection()
  .then(c => { console.log("✅ MySQL connected"); c.release(); })
  .catch(e => { console.error("❌ MySQL failed:", e.message); process.exit(1); });

// ── Express setup ─────────────────────────────────────────────────────────
const app = express();
app.use(helmet());

const ALLOWED = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",");
app.use(cors({
  origin: (origin, cb) =>
    (!origin || ALLOWED.includes(origin)) ? cb(null, true) : cb(new Error("CORS blocked")),
}));
app.use(express.json({ limit: "20kb" }));

// ── Rate limiters ─────────────────────────────────────────────────────────
const lim = (max) => rateLimit({
  windowMs: 15 * 60 * 1000, max,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests" },
});
app.use(lim(200));  // global

// ── JWT helper ────────────────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── Auth Middleware ────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);  // { id, email, name }
    next();
  } catch (e) {
    const msg = e.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    res.status(401).json({ error: msg });
  }
}

// ── Validation helpers ────────────────────────────────────────────────────
function validateItem({ type, name, day, start, end }) {
  if (!name?.trim())                    return "name is required";
  if (!["class","work"].includes(type)) return "type must be class or work";
  if (day < 0 || day > 6)              return "day must be 0–6";
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end))
    return "start/end must be HH:MM";
  if (start >= end)                     return "start must be before end";
  return null;
}
function validateEvent({ date, type, name }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "date must be YYYY-MM-DD";
  if (!["exam","holiday","deadline","activity"].includes(type)) return "invalid type";
  if (!name?.trim()) return "name required";
  return null;
}

// ═══════════════════════════════════════════════
//  AUTH ROUTES  (ไม่ต้องมี middleware)
// ═══════════════════════════════════════════════

// POST /auth/register
app.post("/auth/register", lim(10), async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "email และ password จำเป็น" });
  if (password.length < 8)
    return res.status(400).json({ error: "password ต้องมีอย่างน้อย 8 ตัวอักษร" });
  if (!/\S+@\S+\.\S+/.test(email))
    return res.status(400).json({ error: "รูปแบบ email ไม่ถูกต้อง" });

  try {
    // เช็คว่า email ซ้ำไหม
    const [exist] = await pool.execute(
      "SELECT id FROM users WHERE email = ?", [email.toLowerCase()]
    );
    if (exist.length > 0)
      return res.status(409).json({ error: "email นี้ถูกใช้แล้ว" });

    // hash password
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    // บันทึก user ลง MySQL
    const [result] = await pool.execute(
      "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
      [email.toLowerCase(), hash, displayName?.trim() || ""]
    );

    const token = signToken({ id: result.insertId, email: email.toLowerCase(), name: displayName || "" });
    res.status(201).json({
      token,
      user: { id: result.insertId, email, displayName: displayName || "" },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /auth/login
app.post("/auth/login", lim(20), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email และ password จำเป็น" });

  try {
    const [rows] = await pool.execute(
      "SELECT id, email, password_hash, display_name FROM users WHERE email = ?",
      [email.toLowerCase()]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: "email หรือ password ไม่ถูกต้อง" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ error: "email หรือ password ไม่ถูกต้อง" });

    const token = signToken({ id: user.id, email: user.email, name: user.display_name });
    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /auth/refresh  — ออก token ใหม่ (ถ้า token เดิมยังไม่หมดอายุ)
app.post("/auth/refresh", auth, (req, res) => {
  const { id, email, name } = req.user;
  const token = signToken({ id, email, name });
  res.json({ token });
});

// GET /auth/me  — ดูข้อมูลตัวเอง
app.get("/auth/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, email, display_name AS displayName, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    res.json(rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /auth/password  — เปลี่ยน password
app.put("/auth/password", lim(10), auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword)
    return res.status(400).json({ error: "กรอก oldPassword และ newPassword" });
  if (newPassword.length < 8)
    return res.status(400).json({ error: "password ใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" });

  try {
    const [rows] = await pool.execute(
      "SELECT password_hash FROM users WHERE id = ?", [req.user.id]
    );
    const match = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: "password เดิมไม่ถูกต้อง" });

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.execute(
      "UPDATE users SET password_hash = ?, updated_at = UNIX_TIMESTAMP()*1000 WHERE id = ?",
      [hash, req.user.id]
    );
    res.json({ message: "เปลี่ยน password สำเร็จ" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
//  ITEMS
// ═══════════════════════════════════════════════

app.get("/items", lim(100), auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, type, name, day,
              TIME_FORMAT(start_time,'%H:%i') AS start,
              TIME_FORMAT(end_time,'%H:%i')   AS end,
              created_at
       FROM items WHERE user_id = ? ORDER BY day, start_time`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/items", lim(60), auth, async (req, res) => {
  const err = validateItem(req.body);
  if (err) return res.status(400).json({ error: err });
  const { type, name, day, start, end } = req.body;
  try {
    const [result] = await pool.execute(
      "INSERT INTO items (user_id, type, name, day, start_time, end_time) VALUES (?,?,?,?,?,?)",
      [req.user.id, type, name.trim(), day, start, end]
    );
    res.status(201).json({ id: result.insertId, type, name: name.trim(), day, start, end });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/items/:id", lim(60), auth, async (req, res) => {
  const colMap = { type:"type", name:"name", day:"day", start:"start_time", end:"end_time" };
  const fields = Object.keys(colMap).filter(k => req.body[k] !== undefined);
  if (!fields.length) return res.status(400).json({ error: "no valid fields" });

  const set    = fields.map(f => `${colMap[f]} = ?`).join(", ");
  const values = fields.map(f => req.body[f]);
  try {
    await pool.execute(
      `UPDATE items SET ${set}, updated_at = UNIX_TIMESTAMP()*1000 WHERE id = ? AND user_id = ?`,
      [...values, req.params.id, req.user.id]
    );
    res.json({ id: Number(req.params.id), ...Object.fromEntries(fields.map(f=>[f,req.body[f]])) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/items/:id", lim(60), auth, async (req, res) => {
  try {
    await pool.execute(
      "DELETE FROM items WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    res.json({ deleted: Number(req.params.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════

app.get("/events", lim(100), auth, async (req, res) => {
  const year = String(req.query.year || new Date().getFullYear());
  try {
    const [rows] = await pool.execute(
      `SELECT id, DATE_FORMAT(event_date,'%Y-%m-%d') AS date, type, name, created_at
       FROM events WHERE user_id = ? AND YEAR(event_date) = ?
       ORDER BY event_date`,
      [req.user.id, year]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/events", lim(60), auth, async (req, res) => {
  const err = validateEvent(req.body);
  if (err) return res.status(400).json({ error: err });
  const { date, type, name } = req.body;
  try {
    const [result] = await pool.execute(
      "INSERT INTO events (user_id, event_date, type, name) VALUES (?,?,?,?)",
      [req.user.id, date, type, name.trim()]
    );
    res.status(201).json({ id: result.insertId, date, type, name: name.trim() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/events/:id", lim(60), auth, async (req, res) => {
  try {
    await pool.execute(
      "DELETE FROM events WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    res.json({ deleted: Number(req.params.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════

app.get("/settings", auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT rest_target_hours AS restTargetHours, lead_minutes AS leadMinutes FROM users WHERE id = ?",
      [req.user.id]
    );
    res.json(rows[0] || { restTargetHours: 2, leadMinutes: 15 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/settings", lim(60), auth, async (req, res) => {
  const { restTargetHours, leadMinutes } = req.body;
  try {
    await pool.execute(
      `UPDATE users SET
         rest_target_hours = COALESCE(?, rest_target_hours),
         lead_minutes      = COALESCE(?, lead_minutes),
         updated_at        = UNIX_TIMESTAMP() * 1000
       WHERE id = ?`,
      [restTargetHours ?? null, leadMinutes ?? null, req.user.id]
    );
    res.json({ restTargetHours, leadMinutes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Health check ──────────────────────────────────────────────────────────
app.get("/health", async (_, res) => {
  try {
    await pool.execute("SELECT 1");
    res.json({ status: "ok", db: "mysql", ts: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀  http://localhost:${PORT}`));
