const express = require("express");
const router = express.Router();
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db/database");
const { getOpsDashboardData } = require("../utils/time-ops-data");
const { startEntry, stopEntry, runningEntryFor } = require("../utils/time-timer");
const { haversineMeters } = require("../utils/geofence");

const uploadsDir = path.join(__dirname, "..", "uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + path.extname(file.originalname))
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// ---------- Screen 14: Mobile Home ----------
router.get("/home", (req, res) => {
  const userId = req.session.timeUserId;
  const running = db
    .prepare(
      `SELECT te.*, p.name AS project_name, c.name AS client_name
       FROM time_entries te JOIN projects p ON p.id = te.project_id JOIN clients c ON c.id = p.client_id
       WHERE te.time_user_id = ? AND te.end_time IS NULL`
    )
    .get(userId);

  const todayJobs = db
    .prepare(
      `SELECT j.*, p.name AS project_name, c.name AS client_name
       FROM time_jobs j JOIN projects p ON p.id = j.project_id JOIN clients c ON c.id = p.client_id
       WHERE j.assigned_time_user_id = ? AND j.scheduled_date = date('now') AND j.status != 'Completed'
       ORDER BY j.scheduled_start`
    )
    .all(userId);

  const { hoursTodayMinutes } = getOpsDashboardData();

  res.render("time/mobile/home", { running, todayJobs, hoursTodayMinutes, userName: res.locals.userName });
});

// ---------- Screen 16: Mobile Job Detail ----------
router.get("/jobs/:id", (req, res) => {
  const job = db
    .prepare(
      `SELECT j.*, p.name AS project_name, c.name AS client_name
       FROM time_jobs j JOIN projects p ON p.id = j.project_id JOIN clients c ON c.id = p.client_id
       WHERE j.id = ?`
    )
    .get(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  const checklist = job.checklist ? JSON.parse(job.checklist) : [];
  res.render("time/mobile/job-detail", { job, checklist });
});

router.post("/jobs/:id/checklist", (req, res) => {
  const job = db.prepare("SELECT checklist FROM time_jobs WHERE id = ?").get(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  const checklist = job.checklist ? JSON.parse(job.checklist) : [];
  const { toggle_index } = req.body;
  const idx = parseInt(toggle_index, 10);
  if (checklist[idx]) checklist[idx].done = !checklist[idx].done;
  db.prepare("UPDATE time_jobs SET checklist = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(checklist), req.params.id);
  res.redirect(`/time/m/jobs/${req.params.id}`);
});

// ---------- Screen 15: Mobile Geofence Check-in ----------
router.get("/jobs/:id/checkin", (req, res) => {
  const job = db
    .prepare(`SELECT j.*, p.name AS project_name, c.name AS client_name FROM time_jobs j JOIN projects p ON p.id = j.project_id JOIN clients c ON c.id = p.client_id WHERE j.id = ?`)
    .get(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  const geofence = db.prepare("SELECT * FROM time_geofences WHERE project_id = ? ORDER BY id LIMIT 1").get(job.project_id);
  res.render("time/mobile/checkin", { job, geofence, error: null, tooFar: false });
});

router.post("/jobs/:id/checkin", (req, res) => {
  const job = db.prepare("SELECT * FROM time_jobs WHERE id = ?").get(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  const geofence = db.prepare("SELECT * FROM time_geofences WHERE project_id = ? ORDER BY id LIMIT 1").get(job.project_id);

  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  const accuracy = req.body.accuracy ? parseFloat(req.body.accuracy) : null;
  const force = req.body.force === "1";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.render("time/mobile/checkin", { job, geofence, error: "Could not read your location — try again.", tooFar: false, lat: null, lng: null });
  }

  const distance = geofence ? haversineMeters({ lat, lng }, { lat: geofence.lat, lng: geofence.lng }) : null;
  const withinRadius = geofence ? distance <= geofence.radius_meters : true;

  if (!withinRadius && !force) {
    return res.render("time/mobile/checkin", {
      job,
      geofence,
      error: `You're about ${Math.round(distance)}m from ${geofence.name}. Move closer, or start anyway.`,
      tooFar: true,
      lat,
      lng
    });
  }

  if (geofence) {
    db.prepare("INSERT INTO time_geofence_events (geofence_id, time_user_id, job_id, event_type, lat, lng, accuracy) VALUES (?, ?, ?, 'enter', ?, ?, ?)").run(
      geofence.id,
      req.session.timeUserId,
      job.id,
      lat,
      lng,
      accuracy
    );
  }

  startEntry(req.session.timeUserId, {
    projectId: job.project_id,
    serviceId: job.service_id || null,
    description: job.title,
    jobId: job.id,
    checkIn: { lat, lng, accuracy }
  });

  if (job.status === "Assigned") {
    db.prepare("UPDATE time_jobs SET status = 'In Progress', updated_at = datetime('now') WHERE id = ?").run(job.id);
  }

  res.redirect(`/time/m/jobs/${job.id}`);
});

// ---------- Screen 17: Proof of Service ----------
router.get("/jobs/:id/proof", (req, res) => {
  const job = db.prepare("SELECT * FROM time_jobs WHERE id = ?").get(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  const photos = db.prepare("SELECT * FROM documents WHERE entity_type = 'time_job' AND entity_id = ? ORDER BY created_at DESC").all(job.id);
  res.render("time/mobile/proof", { job, photos, error: null });
});

// Dedicated download route (not /admin/documents/...) — that path is gated by
// requireAnyRole (Admin/Driver sessions only) and would bounce a time_user.
router.get("/photos/:docId/download", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND entity_type = 'time_job'").get(req.params.docId);
  if (!doc) return res.status(404).send("Photo not found");
  res.download(path.join(uploadsDir, doc.stored_filename), doc.original_name);
});

router.post("/jobs/:id/proof/photo", upload.single("file"), (req, res) => {
  if (req.file) {
    db.prepare(
      `INSERT INTO documents (entity_type, entity_id, category, original_name, stored_filename, uploaded_by, status)
       VALUES ('time_job', ?, 'Proof of Service', ?, ?, ?, 'Uploaded')`
    ).run(req.params.id, req.file.originalname, req.file.filename, res.locals.userName || "Time User");
  }
  res.redirect(`/time/m/jobs/${req.params.id}/proof`);
});

router.post("/jobs/:id/proof", (req, res) => {
  const { signature_data, completion_notes } = req.body;
  const job = db.prepare("SELECT * FROM time_jobs WHERE id = ?").get(req.params.id);
  if (!job) return res.status(404).send("Job not found");

  db.prepare(
    `UPDATE time_jobs SET signature_data = ?, completion_notes = ?, status = 'Completed',
     completed_at = datetime('now'), completed_by = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(signature_data || null, completion_notes || null, req.session.timeUserId, job.id);

  const running = runningEntryFor(req.session.timeUserId);
  if (running && running.job_id === job.id) {
    stopEntry(running.id);
  }

  res.redirect("/time/m/home");
});

// ---------- Screen 18: Offline Mode ----------
router.get("/offline", (req, res) => {
  const projects = db
    .prepare(`SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.status = 'Active' ORDER BY c.name, p.name`)
    .all();
  res.render("time/mobile/offline", { projects });
});

module.exports = router;
