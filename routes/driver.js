const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { requireDriver } = require("../middleware/auth");
const { SG_COMPANY, DRIVER_STATUS_OPTIONS } = require("../utils/constants");
const { suggestOrder } = require("../utils/route-suggest");
const { listDriverTasks, sortTimeFor, ACTIVE_STATUSES } = require("./driver-shared");

// ---------- Auth ----------
router.get("/login", (req, res) => {
  if (req.session.driverId) return res.redirect("/driver/home");
  res.render("driver/login", { error: null });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const driver = db.prepare("SELECT * FROM drivers WHERE email = ?").get(email);
  if (!driver || !bcrypt.compareSync(password || "", driver.password_hash)) {
    return res.render("driver/login", { error: "Invalid email or password." });
  }
  req.session.driverId = driver.id;
  req.session.driverName = driver.name;
  res.redirect("/driver/home");
});

router.post("/logout", (req, res) => {
  delete req.session.driverId;
  delete req.session.driverName;
  res.redirect("/driver/login");
});

router.use(requireDriver);

// Old single-page panel URLs — keep working for anyone with a stale link/bookmark.
router.get("/jobs", (req, res) => res.redirect(301, "/driver/tasks"));
router.get("/jobs/:id", (req, res) => res.redirect(301, `/driver/tasks/${req.params.id}`));
router.get("/", (req, res) => res.redirect("/driver/home"));

// ---------- Home Dashboard ----------
router.get("/home", (req, res) => {
  const driverId = req.session.driverId;
  const tasks = listDriverTasks(driverId);
  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = tasks.filter((t) => t.date_from && t.date_from <= today && (!t.date_to || t.date_to >= today));
  const acceptedTasks = tasks.filter((t) => ACTIVE_STATUSES.includes(t.driver_app_status));
  const pendingTasks = tasks.filter((t) => t.driver_app_status === "Sent to Driver");
  const completedToday = tasks.filter((t) => t.completion_time && t.completion_time.slice(0, 10) === today);
  const needingPickup = acceptedTasks.filter((t) =>
    ["Pickup Required", "Return Material Required", "Exchange Material"].includes(t.inventory_mode)
  );
  const needingLoading = acceptedTasks.filter((t) => t.inventory_mode === "Loading Required");
  const openIssues = db
    .prepare("SELECT COUNT(*) AS n FROM task_issues WHERE driver_id = ? AND status = 'Open'")
    .get(driverId).n;

  const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(driverId);
  const team = db
    .prepare(
      `SELECT dt.*, v.vehicle_name, v.plate_number, bd.name AS bifahrer_name
       FROM driver_teams dt
       LEFT JOIN vehicles v ON v.id = dt.vehicle_id
       LEFT JOIN drivers bd ON bd.id = dt.bifahrer_id
       WHERE (dt.main_driver_id = ? OR dt.bifahrer_id = ?) AND dt.date = ?
       ORDER BY dt.id DESC LIMIT 1`
    )
    .get(driverId, driverId, today);

  const currentTask =
    acceptedTasks.find((t) => ["Loading", "On Route", "Arrived", "In Progress"].includes(t.driver_app_status)) || null;
  const remaining = acceptedTasks.filter((t) => !currentTask || t.id !== currentTask.id);
  const suggestedIds = suggestOrder(remaining.map((t) => ({ id: t.id, priority: t.priority, sortTime: sortTimeFor(t) })));
  const nextTask = suggestedIds.length ? remaining.find((t) => t.id === suggestedIds[0]) : null;

  res.render("driver/home", {
    driverName: req.session.driverName,
    driver,
    team,
    cards: {
      today: todayTasks.length,
      accepted: acceptedTasks.length,
      pending: pendingTasks.length,
      completedToday: completedToday.length,
      needingPickup: needingPickup.length,
      needingLoading: needingLoading.length,
      openIssues
    },
    currentTask,
    nextTask
  });
});

// ---------- Profile ----------
router.get("/profile", (req, res) => {
  const driverId = req.session.driverId;
  const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(driverId);
  const today = new Date().toISOString().slice(0, 10);
  const team = db
    .prepare(
      `SELECT dt.*, v.vehicle_name, v.plate_number, bd.name AS bifahrer_name
       FROM driver_teams dt
       LEFT JOIN vehicles v ON v.id = dt.vehicle_id
       LEFT JOIN drivers bd ON bd.id = dt.bifahrer_id
       WHERE (dt.main_driver_id = ? OR dt.bifahrer_id = ?) AND dt.date = ?
       ORDER BY dt.id DESC LIMIT 1`
    )
    .get(driverId, driverId, today);

  res.render("driver/profile", { driver, team, driverName: req.session.driverName, DRIVER_STATUS_OPTIONS });
});

router.post("/profile/status", (req, res) => {
  db.prepare("UPDATE drivers SET status = ? WHERE id = ?").run(req.body.status, req.session.driverId);
  res.redirect("/driver/profile");
});

router.post("/profile/end-day", (req, res) => {
  db.prepare("UPDATE drivers SET status = 'Completed' WHERE id = ?").run(req.session.driverId);
  res.redirect("/driver/profile");
});

// ---------- SG / Company navigation ----------
router.get("/sg", (req, res) => {
  res.render("driver/sg", { SG_COMPANY, driverName: req.session.driverName });
});

router.use("/tasks", require("./driver-tasks"));
router.use("/route", require("./driver-route"));

module.exports = router;
