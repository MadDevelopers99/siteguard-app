const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { suggestRouteOrder, routeDistanceKm, ASSUMED_AVG_SPEED_KMH } = require("../utils/time-route-suggest");

function loadStops(userId) {
  return db
    .prepare(
      `SELECT j.*, p.name AS project_name, c.name AS client_name
       FROM time_jobs j
       JOIN projects p ON p.id = j.project_id
       JOIN clients c ON c.id = p.client_id
       WHERE j.assigned_time_user_id = ? AND j.status IN ('Assigned', 'In Progress') AND j.lat IS NOT NULL
       ORDER BY j.stop_order IS NULL, j.stop_order, j.scheduled_start`
    )
    .all(userId);
}

function startingPoint(userId) {
  return db.prepare("SELECT lat, lng FROM time_locations WHERE time_user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1").get(userId);
}

router.get("/", (req, res) => {
  const userId = req.query.user || req.session.timeUserId;
  const users = db.prepare("SELECT id, name FROM time_users ORDER BY name").all();
  const stops = loadStops(userId);
  const start = startingPoint(userId);

  const distanceKm = stops.length ? routeDistanceKm(stops, start) : 0;
  const travelMinutes = Math.round((distanceKm / ASSUMED_AVG_SPEED_KMH) * 60);

  res.render("time/route-planning", { userId, users, stops, start, distanceKm, travelMinutes });
});

router.post("/reorder", (req, res) => {
  const { user_id, job_id, direction } = req.body;
  const stops = loadStops(user_id);
  const idx = stops.findIndex((s) => String(s.id) === String(job_id));
  if (idx === -1) return res.redirect(`/time/route-planning?user=${user_id}`);

  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= stops.length) return res.redirect(`/time/route-planning?user=${user_id}`);

  [stops[idx], stops[swapWith]] = [stops[swapWith], stops[idx]];
  const update = db.prepare("UPDATE time_jobs SET stop_order = ? WHERE id = ?");
  stops.forEach((s, i) => update.run(i, s.id));

  res.redirect(`/time/route-planning?user=${user_id}`);
});

router.post("/optimize", (req, res) => {
  const { user_id } = req.body;
  const stops = loadStops(user_id);
  const start = startingPoint(user_id);
  const orderedIds = suggestRouteOrder(
    stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })),
    start
  );
  const update = db.prepare("UPDATE time_jobs SET stop_order = ? WHERE id = ?");
  orderedIds.forEach((id, i) => update.run(i, id));

  res.redirect(`/time/route-planning?user=${user_id}`);
});

module.exports = router;
