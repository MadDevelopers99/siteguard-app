const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { TIME_JOB_STATUS_OPTIONS } = require("../utils/constants");

router.get("/", (req, res) => {
  const { mine } = req.query;
  let sql = `
    SELECT j.*, p.name AS project_name, c.name AS client_name, tu.name AS assigned_name
    FROM time_jobs j
    JOIN projects p ON p.id = j.project_id
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN time_users tu ON tu.id = j.assigned_time_user_id
    WHERE 1=1
  `;
  const params = [];
  if (mine) {
    sql += " AND j.assigned_time_user_id = ?";
    params.push(req.session.timeUserId);
  }
  sql += " ORDER BY j.scheduled_date IS NULL, j.scheduled_date, j.scheduled_start";
  const jobs = db.prepare(sql).all(...params);

  res.render("time/jobs", { jobs, mine: !!mine });
});

function loadFormRefData() {
  const projects = db
    .prepare(`SELECT p.id, p.name, c.name AS client_name, p.lat, p.lng FROM projects p JOIN clients c ON c.id = p.client_id ORDER BY c.name, p.name`)
    .all();
  const geofences = db.prepare("SELECT project_id, lat, lng FROM time_geofences").all();
  const services = db.prepare("SELECT id, name FROM services WHERE is_active = 1 ORDER BY name").all();
  return { projects, geofences, services };
}

router.get("/new", (req, res) => {
  res.render("time/job-form", { job: null, ...loadFormRefData(), TIME_JOB_STATUS_OPTIONS, error: null });
});

function jobBody(req) {
  const { project_id, title, instructions, scheduled_date, scheduled_start, scheduled_end, lat, lng, service_id } = req.body;
  return {
    project_id,
    title,
    instructions: instructions || null,
    scheduled_date: scheduled_date || null,
    scheduled_start: scheduled_start || null,
    scheduled_end: scheduled_end || null,
    lat: lat ? parseFloat(lat) : null,
    lng: lng ? parseFloat(lng) : null,
    service_id: service_id || null
  };
}

router.post("/", (req, res) => {
  const b = jobBody(req);
  if (!b.project_id || !b.title) {
    return res.render("time/job-form", {
      job: req.body,
      ...loadFormRefData(),
      TIME_JOB_STATUS_OPTIONS,
      error: "Please select a project and enter a title."
    });
  }

  // Default the job's location to the project's primary geofence if the
  // job form didn't pick a point of its own.
  let lat = b.lat;
  let lng = b.lng;
  if (lat == null || lng == null) {
    const geofence = db.prepare("SELECT lat, lng FROM time_geofences WHERE project_id = ? ORDER BY id LIMIT 1").get(b.project_id);
    if (geofence) {
      lat = geofence.lat;
      lng = geofence.lng;
    }
  }

  const info = db
    .prepare(
      `INSERT INTO time_jobs (project_id, title, instructions, scheduled_date, scheduled_start, scheduled_end, lat, lng, service_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(b.project_id, b.title, b.instructions, b.scheduled_date, b.scheduled_start, b.scheduled_end, lat, lng, b.service_id);

  res.redirect(`/time/jobs/${info.lastInsertRowid}`);
});

router.get("/:id", (req, res) => {
  const job = db
    .prepare(
      `SELECT j.*, p.name AS project_name, c.name AS client_name, tu.name AS assigned_name
       FROM time_jobs j
       JOIN projects p ON p.id = j.project_id
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN time_users tu ON tu.id = j.assigned_time_user_id
       WHERE j.id = ?`
    )
    .get(req.params.id);
  if (!job) return res.status(404).send("Job not found");

  const checklist = job.checklist ? JSON.parse(job.checklist) : [];
  res.render("time/job-detail", { job, checklist });
});

router.get("/:id/edit", (req, res) => {
  const job = db.prepare("SELECT * FROM time_jobs WHERE id = ?").get(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  res.render("time/job-form", { job, ...loadFormRefData(), TIME_JOB_STATUS_OPTIONS, error: null });
});

router.post("/:id", (req, res) => {
  const b = jobBody(req);
  const { status } = req.body;
  db.prepare(
    `UPDATE time_jobs SET project_id = ?, title = ?, instructions = ?, scheduled_date = ?, scheduled_start = ?,
     scheduled_end = ?, lat = ?, lng = ?, service_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    b.project_id, b.title, b.instructions, b.scheduled_date, b.scheduled_start, b.scheduled_end,
    b.lat, b.lng, b.service_id, status || "Unassigned", req.params.id
  );
  res.redirect(`/time/jobs/${req.params.id}`);
});

router.post("/:id/checklist", (req, res) => {
  const job = db.prepare("SELECT checklist FROM time_jobs WHERE id = ?").get(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  const checklist = job.checklist ? JSON.parse(job.checklist) : [];
  const { text, toggle_index } = req.body;
  if (text) {
    checklist.push({ text, done: false });
  } else if (toggle_index != null) {
    const idx = parseInt(toggle_index, 10);
    if (checklist[idx]) checklist[idx].done = !checklist[idx].done;
  }
  db.prepare("UPDATE time_jobs SET checklist = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(checklist), req.params.id);
  res.redirect(`/time/jobs/${req.params.id}`);
});

router.post("/:id/delete", (req, res) => {
  db.prepare("DELETE FROM time_jobs WHERE id = ?").run(req.params.id);
  res.redirect("/time/jobs");
});

module.exports = router;
