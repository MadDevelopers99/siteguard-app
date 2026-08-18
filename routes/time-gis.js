const express = require("express");
const router = express.Router();
const db = require("../db/database");

router.get("/", (req, res) => {
  const projects = db
    .prepare(
      `SELECT p.id, p.name, c.name AS client_name, g.lat, g.lng
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       JOIN time_geofences g ON g.project_id = p.id
       GROUP BY p.id`
    )
    .all();

  const clients = db.prepare("SELECT id, name, company, lat, lng FROM clients WHERE lat IS NOT NULL AND lng IS NOT NULL").all();

  // Employees: only those currently with an active timer (privacy-aware, same rule as Team & Live Status).
  const employees = db
    .prepare(
      `SELECT tu.id, tu.name, tl.lat, tl.lng
       FROM time_users tu
       JOIN time_entries te ON te.time_user_id = tu.id AND te.end_time IS NULL
       JOIN time_locations tl ON tl.time_user_id = tu.id
       WHERE tl.id = (SELECT id FROM time_locations WHERE time_user_id = tu.id ORDER BY recorded_at DESC, id DESC LIMIT 1)`
    )
    .all();

  const jobs = db
    .prepare(
      `SELECT j.id, j.title, j.status, j.lat, j.lng, p.name AS project_name
       FROM time_jobs j JOIN projects p ON p.id = j.project_id
       WHERE j.lat IS NOT NULL AND j.status != 'Completed'`
    )
    .all();

  const assets = db.prepare("SELECT id, name, status, lat, lng FROM time_assets WHERE lat IS NOT NULL").all();

  const geofences = db.prepare("SELECT id, name, lat, lng, radius_meters FROM time_geofences").all();

  const clientsForPicker = db.prepare("SELECT id, name, company, lat, lng FROM clients ORDER BY name").all();

  res.render("time/gis-map", { projects, clients, employees, jobs, assets, geofences, clientsForPicker });
});

router.post("/clients/:id/location", (req, res) => {
  const { lat, lng } = req.body;
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    db.prepare("UPDATE clients SET lat = ?, lng = ? WHERE id = ?").run(latNum, lngNum, req.params.id);
  }
  res.redirect("/time/gis");
});

module.exports = router;
