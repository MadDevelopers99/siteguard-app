const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { GEOFENCE_ARRIVAL_OPTIONS, GEOFENCE_DEPARTURE_OPTIONS } = require("../utils/constants");

router.get("/", (req, res) => {
  const { project_id } = req.query;
  let sql = `
    SELECT g.*, p.name AS project_name, c.name AS client_name
    FROM time_geofences g
    JOIN projects p ON p.id = g.project_id
    JOIN clients c ON c.id = p.client_id
    WHERE 1=1
  `;
  const params = [];
  if (project_id) {
    sql += " AND g.project_id = ?";
    params.push(project_id);
  }
  sql += " ORDER BY g.created_at DESC";
  const geofences = db.prepare(sql).all(...params);

  res.render("time/geofences", { geofences, filterProjectId: project_id || "" });
});

router.get("/new", (req, res) => {
  const projects = db
    .prepare(
      `SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id ORDER BY c.name, p.name`
    )
    .all();
  res.render("time/geofence-form", {
    geofence: null,
    projects,
    GEOFENCE_ARRIVAL_OPTIONS,
    GEOFENCE_DEPARTURE_OPTIONS,
    error: null
  });
});

function geofenceBody(req) {
  const { project_id, name, lat, lng, radius_meters, check_in_required, arrival_behavior, departure_behavior, retention_days } =
    req.body;
  return {
    project_id,
    name: name || "Site",
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    radius_meters: radius_meters ? parseFloat(radius_meters) : 150,
    check_in_required: check_in_required ? 1 : 0,
    arrival_behavior: arrival_behavior || "Notify only",
    departure_behavior: departure_behavior || "Notify only",
    retention_days: retention_days ? parseInt(retention_days, 10) : 90
  };
}

router.post("/", (req, res) => {
  const b = geofenceBody(req);
  if (!b.project_id || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
    const projects = db
      .prepare(`SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id ORDER BY c.name, p.name`)
      .all();
    return res.render("time/geofence-form", {
      geofence: req.body,
      projects,
      GEOFENCE_ARRIVAL_OPTIONS,
      GEOFENCE_DEPARTURE_OPTIONS,
      error: "Please select a project and pick a location on the map."
    });
  }

  const info = db
    .prepare(
      `INSERT INTO time_geofences (project_id, name, lat, lng, radius_meters, check_in_required, arrival_behavior, departure_behavior, retention_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(b.project_id, b.name, b.lat, b.lng, b.radius_meters, b.check_in_required, b.arrival_behavior, b.departure_behavior, b.retention_days);

  res.redirect(`/time/geofences?project_id=${info.lastInsertRowid ? b.project_id : ""}`);
});

router.get("/:id/edit", (req, res) => {
  const geofence = db.prepare("SELECT * FROM time_geofences WHERE id = ?").get(req.params.id);
  if (!geofence) return res.status(404).send("Geofence not found");
  const projects = db
    .prepare(`SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id ORDER BY c.name, p.name`)
    .all();
  res.render("time/geofence-form", {
    geofence,
    projects,
    GEOFENCE_ARRIVAL_OPTIONS,
    GEOFENCE_DEPARTURE_OPTIONS,
    error: null
  });
});

router.post("/:id", (req, res) => {
  const b = geofenceBody(req);
  db.prepare(
    `UPDATE time_geofences SET project_id = ?, name = ?, lat = ?, lng = ?, radius_meters = ?, check_in_required = ?,
     arrival_behavior = ?, departure_behavior = ?, retention_days = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(b.project_id, b.name, b.lat, b.lng, b.radius_meters, b.check_in_required, b.arrival_behavior, b.departure_behavior, b.retention_days, req.params.id);
  res.redirect("/time/geofences");
});

router.post("/:id/delete", (req, res) => {
  db.prepare("DELETE FROM time_geofences WHERE id = ?").run(req.params.id);
  res.redirect("/time/geofences");
});

module.exports = router;
