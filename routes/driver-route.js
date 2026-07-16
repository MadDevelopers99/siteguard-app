const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { suggestOrder } = require("../utils/route-suggest");
const { listDriverTasks, sortTimeFor, fullAddress, ACTIVE_STATUSES } = require("./driver-shared");

function recommendedAction(task) {
  if (task.inventory_mode === "Loading Required") return "Go to Loading first, then navigate to the task.";
  if (["Pickup Required", "Return Material Required", "Exchange Material"].includes(task.inventory_mode)) {
    return "Go directly — pick up material on site.";
  }
  return "Go directly to this task.";
}

router.get("/", (req, res) => {
  const driverId = req.session.driverId;
  const tasks = listDriverTasks(driverId).filter((t) => ACTIVE_STATUSES.includes(t.driver_app_status));

  const allApproved = tasks.length > 0 && tasks.every((t) => t.route_approved);
  let ordered;
  if (allApproved) {
    ordered = [...tasks].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
  } else {
    const suggestedIds = suggestOrder(tasks.map((t) => ({ id: t.id, priority: t.priority, sortTime: sortTimeFor(t) })));
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    ordered = suggestedIds.map((id) => byId[id]);
  }

  res.render("driver/route", {
    tasks: ordered,
    routeApproved: allApproved,
    recommendedAction,
    fullAddress,
    driverName: req.session.driverName
  });
});

router.post("/save", (req, res) => {
  const driverId = req.session.driverId;
  const orderIds = Array.isArray(req.body.order_id) ? req.body.order_id : [req.body.order_id].filter(Boolean);
  const positions = Array.isArray(req.body.position) ? req.body.position : [req.body.position].filter(Boolean);

  const rows = orderIds.map((id, idx) => ({ id, position: parseInt(positions[idx], 10) || idx + 1 }));
  rows.sort((a, b) => a.position - b.position);

  const save = db.transaction(() => {
    const update = db.prepare(
      `UPDATE order_driver_assignment SET stop_order = ?, route_approved = 1, updated_at = datetime('now')
       WHERE order_id = ? AND (primary_driver_id = ? OR second_driver_id = ?)`
    );
    rows.forEach((r, idx) => update.run(idx + 1, r.id, driverId, driverId));
  });
  save();

  res.redirect("/driver/route");
});

module.exports = router;
