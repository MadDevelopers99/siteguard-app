const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { requireTimeUser } = require("../middleware/auth");

// ---------- Auth (standalone account system, separate from Admin/Driver) ----------
router.get("/login", (req, res) => {
  if (req.session.timeUserId) return res.redirect("/time");
  res.render("time/login", { error: null });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM time_users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.render("time/login", { error: "Invalid email or password." });
  }
  req.session.timeUserId = user.id;
  req.session.timeUserName = user.name;
  res.redirect("/time");
});

router.get("/register", (req, res) => {
  if (req.session.timeUserId) return res.redirect("/time");
  res.render("time/register", { error: null });
});

router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.render("time/register", { error: "Please fill in name, email, and password." });
  }
  const existing = db.prepare("SELECT id FROM time_users WHERE email = ?").get(email);
  if (existing) {
    return res.render("time/register", { error: "An account with this email already exists." });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO time_users (email, password_hash, name) VALUES (?, ?, ?)")
    .run(email, passwordHash, name);
  req.session.timeUserId = info.lastInsertRowid;
  req.session.timeUserName = name;
  res.redirect("/time");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/time/login"));
});

// ---------- Everything below requires a Time Tracking account ----------
router.use(requireTimeUser);

router.use("/projects", require("./time-projects"));
router.use("/services", require("./time-services"));

function pad2(n) { return String(n).padStart(2, "0"); }
function nowHHMM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Duration in minutes between two "HH:MM" strings on the same nominal shift;
// if end < start, assume the shift crossed midnight.
function computeDurationMinutes(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

function stopEntry(id) {
  const entry = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id);
  if (!entry || entry.end_time) return;
  const end = nowHHMM();
  const duration = computeDurationMinutes(entry.start_time, end);
  db.prepare("UPDATE time_entries SET end_time = ?, duration_minutes = ?, updated_at = datetime('now') WHERE id = ?")
    .run(end, duration, id);
}

function loadTimePageData(userId) {
  const running = db
    .prepare(
      `SELECT te.*, p.name AS project_name, c.name AS client_name
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE te.time_user_id = ? AND te.end_time IS NULL`
    )
    .get(userId);

  const projects = db
    .prepare(
      `SELECT p.id, p.name, c.name AS client_name
       FROM projects p JOIN clients c ON c.id = p.client_id
       WHERE p.status = 'Active' ORDER BY c.name, p.name`
    )
    .all();

  const services = db.prepare("SELECT id, name FROM services WHERE is_active = 1 ORDER BY name").all();

  const recentEntries = db
    .prepare(
      `SELECT te.*, p.name AS project_name, c.name AS client_name, s.name AS service_name
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN services s ON s.id = te.service_id
       WHERE te.time_user_id = ? AND te.date >= date('now', '-7 days')
       ORDER BY te.date DESC, te.start_time DESC`
    )
    .all(userId);

  return { running, projects, services, recentEntries };
}

router.get("/", (req, res) => {
  const data = loadTimePageData(req.session.timeUserId);
  res.render("time/dashboard", { userName: req.session.timeUserName, ...data, error: null });
});

function renderWithError(req, res, error) {
  const data = loadTimePageData(req.session.timeUserId);
  return res.render("time/dashboard", { userName: req.session.timeUserName, ...data, error });
}

function projectExists(id) {
  return !!db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
}

router.post("/start", (req, res) => {
  const { project_id, service_id, description } = req.body;

  if (!project_id || !projectExists(project_id)) {
    return renderWithError(req, res, "Please select a valid project.");
  }

  const userId = req.session.timeUserId;
  const existing = db.prepare("SELECT id FROM time_entries WHERE time_user_id = ? AND end_time IS NULL").get(userId);
  if (existing) stopEntry(existing.id);

  db.prepare(
    `INSERT INTO time_entries (time_user_id, project_id, service_id, description, date, start_time, is_manual)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(userId, project_id, service_id || null, description || null, todayISO(), nowHHMM());

  res.redirect("/time");
});

router.post("/stop", (req, res) => {
  const userId = req.session.timeUserId;
  const existing = db.prepare("SELECT id FROM time_entries WHERE time_user_id = ? AND end_time IS NULL").get(userId);
  if (existing) stopEntry(existing.id);
  res.redirect("/time");
});

router.post("/manual", (req, res) => {
  const { project_id, service_id, description, date, start_time, end_time } = req.body;

  if (!project_id || !date || !start_time || !end_time) {
    return renderWithError(req, res, "Please fill in project, date, start time, and end time.");
  }
  if (!projectExists(project_id)) {
    return renderWithError(req, res, "Please select a valid project.");
  }

  const duration = computeDurationMinutes(start_time, end_time);
  db.prepare(
    `INSERT INTO time_entries (time_user_id, project_id, service_id, description, date, start_time, end_time, duration_minutes, is_manual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(req.session.timeUserId, project_id, service_id || null, description || null, date, start_time, end_time, duration);

  res.redirect("/time");
});

router.post("/:id/delete", (req, res) => {
  const entry = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id);
  if (!entry) return res.status(404).send("Time entry not found");
  if (entry.time_user_id !== req.session.timeUserId) {
    return res.status(403).send("You can only delete your own time entries.");
  }
  db.prepare("DELETE FROM time_entries WHERE id = ?").run(req.params.id);
  res.redirect("/time");
});

module.exports = router;
