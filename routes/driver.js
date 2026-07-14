const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { requireDriver } = require("../middleware/auth");
const { DRIVER_APP_STATUS_OPTIONS } = require("../utils/constants");

// Status a driver can push, and what it means for Main Admin's pipeline column.
// Statuses not listed here (e.g. "Blocked") only change driver_app_status.
const DRIVER_STATUS_TO_MAIN_ADMIN_STATUS = {
  Accepted: "Accepted by Driver",
  Loading: "Driver Loading",
  "On Route": "On Route",
  Arrived: "Arrived on Site",
  "In Progress": "In Progress",
  "Setup Completed": "In Progress",
  "Removal Completed": "In Progress"
};

// ---------- Auth ----------
router.get("/login", (req, res) => {
  if (req.session.driverId) return res.redirect("/driver/jobs");
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
  res.redirect("/driver/jobs");
});

router.post("/logout", (req, res) => {
  delete req.session.driverId;
  delete req.session.driverName;
  res.redirect("/driver/login");
});

router.use(requireDriver);

function driverOwnsOrder(orderId, driverId) {
  const assignment = db.prepare("SELECT * FROM order_driver_assignment WHERE order_id = ?").get(orderId);
  return assignment && (assignment.primary_driver_id === driverId || assignment.second_driver_id === driverId)
    ? assignment
    : null;
}

// ---------- Job list ----------
router.get("/jobs", (req, res) => {
  const jobs = db
    .prepare(
      `SELECT o.id, o.order_number, oda.driver_app_status, c.company AS client_company, c.name AS client_name,
              r.date_from, r.date_to
       FROM order_driver_assignment oda
       JOIN orders o ON o.id = oda.order_id
       JOIN clients c ON c.id = o.client_id
       LEFT JOIN requests r ON r.id = o.request_id
       WHERE (oda.primary_driver_id = ? OR oda.second_driver_id = ?)
         AND oda.driver_app_status != 'Not Sent'
       ORDER BY oda.updated_at DESC`
    )
    .all(req.session.driverId, req.session.driverId);

  res.render("driver/jobs", { jobs, driverName: req.session.driverName });
});

// ---------- Job detail (allowlisted fields only — no pricing/margin/billing) ----------
router.get("/jobs/:id", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Job not found");

  const job = db
    .prepare(
      `SELECT o.id, o.order_number, c.name AS client_name, c.company AS client_company, c.phone AS client_phone,
              r.request_type, r.purpose, r.date_from, r.date_to, r.time_from, r.time_to,
              r.kvr_required, r.kvr_status, r.absicherung_required, r.absicherung_type,
              r.parked_vehicle_list_required
       FROM orders o
       JOIN clients c ON c.id = o.client_id
       LEFT JOIN requests r ON r.id = o.request_id
       WHERE o.id = ?`
    )
    .get(req.params.id);

  const order = db.prepare("SELECT location_id, request_id FROM orders WHERE id = ?").get(req.params.id);
  const location = order.location_id
    ? db.prepare("SELECT street, house_number, zip, city, location_type, side_of_street, access_notes FROM client_locations WHERE id = ?").get(order.location_id)
    : null;
  const map = db.prepare("SELECT * FROM order_map WHERE order_id = ?").get(req.params.id);
  const inventoryRows = order.request_id
    ? db.prepare("SELECT id, item_name, category, planned_qty, main_admin_approved_qty, unit FROM request_inventory WHERE request_id = ?").all(order.request_id)
    : [];

  let documents = [];
  if (assignment.documents_visible_to_driver) {
    const orderDocs = db
      .prepare("SELECT * FROM documents WHERE entity_type = 'order' AND entity_id = ? AND category IN ('Map') ORDER BY created_at DESC")
      .all(req.params.id);
    const requestDocs = order.request_id
      ? db
          .prepare(
            "SELECT * FROM documents WHERE entity_type = 'request' AND entity_id = ? AND category IN ('KVR Permission', 'Absicherung') ORDER BY created_at DESC"
          )
          .all(order.request_id)
      : [];
    documents = [...orderDocs, ...requestDocs];
  }

  const myDocuments = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'order' AND entity_id = ? AND category IN ('Photos', 'Parked Vehicle List') ORDER BY created_at DESC")
    .all(req.params.id);

  res.render("driver/job-detail", {
    job,
    location,
    map,
    inventoryRows,
    documents,
    myDocuments,
    assignment,
    DRIVER_APP_STATUS_OPTIONS,
    driverName: req.session.driverName
  });
});

// ---------- Status update ----------
router.post("/jobs/:id/status", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Job not found");

  const { driver_app_status, current_location, issue_note } = req.body;

  const update = db.transaction(() => {
    db.prepare(
      `UPDATE order_driver_assignment SET driver_app_status = ?, current_location = ?, issue_note = ?, updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(driver_app_status, current_location || null, issue_note || null, req.params.id);

    const mainAdminStatus = DRIVER_STATUS_TO_MAIN_ADMIN_STATUS[driver_app_status];
    if (mainAdminStatus) {
      db.prepare("UPDATE orders SET main_admin_status = ?, updated_at = datetime('now') WHERE id = ?").run(
        mainAdminStatus,
        req.params.id
      );
    }

    db.prepare("UPDATE drivers SET status = 'On Work', current_location = ? WHERE id = ?").run(
      current_location || null,
      req.session.driverId
    );
  });
  update();

  res.redirect(`/driver/jobs/${req.params.id}`);
});

// ---------- Completion submission ----------
router.post("/jobs/:id/complete", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Job not found");

  const { item_id, used_qty, returned_qty, damaged_qty, missing_qty, driver_notes } = req.body;
  const ids = Array.isArray(item_id) ? item_id : [item_id].filter(Boolean);
  const arr = (v) => (Array.isArray(v) ? v : [v]);
  const usedArr = arr(used_qty), returnedArr = arr(returned_qty), damagedArr = arr(damaged_qty), missingArr = arr(missing_qty);

  const submit = db.transaction(() => {
    const updateItem = db.prepare(
      "UPDATE request_inventory SET issued_qty = ?, used_qty = ?, returned_qty = ?, damaged_qty = ?, missing_qty = ? WHERE id = ?"
    );
    ids.forEach((id, idx) => {
      const used = parseFloat(usedArr[idx]) || 0;
      const returned = parseFloat(returnedArr[idx]) || 0;
      const damaged = parseFloat(damagedArr[idx]) || 0;
      const missing = parseFloat(missingArr[idx]) || 0;
      updateItem.run(used + returned + damaged + missing, used, returned, damaged, missing, id);
    });

    db.prepare(
      `UPDATE order_driver_assignment SET driver_notes = ?, completion_time = datetime('now'),
       completion_status = 'Submitted by Driver', driver_app_status = 'Submitted for Review', updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(driver_notes || null, req.params.id);

    db.prepare(
      "UPDATE orders SET main_admin_status = 'Driver Completed', updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);

    if (assignment.primary_driver_id === req.session.driverId) {
      db.prepare("UPDATE drivers SET status = 'Completed' WHERE id = ?").run(req.session.driverId);
    }
  });
  submit();

  res.redirect(`/driver/jobs/${req.params.id}`);
});

module.exports = router;
