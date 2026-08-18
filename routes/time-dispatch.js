const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { haversineMeters } = require("../utils/geofence");

function activeJobCount(timeUserId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM time_jobs WHERE assigned_time_user_id = ? AND status IN ('Assigned','In Progress')")
    .get(timeUserId).n;
}

function lastKnownLocation(timeUserId) {
  return db
    .prepare("SELECT lat, lng FROM time_locations WHERE time_user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1")
    .get(timeUserId);
}

// Ranks every time_user for a given job: closer wins, a matching skill wins,
// staff already juggling more active jobs lose. No routing API — straight-line
// distance only, consistent with the Route Planning screen's approach.
function scoreCandidates(job) {
  const users = db.prepare("SELECT id, name FROM time_users ORDER BY name").all();

  return users
    .map((u) => {
      const loc = lastKnownLocation(u.id);
      const distanceKm =
        loc && job.lat != null && job.lng != null
          ? haversineMeters({ lat: loc.lat, lng: loc.lng }, { lat: job.lat, lng: job.lng }) / 1000
          : null;
      const hasSkill = job.service_id
        ? !!db.prepare("SELECT 1 FROM time_user_skills WHERE time_user_id = ? AND service_id = ?").get(u.id, job.service_id)
        : true;
      const activeJobs = activeJobCount(u.id);

      const distancePenalty = distanceKm != null ? distanceKm : 500; // unknown location ranks far behind known ones
      const score = distancePenalty + activeJobs * 5 - (hasSkill ? 10 : 0);

      return { ...u, distanceKm, hasSkill, activeJobs, score };
    })
    .sort((a, b) => a.score - b.score);
}

router.get("/", (req, res) => {
  const unassigned = db
    .prepare(
      `SELECT j.*, p.name AS project_name, c.name AS client_name
       FROM time_jobs j
       JOIN projects p ON p.id = j.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE j.status = 'Unassigned'
       ORDER BY j.scheduled_date IS NULL, j.scheduled_date, j.scheduled_start`
    )
    .all();

  let selectedJob = null;
  let candidates = [];
  if (req.query.job) {
    selectedJob = db.prepare("SELECT * FROM time_jobs WHERE id = ?").get(req.query.job);
    if (selectedJob) candidates = scoreCandidates(selectedJob);
  }

  res.render("time/dispatch", { unassigned, selectedJob, candidates });
});

router.post("/:jobId/assign", (req, res) => {
  const { time_user_id } = req.body;
  db.prepare("UPDATE time_jobs SET assigned_time_user_id = ?, status = 'Assigned', updated_at = datetime('now') WHERE id = ?").run(
    time_user_id,
    req.params.jobId
  );
  res.redirect("/time/dispatch");
});

module.exports = router;
