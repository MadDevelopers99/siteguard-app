const express = require("express");
const router = express.Router();
const db = require("../db/database");

function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function mondayOf(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

router.get("/", (req, res) => {
  const monday = mondayOf(req.query.week);
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    weekDates.push(toISO(d));
  }
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  const jobs = db
    .prepare(
      `SELECT j.*, p.name AS project_name, c.name AS client_name, tu.name AS assigned_name
       FROM time_jobs j
       JOIN projects p ON p.id = j.project_id
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN time_users tu ON tu.id = j.assigned_time_user_id
       WHERE j.scheduled_date BETWEEN ? AND ?`
    )
    .all(weekStart, weekEnd);

  const entries = db
    .prepare(
      `SELECT te.*, tu.name AS staff_name, p.name AS project_name
       FROM time_entries te
       JOIN time_users tu ON tu.id = te.time_user_id
       JOIN projects p ON p.id = te.project_id
       WHERE te.date BETWEEN ? AND ?`
    )
    .all(weekStart, weekEnd);

  const daysOff = db
    .prepare(
      `SELECT d.*, tu.name AS staff_name FROM time_day_off d JOIN time_users tu ON tu.id = d.time_user_id
       WHERE d.date BETWEEN ? AND ?`
    )
    .all(weekStart, weekEnd);

  const days = weekDates.map((date) => ({
    date,
    jobs: jobs.filter((j) => j.scheduled_date === date),
    entries: entries.filter((e) => e.date === date),
    daysOff: daysOff.filter((d) => d.date === date)
  }));

  const users = db.prepare("SELECT id, name FROM time_users ORDER BY name").all();
  const prevWeek = new Date(monday);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(monday);
  nextWeek.setDate(nextWeek.getDate() + 7);

  res.render("time/calendar", {
    days,
    weekStart,
    weekEnd,
    users,
    prevWeek: toISO(prevWeek),
    nextWeek: toISO(nextWeek)
  });
});

router.post("/day-off", (req, res) => {
  const { time_user_id, date, note } = req.body;
  if (time_user_id && date) {
    db.prepare("INSERT OR IGNORE INTO time_day_off (time_user_id, date, note) VALUES (?, ?, ?)").run(time_user_id, date, note || null);
  }
  res.redirect(`/time/calendar?week=${req.body.week || ""}`);
});

router.post("/day-off/:id/delete", (req, res) => {
  db.prepare("DELETE FROM time_day_off WHERE id = ?").run(req.params.id);
  res.redirect(`/time/calendar?week=${req.body.week || ""}`);
});

module.exports = router;
