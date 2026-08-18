const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { requireTimeUser } = require("../middleware/auth");
const { computeDurationMinutes, stopEntry, startEntry, runningEntryFor } = require("../utils/time-timer");

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

// Shared across every /time sub-route (including mounted sub-routers below)
// so views never need to re-derive who's logged in / whether they're an admin.
router.use((req, res, next) => {
  const user = db.prepare("SELECT name, is_admin FROM time_users WHERE id = ?").get(req.session.timeUserId);
  res.locals.userName = user ? user.name : req.session.timeUserName;
  res.locals.isAdmin = !!(user && user.is_admin);
  next();
});

router.use("/projects", require("./time-projects"));
router.use("/services", require("./time-services"));
router.use("/location", require("./time-location"));
router.use("/geofences", require("./time-geofences"));
router.use("/integrations", require("./time-integrations"));
router.use("/team", require("./time-team"));
router.use("/jobs", require("./time-jobs"));
router.use("/dispatch", require("./time-dispatch"));
router.use("/route-planning", require("./time-route-planning"));
router.use("/assets", require("./time-assets"));
router.use("/calendar", require("./time-calendar"));
router.use("/reports", require("./time-reports"));
router.use("/gis", require("./time-gis"));
router.use("/m", require("./time-mobile"));
const { requireTimeAdmin } = require("../middleware/auth");
router.use("/admin", requireTimeAdmin, require("./time-admin"));

// ---------- Screen 1: ops Dashboard ----------
router.get("/", (req, res) => {
  const { getOpsDashboardData } = require("../utils/time-ops-data");
  res.render("time/ops-dashboard", getOpsDashboardData());
});

// ---------- Screen 2: Time Tracking (Timer / Manual / Timesheet / Approvals) ----------
function loadTrackingPageData(userId) {
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

  const timesheet = db
    .prepare(
      `SELECT te.*, p.name AS project_name, c.name AS client_name, s.name AS service_name
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN services s ON s.id = te.service_id
       WHERE te.time_user_id = ? AND te.date >= date('now', '-30 days')
       ORDER BY te.date DESC, te.start_time DESC`
    )
    .all(userId);

  return { running, projects, services, timesheet };
}

function loadApprovalsQueue() {
  return db
    .prepare(
      `SELECT te.*, tu.name AS staff_name, p.name AS project_name, c.name AS client_name
       FROM time_entries te
       JOIN time_users tu ON tu.id = te.time_user_id
       JOIN projects p ON p.id = te.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE te.status = 'Pending' AND te.end_time IS NOT NULL
       ORDER BY te.date DESC, te.start_time DESC`
    )
    .all();
}

router.get("/tracking", (req, res) => {
  const data = loadTrackingPageData(req.session.timeUserId);
  const approvals = res.locals.isAdmin ? loadApprovalsQueue() : [];
  res.render("time/tracking", { ...data, approvals, error: null, tab: req.query.tab || "timer" });
});

function renderWithError(req, res, error) {
  const data = loadTrackingPageData(req.session.timeUserId);
  const approvals = res.locals.isAdmin ? loadApprovalsQueue() : [];
  return res.render("time/tracking", { ...data, approvals, error, tab: "timer" });
}

function projectExists(id) {
  return !!db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
}

router.post("/start", (req, res) => {
  const { project_id, service_id, description, job_id } = req.body;

  if (!project_id || !projectExists(project_id)) {
    return renderWithError(req, res, "Please select a valid project.");
  }

  startEntry(req.session.timeUserId, {
    projectId: project_id,
    serviceId: service_id || null,
    description: description || null,
    jobId: job_id || null
  });

  res.redirect("/time/tracking");
});

router.post("/stop", (req, res) => {
  const existing = runningEntryFor(req.session.timeUserId);
  if (existing) stopEntry(existing.id);
  res.redirect("/time/tracking");
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
    `INSERT INTO time_entries (time_user_id, project_id, service_id, description, date, start_time, end_time, duration_minutes, is_manual, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Pending')`
  ).run(req.session.timeUserId, project_id, service_id || null, description || null, date, start_time, end_time, duration);

  res.redirect("/time/tracking");
});

router.post("/:id/delete", (req, res) => {
  const entry = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id);
  if (!entry) return res.status(404).send("Time entry not found");
  if (entry.time_user_id !== req.session.timeUserId) {
    return res.status(403).send("You can only delete your own time entries.");
  }
  db.prepare("DELETE FROM time_entries WHERE id = ?").run(req.params.id);
  res.redirect("/time/tracking");
});

// ---------- Screen 19: Time Entry + Location detail ----------
router.get("/entries/:id", (req, res) => {
  const entry = db
    .prepare(
      `SELECT te.*, tu.name AS staff_name, p.name AS project_name, c.name AS client_name, s.name AS service_name
       FROM time_entries te
       JOIN time_users tu ON tu.id = te.time_user_id
       JOIN projects p ON p.id = te.project_id
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN services s ON s.id = te.service_id
       WHERE te.id = ?`
    )
    .get(req.params.id);
  if (!entry) return res.status(404).send("Time entry not found");
  if (entry.time_user_id !== req.session.timeUserId && !res.locals.isAdmin) {
    return res.status(403).send("You can only view your own time entries.");
  }

  const events = db
    .prepare(
      `SELECT ge.*, g.name AS geofence_name
       FROM time_geofence_events ge
       JOIN time_geofences g ON g.id = ge.geofence_id
       WHERE ge.time_user_id = ? AND (ge.job_id = ? OR ? IS NULL)
       ORDER BY ge.occurred_at`
    )
    .all(entry.time_user_id, entry.job_id, entry.job_id);

  res.render("time/entry-detail", { entry, events });
});

router.post("/entries/:id/approve", requireTimeAdminInline, (req, res) => {
  db.prepare("UPDATE time_entries SET status = 'Approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?").run(
    req.session.timeUserId,
    req.params.id
  );
  res.redirect("/time/tracking");
});

router.post("/entries/:id/reject", requireTimeAdminInline, (req, res) => {
  db.prepare("UPDATE time_entries SET status = 'Rejected', approved_by = ?, approved_at = datetime('now') WHERE id = ?").run(
    req.session.timeUserId,
    req.params.id
  );
  res.redirect("/time/tracking");
});

function requireTimeAdminInline(req, res, next) {
  if (!res.locals.isAdmin) return res.status(403).send("Time Tracking admin access required.");
  next();
}

module.exports = router;
