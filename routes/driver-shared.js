// Shared helpers used by routes/driver.js, driver-tasks.js, driver-route.js.
const db = require("../db/database");

function driverOwnsOrder(orderId, driverId) {
  const assignment = db.prepare("SELECT * FROM order_driver_assignment WHERE order_id = ?").get(orderId);
  return assignment && (assignment.primary_driver_id === driverId || assignment.second_driver_id === driverId)
    ? assignment
    : null;
}

const TASK_JOIN_SQL = `
  SELECT oda.*, o.id AS order_id, o.order_number, o.main_admin_status,
         c.name AS client_name, c.company AS client_company, c.phone AS client_phone,
         r.id AS request_id, r.request_type, r.purpose, r.date_from, r.date_to, r.time_from, r.time_to,
         r.kvr_required, r.kvr_status, r.absicherung_required, r.absicherung_type, r.parked_vehicle_list_required,
         oop.priority,
         loc.street, loc.house_number, loc.zip, loc.city, loc.location_type, loc.side_of_street, loc.access_notes
  FROM order_driver_assignment oda
  JOIN orders o ON o.id = oda.order_id
  JOIN clients c ON c.id = o.client_id
  LEFT JOIN requests r ON r.id = o.request_id
  LEFT JOIN order_operational_planning oop ON oop.order_id = o.id
  LEFT JOIN client_locations loc ON loc.id = o.location_id
`;

function listDriverTasks(driverId, { includeNotSent = false } = {}) {
  const filter = includeNotSent ? "" : "AND oda.driver_app_status != 'Not Sent'";
  return db
    .prepare(
      `${TASK_JOIN_SQL} WHERE (oda.primary_driver_id = ? OR oda.second_driver_id = ?) ${filter}
       ORDER BY oda.stop_order ASC, oda.updated_at DESC`
    )
    .all(driverId, driverId);
}

function getDriverTask(orderId, driverId) {
  return db
    .prepare(`${TASK_JOIN_SQL} WHERE o.id = ? AND (oda.primary_driver_id = ? OR oda.second_driver_id = ?)`)
    .get(orderId, driverId, driverId);
}

function sortTimeFor(task) {
  return `${task.date_from || ""} ${task.loading_time || task.setup_time || task.time_from || ""}`;
}

function fullAddress(task) {
  if (!task.street) return null;
  return `${task.street}${task.house_number ? " " + task.house_number : ""}, ${task.zip || ""} ${task.city || ""}`.trim();
}

// Every status a task can be in once the driver has accepted it and before final submission.
const ACTIVE_STATUSES = ["Accepted", "Loading", "On Route", "Arrived", "In Progress", "Setup Completed", "Removal Completed"];

// driver_app_status -> what Main Admin's Auftrag pipeline should show (mirrors the
// mapping the old single-page Driver panel used).
const DRIVER_STATUS_TO_MAIN_ADMIN_STATUS = {
  Accepted: "Accepted by Driver",
  Loading: "Driver Loading",
  "On Route": "On Route",
  Arrived: "Arrived on Site",
  "In Progress": "In Progress",
  "Setup Completed": "In Progress",
  "Removal Completed": "In Progress"
};

module.exports = {
  driverOwnsOrder,
  listDriverTasks,
  getDriverTask,
  sortTimeFor,
  fullAddress,
  ACTIVE_STATUSES,
  DRIVER_STATUS_TO_MAIN_ADMIN_STATUS
};
