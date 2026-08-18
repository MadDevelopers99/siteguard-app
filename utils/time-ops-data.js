// Shared query functions for the Time Tracking ops Dashboard — consumed by
// both the desktop Dashboard (routes/time-tracking.js) and Mobile Home
// (routes/time-mobile.js) so the two never show different numbers.
const db = require("../db/database");

function hoursTodayMinutes() {
  const row = db
    .prepare("SELECT COALESCE(SUM(duration_minutes), 0) AS minutes FROM time_entries WHERE date = date('now')")
    .get();
  return row.minutes;
}

function activeProjectsCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status = 'Active'").get().n;
}

// Mirrors the status derivation in routes/time-team.js: "on site" = has a
// running timer whose most recent geofence event was an 'enter'.
function onSiteUsers() {
  const running = db
    .prepare(
      `SELECT te.time_user_id, tu.name FROM time_entries te
       JOIN time_users tu ON tu.id = te.time_user_id
       WHERE te.end_time IS NULL`
    )
    .all();

  return running.filter((r) => {
    const lastEvent = db
      .prepare(`SELECT event_type FROM time_geofence_events WHERE time_user_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1`)
      .get(r.time_user_id);
    return lastEvent && lastEvent.event_type === "enter";
  });
}

function pendingApprovalsCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE status = 'Pending' AND end_time IS NOT NULL").get().n;
}

function weeklyHours() {
  return db
    .prepare(
      `SELECT date, COALESCE(SUM(duration_minutes), 0) AS minutes
       FROM time_entries
       WHERE date >= date('now', '-6 days')
       GROUP BY date`
    )
    .all();
}

function projectUtilization() {
  return db
    .prepare(
      `SELECT p.id, p.name, c.name AS client_name, p.budget_hours,
              COALESCE(SUM(te.duration_minutes), 0) AS minutes_logged
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN time_entries te ON te.project_id = p.id
       WHERE p.status = 'Active'
       GROUP BY p.id
       ORDER BY minutes_logged DESC
       LIMIT 6`
    )
    .all()
    .map((p) => {
      const loggedHours = Math.round((p.minutes_logged / 60) * 100) / 100;
      const pct = p.budget_hours ? Math.min(100, Math.round((loggedHours / p.budget_hours) * 100)) : null;
      return { ...p, loggedHours, pct };
    });
}

function recentEntriesOrgWide(limit) {
  return db
    .prepare(
      `SELECT te.*, tu.name AS staff_name, p.name AS project_name, c.name AS client_name
       FROM time_entries te
       JOIN time_users tu ON tu.id = te.time_user_id
       JOIN projects p ON p.id = te.project_id
       JOIN clients c ON c.id = p.client_id
       ORDER BY te.date DESC, te.start_time DESC
       LIMIT ?`
    )
    .all(limit || 8);
}

function fieldStatus(limit) {
  const users = db.prepare("SELECT id, name FROM time_users ORDER BY name").all();
  return users
    .map((u) => {
      const running = db
        .prepare(
          `SELECT te.*, p.name AS project_name FROM time_entries te JOIN projects p ON p.id = te.project_id
           WHERE te.time_user_id = ? AND te.end_time IS NULL`
        )
        .get(u.id);
      if (!running) return { ...u, status: "Offline", running: null };
      const lastEvent = db
        .prepare(`SELECT event_type FROM time_geofence_events WHERE time_user_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1`)
        .get(u.id);
      return { ...u, status: lastEvent && lastEvent.event_type === "enter" ? "On site" : "Travelling", running };
    })
    .filter((u) => u.status !== "Offline")
    .slice(0, limit || 8);
}

function getOpsDashboardData() {
  return {
    hoursTodayMinutes: hoursTodayMinutes(),
    activeProjectsCount: activeProjectsCount(),
    onSiteCount: onSiteUsers().length,
    pendingApprovalsCount: pendingApprovalsCount(),
    weeklyHours: weeklyHours(),
    projectUtilization: projectUtilization(),
    recentEntries: recentEntriesOrgWide(8),
    fieldStatus: fieldStatus(8)
  };
}

module.exports = { getOpsDashboardData };
