const express = require("express");
const router = express.Router();
const db = require("../db/database");

router.get("/", (req, res) => {
  const users = db.prepare("SELECT id, name, email FROM time_users ORDER BY name").all();

  const team = users.map((u) => {
    const running = db
      .prepare(
        `SELECT te.*, p.name AS project_name, c.name AS client_name
         FROM time_entries te
         JOIN projects p ON p.id = te.project_id
         JOIN clients c ON c.id = p.client_id
         WHERE te.time_user_id = ? AND te.end_time IS NULL`
      )
      .get(u.id);

    // Privacy-aware: we only ever look up / expose a precise position for
    // staff who currently have an active timer. Idle staff show status only.
    let status = "Offline";
    let position = null;
    if (running) {
      const lastEvent = db
        .prepare(`SELECT * FROM time_geofence_events WHERE time_user_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1`)
        .get(u.id);
      status = lastEvent && lastEvent.event_type === "enter" ? "On site" : "Travelling";

      const lastLoc = db
        .prepare(`SELECT lat, lng, recorded_at FROM time_locations WHERE time_user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`)
        .get(u.id);
      if (lastLoc) position = lastLoc;
    }

    const skillIds = db.prepare("SELECT service_id FROM time_user_skills WHERE time_user_id = ?").all(u.id).map((r) => r.service_id);

    return { ...u, status, running, position, skillIds };
  });

  const markers = team
    .filter((t) => t.position)
    .map((t) => ({
      lat: t.position.lat,
      lng: t.position.lng,
      label: `${t.name} — ${t.status}${t.running ? " · " + t.running.project_name : ""}`,
      color: t.status === "On site" ? "#18a85b" : "#e99722"
    }));

  const services = db.prepare("SELECT id, name FROM services WHERE is_active = 1 ORDER BY name").all();

  res.render("time/team", { team, markers, services });
});

// Replaces the full skill set for one staff member (checkbox list, submitted whole).
router.post("/:id/skills", (req, res) => {
  const { service_ids } = req.body;
  const ids = service_ids ? (Array.isArray(service_ids) ? service_ids : [service_ids]) : [];
  db.prepare("DELETE FROM time_user_skills WHERE time_user_id = ?").run(req.params.id);
  const insert = db.prepare("INSERT INTO time_user_skills (time_user_id, service_id) VALUES (?, ?)");
  ids.forEach((sid) => insert.run(req.params.id, sid));
  res.redirect("/time/team");
});

module.exports = router;
