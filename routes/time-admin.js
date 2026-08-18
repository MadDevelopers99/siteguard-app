const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { getOpsDashboardData } = require("../utils/time-ops-data");

router.get("/", (req, res) => {
  const usersCount = db.prepare("SELECT COUNT(*) AS n FROM time_users").get().n;
  const activeTodayCount = db
    .prepare("SELECT COUNT(DISTINCT time_user_id) AS n FROM time_entries WHERE date = date('now')")
    .get().n;
  const projectsCount = db.prepare("SELECT COUNT(*) AS n FROM projects").get().n;
  const { hoursTodayMinutes } = getOpsDashboardData();

  const endedEntries = db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE end_time IS NOT NULL").get().n;
  const approvedEntries = db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE status = 'Approved'").get().n;
  const locationVerifiedEntries = db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE location_verified = 1").get().n;
  const manualEntries = db.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE is_manual = 1 AND end_time IS NOT NULL").get().n;

  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

  const missingTimesheets = db
    .prepare(
      `SELECT COUNT(*) AS n FROM time_users tu
       WHERE NOT EXISTS (
         SELECT 1 FROM time_entries te WHERE te.time_user_id = tu.id AND te.date >= date('now', '-6 days')
       )`
    )
    .get().n;

  res.render("time/admin-dashboard", {
    usersCount,
    activeTodayCount,
    projectsCount,
    hoursTodayMinutes,
    approvedPct: pct(approvedEntries, endedEntries),
    locationVerifiedPct: pct(locationVerifiedEntries, endedEntries),
    manualPct: pct(manualEntries, endedEntries),
    missingTimesheets
  });
});

module.exports = router;
