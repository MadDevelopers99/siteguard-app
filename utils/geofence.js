// Geofence containment + enter/exit detection for the Time Tracking portal.
// Nothing here talks to Traccar or the drivers/admins tables — this is a
// separate, self-contained location pipeline scoped to time_users/projects.
const db = require("../db/database");
const { startEntry, stopEntry, runningEntryFor } = require("./time-timer");

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// a/b: {lat, lng}. Returns great-circle distance in meters.
function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lastEventFor(geofenceId, timeUserId) {
  return db
    .prepare(
      `SELECT * FROM time_geofence_events
       WHERE geofence_id = ? AND time_user_id = ?
       ORDER BY occurred_at DESC, id DESC LIMIT 1`
    )
    .get(geofenceId, timeUserId);
}

// Records a location ping, checks it against every geofence, and writes
// enter/exit events for any geofence whose containment state changed since
// the user's last ping. Applies each geofence's arrival/departure behavior
// (auto start/stop the timer) and returns the list of transitions so the
// caller (an HTTP response) can also surface "prompt" behaviors to the user.
function recordLocationPing(timeUserId, lat, lng, accuracy) {
  db.prepare("INSERT INTO time_locations (time_user_id, lat, lng, accuracy) VALUES (?, ?, ?, ?)").run(
    timeUserId,
    lat,
    lng,
    accuracy || null
  );

  const geofences = db.prepare("SELECT * FROM time_geofences").all();
  const transitions = [];

  geofences.forEach((geofence) => {
    const distance = haversineMeters({ lat, lng }, { lat: geofence.lat, lng: geofence.lng });
    const isInside = distance <= geofence.radius_meters;
    const lastEvent = lastEventFor(geofence.id, timeUserId);
    const wasInside = !!lastEvent && lastEvent.event_type === "enter";

    if (isInside === wasInside) return;

    const eventType = isInside ? "enter" : "exit";
    db.prepare(
      `INSERT INTO time_geofence_events (geofence_id, time_user_id, event_type, lat, lng, accuracy)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(geofence.id, timeUserId, eventType, lat, lng, accuracy || null);

    let action = "none";
    if (eventType === "enter" && geofence.arrival_behavior === "Auto start timer") {
      startEntry(timeUserId, { projectId: geofence.project_id, checkIn: { lat, lng, accuracy } });
      action = "auto_started_timer";
    } else if (eventType === "exit" && geofence.departure_behavior === "Auto stop timer") {
      const running = runningEntryFor(timeUserId);
      if (running && running.project_id === geofence.project_id) {
        stopEntry(running.id);
        action = "auto_stopped_timer";
      }
    }

    transitions.push({
      geofenceId: geofence.id,
      geofenceName: geofence.name,
      projectId: geofence.project_id,
      eventType,
      arrivalBehavior: geofence.arrival_behavior,
      departureBehavior: geofence.departure_behavior,
      action
    });
  });

  return transitions;
}

module.exports = { haversineMeters, recordLocationPing };
