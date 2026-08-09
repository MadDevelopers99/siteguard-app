const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { PROJECT_STATUS_OPTIONS } = require("../utils/constants");

router.use((req, res, next) => {
  res.locals.userName = req.session.timeUserName;
  next();
});

// ---------- List ----------
// NOTE: must be registered before GET "/:id" so "/new" isn't captured as an id.
router.get("/", (req, res) => {
  const { q, client_id, status } = req.query;

  let sql = `
    SELECT p.*, c.name AS client_name, c.company AS client_company,
           COALESCE(SUM(te.duration_minutes), 0) AS minutes_logged
    FROM projects p
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN time_entries te ON te.project_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (q) { sql += " AND p.name LIKE ?"; params.push(`%${q}%`); }
  if (client_id) { sql += " AND p.client_id = ?"; params.push(client_id); }
  if (status) { sql += " AND p.status = ?"; params.push(status); }
  sql += " GROUP BY p.id ORDER BY p.created_at DESC";

  const projects = db.prepare(sql).all(...params);
  const clients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();

  res.render("time/projects", {
    projects,
    clients,
    PROJECT_STATUS_OPTIONS,
    filters: { q: q || "", client_id: client_id || "", status: status || "" }
  });
});

// ---------- New ----------
router.get("/new", (req, res) => {
  const clients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
  res.render("time/project-form", { project: null, clients, PROJECT_STATUS_OPTIONS });
});

router.post("/", (req, res) => {
  const { client_id, name, description, status, budget_hours, hourly_rate } = req.body;
  try {
    const info = db
      .prepare(
        `INSERT INTO projects (client_id, name, description, status, budget_hours, hourly_rate)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        client_id,
        name,
        description || null,
        status || "Active",
        budget_hours ? parseFloat(budget_hours) : null,
        hourly_rate ? parseFloat(hourly_rate) : null
      );
    res.redirect(`/time/projects/${info.lastInsertRowid}`);
  } catch (err) {
    const clients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
    res.render("time/project-form", { project: req.body, clients, PROJECT_STATUS_OPTIONS, error: err.message });
  }
});

// ---------- Detail ----------
router.get("/:id", (req, res) => {
  const project = db
    .prepare(
      `SELECT p.*, c.name AS client_name, c.company AS client_company
       FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = ?`
    )
    .get(req.params.id);
  if (!project) return res.status(404).send("Project not found");

  const entries = db
    .prepare(
      `SELECT te.*, tu.name AS staff_name, s.name AS service_name
       FROM time_entries te
       LEFT JOIN time_users tu ON tu.id = te.time_user_id
       LEFT JOIN services s ON s.id = te.service_id
       WHERE te.project_id = ?
       ORDER BY te.date DESC, te.start_time DESC`
    )
    .all(project.id);

  const minutesLogged = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const hoursLogged = Math.round((minutesLogged / 60) * 100) / 100;
  const remainingHours = project.budget_hours != null ? Math.round((project.budget_hours - hoursLogged) * 100) / 100 : null;

  res.render("time/project-detail", { project, entries, hoursLogged, remainingHours });
});

// ---------- Edit ----------
router.get("/:id/edit", (req, res) => {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).send("Project not found");
  const clients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
  res.render("time/project-form", { project, clients, PROJECT_STATUS_OPTIONS });
});

router.post("/:id", (req, res) => {
  const { client_id, name, description, status, budget_hours, hourly_rate } = req.body;
  try {
    db.prepare(
      `UPDATE projects SET client_id = ?, name = ?, description = ?, status = ?, budget_hours = ?, hourly_rate = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).run(
      client_id,
      name,
      description || null,
      status || "Active",
      budget_hours ? parseFloat(budget_hours) : null,
      hourly_rate ? parseFloat(hourly_rate) : null,
      req.params.id
    );
    res.redirect(`/time/projects/${req.params.id}`);
  } catch (err) {
    const clients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
    res.render("time/project-form", {
      project: { ...req.body, id: req.params.id },
      clients,
      PROJECT_STATUS_OPTIONS,
      error: err.message
    });
  }
});

module.exports = router;
