// Single shared implementation of "what does starting/stopping a timer mean"
// for the Time Tracking portal — consumed by the manual UI (routes/time-tracking.js),
// geofence auto start/stop (utils/geofence.js), and mobile check-in (routes/time-mobile.js),
// so none of them can drift out of sync with each other.
const db = require("../db/database");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowHHMM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Duration in minutes between two "HH:MM" strings on the same nominal shift;
// if end < start, assume the shift crossed midnight.
function computeDurationMinutes(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

function runningEntryFor(timeUserId) {
  return db.prepare("SELECT * FROM time_entries WHERE time_user_id = ? AND end_time IS NULL").get(timeUserId);
}

function stopEntry(id) {
  const entry = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id);
  if (!entry || entry.end_time) return;
  const end = nowHHMM();
  const duration = computeDurationMinutes(entry.start_time, end);
  db.prepare("UPDATE time_entries SET end_time = ?, duration_minutes = ?, updated_at = datetime('now') WHERE id = ?").run(
    end,
    duration,
    id
  );
}

// Auto-stops any existing running entry for this user first — only one
// active timer per person. `checkIn` (optional) records the lat/lng/accuracy
// the timer was started from (geofence auto-start, mobile check-in).
function startEntry(timeUserId, { projectId, serviceId, description, jobId, checkIn }) {
  const existing = runningEntryFor(timeUserId);
  if (existing) stopEntry(existing.id);

  const info = db
    .prepare(
      `INSERT INTO time_entries
        (time_user_id, project_id, service_id, description, date, start_time, is_manual, job_id, status,
         check_in_lat, check_in_lng, check_in_accuracy, location_verified)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'Pending', ?, ?, ?, ?)`
    )
    .run(
      timeUserId,
      projectId,
      serviceId || null,
      description || null,
      todayISO(),
      nowHHMM(),
      jobId || null,
      checkIn ? checkIn.lat : null,
      checkIn ? checkIn.lng : null,
      checkIn ? checkIn.accuracy : null,
      checkIn ? 1 : 0
    );
  return info.lastInsertRowid;
}

module.exports = {
  pad2,
  nowHHMM,
  todayISO,
  computeDurationMinutes,
  runningEntryFor,
  stopEntry,
  startEntry
};
