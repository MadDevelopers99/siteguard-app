// Centralized report queries for the Time Tracking Reports screen (mirrors
// utils/order-query.js's "one shared query, many consumers" shape).
const db = require("../db/database");

function timeReport() {
  const rows = db
    .prepare(
      `SELECT tu.id, tu.name,
              COALESCE(SUM(te.duration_minutes), 0) AS total_minutes,
              COALESCE(SUM(CASE WHEN te.status = 'Approved' THEN te.duration_minutes ELSE 0 END), 0) AS approved_minutes,
              COALESCE(SUM(CASE WHEN te.status = 'Pending' THEN te.duration_minutes ELSE 0 END), 0) AS pending_minutes
       FROM time_users tu
       LEFT JOIN time_entries te ON te.time_user_id = tu.id
       GROUP BY tu.id
       ORDER BY total_minutes DESC`
    )
    .all();

  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.total_minutes;
      acc.approved += r.approved_minutes;
      acc.pending += r.pending_minutes;
      return acc;
    },
    { total: 0, approved: 0, pending: 0 }
  );

  return { rows, totals };
}

function projectReport() {
  return db
    .prepare(
      `SELECT p.id, p.name, c.name AS client_name, p.budget_hours, p.hourly_rate,
              COALESCE(SUM(te.duration_minutes), 0) AS minutes_logged
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN time_entries te ON te.project_id = p.id
       GROUP BY p.id
       ORDER BY minutes_logged DESC`
    )
    .all()
    .map((p) => {
      const loggedHours = Math.round((p.minutes_logged / 60) * 100) / 100;
      const remaining = p.budget_hours != null ? Math.round((p.budget_hours - loggedHours) * 100) / 100 : null;
      return { ...p, loggedHours, remaining };
    });
}

// "Region" = the client's city — the only geographic grouping we honestly
// have without a real geocoded boundary dataset.
function spatialReport() {
  return db
    .prepare(
      `SELECT COALESCE(NULLIF(c.city, ''), 'Unspecified') AS region,
              COUNT(DISTINCT p.id) AS project_count,
              COALESCE(SUM(te.duration_minutes), 0) AS minutes_logged
       FROM clients c
       LEFT JOIN projects p ON p.client_id = c.id
       LEFT JOIN time_entries te ON te.project_id = p.id
       GROUP BY region
       HAVING project_count > 0
       ORDER BY minutes_logged DESC`
    )
    .all()
    .map((r) => ({ ...r, hoursLogged: Math.round((r.minutes_logged / 60) * 100) / 100 }));
}

// Only counts entries against projects with an hourly_rate set — an honest
// estimate, not a real payroll run (no wage/tax data exists in this app).
function payrollReport() {
  return db
    .prepare(
      `SELECT tu.id, tu.name,
              COALESCE(SUM(te.duration_minutes * p.hourly_rate / 60.0), 0) AS estimated_pay,
              COALESCE(SUM(te.duration_minutes), 0) AS minutes_logged
       FROM time_users tu
       LEFT JOIN time_entries te ON te.time_user_id = tu.id AND te.status = 'Approved'
       LEFT JOIN projects p ON p.id = te.project_id AND p.hourly_rate IS NOT NULL
       GROUP BY tu.id
       ORDER BY estimated_pay DESC`
    )
    .all()
    .map((r) => ({ ...r, hoursLogged: Math.round((r.minutes_logged / 60) * 100) / 100 }));
}

module.exports = { timeReport, projectReport, spatialReport, payrollReport };
