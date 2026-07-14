const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { requireMainAdmin } = require("../middleware/auth");
const {
  MAIN_ADMIN_STATUSES,
  RETURN_REASONS,
  INVENTORY_APPROVAL_STATUSES,
  DRIVER_STATUS_OPTIONS,
  DRIVER_APP_STATUS_OPTIONS,
  MAP_STATUS_OPTIONS,
  COMPLETION_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES
} = require("../utils/constants");
const { statusBadgeClass } = require("../utils/helpers");

// ---------- Auth ----------
router.get("/login", (req, res) => {
  if (req.session.mainAdminId) return res.redirect("/main-admin/dashboard");
  res.render("main-admin/login", { error: null });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE email = ? AND role = 'main_admin'").get(email);
  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash)) {
    return res.render("main-admin/login", { error: "Invalid email or password." });
  }
  req.session.mainAdminId = admin.id;
  req.session.mainAdminName = admin.name;
  res.redirect("/main-admin/dashboard");
});

router.post("/logout", (req, res) => {
  delete req.session.mainAdminId;
  delete req.session.mainAdminName;
  res.redirect("/main-admin/login");
});

router.use(requireMainAdmin);

function ensureOrderSubRows(orderId) {
  db.prepare("INSERT OR IGNORE INTO order_operational_planning (order_id) VALUES (?)").run(orderId);
  db.prepare("INSERT OR IGNORE INTO order_driver_assignment (order_id) VALUES (?)").run(orderId);
  db.prepare("INSERT OR IGNORE INTO order_map (order_id) VALUES (?)").run(orderId);
}

function loadOrderContext(orderId) {
  const order = db
    .prepare(
      `SELECT o.*, c.name AS client_name, c.company AS client_company, c.email AS client_email, c.phone AS client_phone
       FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`
    )
    .get(orderId);
  if (!order) return null;

  const request = order.request_id ? db.prepare("SELECT * FROM requests WHERE id = ?").get(order.request_id) : null;
  const location = order.location_id
    ? db.prepare("SELECT * FROM client_locations WHERE id = ?").get(order.location_id)
    : null;
  const planning = db.prepare("SELECT * FROM order_operational_planning WHERE order_id = ?").get(orderId);
  const assignment = db.prepare("SELECT * FROM order_driver_assignment WHERE order_id = ?").get(orderId);
  const map = db.prepare("SELECT * FROM order_map WHERE order_id = ?").get(orderId);
  const inventoryRows = request
    ? db.prepare("SELECT * FROM request_inventory WHERE request_id = ? ORDER BY id").all(request.id)
    : [];
  const pricingRows = request
    ? db.prepare("SELECT * FROM request_pricing WHERE request_id = ? ORDER BY sort_order, id").all(request.id)
    : [];
  const documents = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'order' AND entity_id = ? ORDER BY created_at DESC")
    .all(orderId);
  const primaryDriver = assignment && assignment.primary_driver_id
    ? db.prepare("SELECT * FROM drivers WHERE id = ?").get(assignment.primary_driver_id)
    : null;
  const secondDriver = assignment && assignment.second_driver_id
    ? db.prepare("SELECT * FROM drivers WHERE id = ?").get(assignment.second_driver_id)
    : null;

  return { order, request, location, planning, assignment, map, inventoryRows, pricingRows, documents, primaryDriver, secondDriver };
}

function reviewChecklist(ctx) {
  const { order, request, location, map, inventoryRows, documents } = ctx;
  const checks = [
    { label: "Client information complete", ok: !!(order.client_name && order.client_company) },
    { label: "Location complete", ok: !!location },
    { label: "Date and time correct", ok: !!(request && request.date_from && request.date_to) },
    { label: "KVR approved", ok: !request || !request.kvr_required || request.kvr_status === "Approved" },
    { label: "Absicherung clear", ok: !request || !request.absicherung_required || !!request.absicherung_type },
    { label: "Map usable", ok: !!map && ["Map Approved", "Final Map Approved"].includes(map.map_status) },
    { label: "Inventory plan realistic", ok: inventoryRows.length > 0 },
    { label: "Documents complete", ok: documents.length > 0 },
    { label: "Notes clear", ok: true }
  ];
  const ready = checks.every((c) => c.ok);
  return { checks, ready };
}

// ---------- Dashboard ----------
router.get("/dashboard", (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;

  const stats = {
    incoming: count("SELECT COUNT(*) AS n FROM orders WHERE main_admin_status = 'Received from Office Admin'"),
    pendingReview: count(
      "SELECT COUNT(*) AS n FROM orders WHERE main_admin_status IN ('Received from Office Admin','Pending Main Admin Review')"
    ),
    readyToAssign: count("SELECT COUNT(*) AS n FROM orders WHERE main_admin_status = 'Ready for Driver Assignment'"),
    assignedToday: count(
      "SELECT COUNT(*) AS n FROM orders WHERE main_admin_status IN ('Driver Assigned','Sent to Driver') AND DATE(updated_at) = DATE('now')"
    ),
    activeFieldWork: count(
      "SELECT COUNT(*) AS n FROM orders WHERE main_admin_status IN ('Accepted by Driver','Driver Loading','On Route','Arrived on Site','In Progress')"
    ),
    driverCompleted: count(
      "SELECT COUNT(*) AS n FROM orders WHERE main_admin_status IN ('Driver Completed','Waiting Main Admin Review')"
    ),
    inventoryIssues: count(
      `SELECT COUNT(*) AS n FROM request_inventory ri
       JOIN requests r ON r.id = ri.request_id
       WHERE ri.main_admin_status IN ('Low Stock Warning','Not Available','Substitute Required')`
    ),
    completed: count(
      "SELECT COUNT(*) AS n FROM orders WHERE main_admin_status IN ('Completed','Sent Back to Office Admin','Archived')"
    )
  };

  res.render("main-admin/dashboard", { stats, mainAdminName: req.session.mainAdminName });
});

// ---------- Incoming Aufträge ----------
router.get("/auftraege", (req, res) => {
  const { status, q } = req.query;

  let sql = `
    SELECT o.*, c.name AS client_name, c.company AS client_company,
           l.street AS location_street, l.city AS location_city
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    LEFT JOIN client_locations l ON l.id = o.location_id
    WHERE 1=1
  `;
  const params = [];
  if (status) {
    sql += " AND o.main_admin_status = ?";
    params.push(status);
  }
  if (q) {
    sql += " AND (c.name LIKE ? OR c.company LIKE ? OR o.order_number LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY o.created_at DESC";

  const orders = db.prepare(sql).all(...params);
  const orderIds = orders.map((o) => o.id);

  let requestByOrder = {};
  if (orderIds.length) {
    const placeholders = orderIds.map(() => "?").join(",");
    db.prepare(`SELECT * FROM requests WHERE order_id IN (${placeholders})`)
      .all(...orderIds)
      .forEach((r) => (requestByOrder[r.order_id] = r));
  }

  res.render("main-admin/auftraege", {
    orders,
    requestByOrder,
    filters: { status: status || "", q: q || "" },
    MAIN_ADMIN_STATUSES,
    statusBadgeClass,
    mainAdminName: req.session.mainAdminName
  });
});

// ---------- Auftrag Workspace ----------
router.get("/auftraege/:id", (req, res) => {
  ensureOrderSubRows(req.params.id);
  const ctx = loadOrderContext(req.params.id);
  if (!ctx) return res.status(404).send("Auftrag not found");

  const drivers = db.prepare("SELECT * FROM drivers ORDER BY name").all();
  const driverActiveCounts = {};
  db.prepare(
    `SELECT primary_driver_id, second_driver_id FROM order_driver_assignment
     WHERE driver_app_status NOT IN ('Not Sent', 'Submitted for Review')`
  )
    .all()
    .forEach((row) => {
      [row.primary_driver_id, row.second_driver_id].forEach((id) => {
        if (id) driverActiveCounts[id] = (driverActiveCounts[id] || 0) + 1;
      });
    });

  res.render("main-admin/auftrag-workspace", {
    ...ctx,
    checklist: reviewChecklist(ctx),
    drivers,
    driverActiveCounts,
    tab: req.query.tab || "review",
    MAIN_ADMIN_STATUSES,
    RETURN_REASONS,
    INVENTORY_APPROVAL_STATUSES,
    DRIVER_STATUS_OPTIONS,
    DRIVER_APP_STATUS_OPTIONS,
    MAP_STATUS_OPTIONS,
    COMPLETION_STATUS_OPTIONS,
    PRIORITY_OPTIONS,
    DOCUMENT_CATEGORIES,
    DOCUMENT_STATUSES,
    statusBadgeClass,
    mainAdminName: req.session.mainAdminName
  });
});

// ---------- Review decisions ----------
router.post("/auftraege/:id/approve", (req, res) => {
  db.prepare(
    "UPDATE orders SET main_admin_status = 'Approved for Operation', updated_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=review`);
});

router.post("/auftraege/:id/return", (req, res) => {
  const { return_reason, return_note } = req.body;
  db.prepare(
    `UPDATE orders SET main_admin_status = 'Returned to Office Admin', return_reason = ?, return_note = ?,
     updated_at = datetime('now') WHERE id = ?`
  ).run(return_reason || "Other", return_note || null, req.params.id);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=review`);
});

router.post("/auftraege/:id/cancel", (req, res) => {
  db.prepare("UPDATE orders SET main_admin_status = 'Cancelled', updated_at = datetime('now') WHERE id = ?").run(
    req.params.id
  );
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=review`);
});

// ---------- Operational Planning ----------
router.post("/auftraege/:id/planning", (req, res) => {
  const {
    priority, execution_date, setup_date, setup_time, removal_date, removal_time,
    expected_duration, drivers_needed, vehicle_required, special_equipment,
    warehouse_prep_needed, route_notes, internal_notes
  } = req.body;

  ensureOrderSubRows(req.params.id);
  db.prepare(
    `UPDATE order_operational_planning SET
      priority = ?, execution_date = ?, setup_date = ?, setup_time = ?, removal_date = ?, removal_time = ?,
      expected_duration = ?, drivers_needed = ?, vehicle_required = ?, special_equipment = ?,
      warehouse_prep_needed = ?, route_notes = ?, internal_notes = ?, updated_at = datetime('now')
     WHERE order_id = ?`
  ).run(
    priority || "Normal", execution_date || null, setup_date || null, setup_time || null,
    removal_date || null, removal_time || null, expected_duration || null,
    drivers_needed ? parseInt(drivers_needed, 10) : 1, vehicle_required || null, special_equipment || null,
    warehouse_prep_needed ? 1 : 0, route_notes || null, internal_notes || null,
    req.params.id
  );

  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=planning`);
});

// ---------- Inventory Approval ----------
router.post("/auftraege/:id/inventory", (req, res) => {
  const { item_id, approved_qty, item_status, item_notes } = req.body;
  const ids = Array.isArray(item_id) ? item_id : [item_id].filter(Boolean);
  const qtys = Array.isArray(approved_qty) ? approved_qty : [approved_qty];
  const statuses = Array.isArray(item_status) ? item_status : [item_status];
  const notes = Array.isArray(item_notes) ? item_notes : [item_notes];

  const update = db.prepare(
    "UPDATE request_inventory SET main_admin_approved_qty = ?, main_admin_status = ?, notes = ? WHERE id = ?"
  );
  const runUpdates = db.transaction(() => {
    ids.forEach((id, idx) => {
      update.run(qtys[idx] ? parseFloat(qtys[idx]) : null, statuses[idx] || "Pending Review", notes[idx] || null, id);
    });
  });
  runUpdates();

  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=inventory`);
});

router.post("/auftraege/:id/inventory/add", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const { item_name, category, planned_qty, unit } = req.body;
  if (order.request_id && item_name) {
    db.prepare(
      `INSERT INTO request_inventory (request_id, item_name, category, planned_qty, unit, source, main_admin_status)
       VALUES (?, ?, ?, ?, ?, 'manual', 'Edited by Main Admin')`
    ).run(order.request_id, item_name, category || null, parseFloat(planned_qty) || 0, unit || "pcs");
  }
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=inventory`);
});

router.post("/auftraege/:id/inventory/:itemId/delete", (req, res) => {
  db.prepare("DELETE FROM request_inventory WHERE id = ?").run(req.params.itemId);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=inventory`);
});

router.post("/auftraege/:id/inventory/send-to-warehouse", (req, res) => {
  db.prepare(
    "UPDATE orders SET main_admin_status = 'Inventory Approved', updated_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=inventory`);
});

router.post("/auftraege/:id/ready-for-assignment", (req, res) => {
  db.prepare(
    "UPDATE orders SET main_admin_status = 'Ready for Driver Assignment', updated_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=inventory`);
});

// ---------- Driver Assignment ----------
router.post("/auftraege/:id/assign-driver", (req, res) => {
  const {
    primary_driver_id, second_driver_id, vehicle, loading_time, setup_time, removal_time,
    driver_instructions, driver_checklist, tablet_map_required, documents_visible_to_driver
  } = req.body;

  ensureOrderSubRows(req.params.id);
  const assign = db.transaction(() => {
    db.prepare(
      `UPDATE order_driver_assignment SET
        primary_driver_id = ?, second_driver_id = ?, vehicle = ?, loading_time = ?, setup_time = ?, removal_time = ?,
        driver_instructions = ?, driver_checklist = ?, tablet_map_required = ?, documents_visible_to_driver = ?,
        updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(
      primary_driver_id || null, second_driver_id || null, vehicle || null,
      loading_time || null, setup_time || null, removal_time || null,
      driver_instructions || null, driver_checklist || null,
      tablet_map_required ? 1 : 0, documents_visible_to_driver ? 1 : 0,
      req.params.id
    );

    if (primary_driver_id) {
      db.prepare("UPDATE drivers SET status = 'Assigned' WHERE id = ?").run(primary_driver_id);
    }
    if (second_driver_id) {
      db.prepare("UPDATE drivers SET status = 'Assigned' WHERE id = ?").run(second_driver_id);
    }

    db.prepare(
      "UPDATE orders SET main_admin_status = 'Driver Assigned', updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
  });
  assign();

  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=assignment`);
});

router.post("/auftraege/:id/send-to-driver", (req, res) => {
  const send = db.transaction(() => {
    db.prepare(
      "UPDATE order_driver_assignment SET driver_app_status = 'Sent to Driver', updated_at = datetime('now') WHERE order_id = ?"
    ).run(req.params.id);
    db.prepare(
      "UPDATE orders SET main_admin_status = 'Sent to Driver', updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
  });
  send();
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=assignment`);
});

// ---------- Live Status ----------
router.post("/auftraege/:id/report-issue", (req, res) => {
  db.prepare("UPDATE order_driver_assignment SET issue_note = ?, updated_at = datetime('now') WHERE order_id = ?").run(
    req.body.issue_note || null,
    req.params.id
  );
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=live-status`);
});

router.post("/auftraege/:id/emergency", (req, res) => {
  db.prepare(
    `UPDATE order_driver_assignment SET driver_app_status = 'Blocked', issue_note = 'EMERGENCY: ' || COALESCE(?, 'reported by Main Admin'),
     updated_at = datetime('now') WHERE order_id = ?`
  ).run(req.body.issue_note || null, req.params.id);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=live-status`);
});

router.post("/auftraege/:id/reassign-driver", (req, res) => {
  db.prepare(
    `UPDATE order_driver_assignment SET primary_driver_id = NULL, second_driver_id = NULL,
     driver_app_status = 'Not Sent', updated_at = datetime('now') WHERE order_id = ?`
  ).run(req.params.id);
  db.prepare(
    "UPDATE orders SET main_admin_status = 'Ready for Driver Assignment', updated_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=assignment`);
});

// ---------- Map ----------
router.post("/auftraege/:id/map", (req, res) => {
  const {
    map_status, sign_points, lines, polygons, work_zone, street_side, setup_confirmed, notes
  } = req.body;

  ensureOrderSubRows(req.params.id);
  db.prepare(
    `UPDATE order_map SET
      map_status = ?, sign_points = ?, lines = ?, polygons = ?, work_zone = ?, street_side = ?,
      setup_confirmed = ?, notes = ?, updated_at = datetime('now')
     WHERE order_id = ?`
  ).run(
    map_status || "Map Needed", sign_points || null, lines || null, polygons || null,
    work_zone || null, street_side || null, setup_confirmed ? 1 : 0, notes || null,
    req.params.id
  );

  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=map`);
});

// ---------- Driver Completion Review ----------
router.post("/auftraege/:id/completion/approve", (req, res) => {
  const approve = db.transaction(() => {
    db.prepare(
      "UPDATE order_driver_assignment SET completion_status = 'Approved by Main Admin', updated_at = datetime('now') WHERE order_id = ?"
    ).run(req.params.id);
    db.prepare(
      "UPDATE orders SET main_admin_status = 'Waiting Main Admin Review', updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
  });
  approve();
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=completion`);
});

router.post("/auftraege/:id/completion/return", (req, res) => {
  const ret = db.transaction(() => {
    db.prepare(
      "UPDATE order_driver_assignment SET completion_status = ?, updated_at = datetime('now') WHERE order_id = ?"
    ).run(req.body.completion_status || "Needs Driver Correction", req.params.id);
    db.prepare(
      "UPDATE orders SET main_admin_status = 'Returned to Driver', updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
  });
  ret();
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=completion`);
});

// ---------- Final Inventory Review ----------
router.post("/auftraege/:id/final-inventory", (req, res) => {
  const { item_id, issued_qty, used_qty, returned_qty, damaged_qty, missing_qty, final_status } = req.body;
  const ids = Array.isArray(item_id) ? item_id : [item_id].filter(Boolean);
  const arr = (v) => (Array.isArray(v) ? v : [v]);
  const issuedArr = arr(issued_qty), usedArr = arr(used_qty), returnedArr = arr(returned_qty),
    damagedArr = arr(damaged_qty), missingArr = arr(missing_qty), statusArr = arr(final_status);

  const update = db.prepare(
    `UPDATE request_inventory SET issued_qty = ?, used_qty = ?, returned_qty = ?, damaged_qty = ?, missing_qty = ?, final_status = ?
     WHERE id = ?`
  );
  const runUpdates = db.transaction(() => {
    ids.forEach((id, idx) => {
      update.run(
        issuedArr[idx] ? parseFloat(issuedArr[idx]) : null,
        usedArr[idx] ? parseFloat(usedArr[idx]) : null,
        returnedArr[idx] ? parseFloat(returnedArr[idx]) : null,
        damagedArr[idx] ? parseFloat(damagedArr[idx]) : null,
        missingArr[idx] ? parseFloat(missingArr[idx]) : null,
        statusArr[idx] || "OK",
        id
      );
    });
  });
  runUpdates();

  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=final-inventory`);
});

router.post("/auftraege/:id/final-inventory/approve-volatile", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const rows = order.request_id
    ? db.prepare("SELECT * FROM request_inventory WHERE request_id = ?").all(order.request_id)
    : [];

  const approve = db.transaction(() => {
    rows.forEach((r) => {
      const net = (r.issued_qty || 0) - (r.returned_qty || 0);
      if (net !== 0) {
        db.prepare("UPDATE inventory_catalog SET available_stock = available_stock - ? WHERE item_name = ?").run(
          net,
          r.item_name
        );
      }
    });
    db.prepare(
      "UPDATE orders SET main_admin_status = 'Completion Approved', updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
  });
  approve();

  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=final-inventory`);
});

// ---------- Final Completion Approval / Send back ----------
router.post("/auftraege/:id/complete", (req, res) => {
  const complete = db.transaction(() => {
    db.prepare("UPDATE orders SET main_admin_status = 'Completed', updated_at = datetime('now') WHERE id = ?").run(
      req.params.id
    );
    const assignment = db.prepare("SELECT * FROM order_driver_assignment WHERE order_id = ?").get(req.params.id);
    if (assignment && assignment.primary_driver_id) {
      db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ?").run(assignment.primary_driver_id);
    }
    if (assignment && assignment.second_driver_id) {
      db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ?").run(assignment.second_driver_id);
    }
  });
  complete();
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=final-inventory`);
});

router.post("/auftraege/:id/send-back", (req, res) => {
  db.prepare(
    "UPDATE orders SET main_admin_status = 'Sent Back to Office Admin', updated_at = datetime('now') WHERE id = ?"
  ).run(req.params.id);
  res.redirect(`/main-admin/auftraege/${req.params.id}?tab=final-inventory`);
});

// ---------- Completed Aufträge ----------
router.get("/completed", (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, c.name AS client_name, c.company AS client_company
       FROM orders o JOIN clients c ON c.id = o.client_id
       WHERE o.main_admin_status IN ('Completed','Sent Back to Office Admin','Archived')
       ORDER BY o.updated_at DESC`
    )
    .all();
  res.render("main-admin/completed", { orders, statusBadgeClass, mainAdminName: req.session.mainAdminName });
});

// ---------- Reports ----------
router.get("/reports", (req, res) => {
  const byStatus = db
    .prepare("SELECT main_admin_status AS status, COUNT(*) AS n FROM orders GROUP BY main_admin_status ORDER BY n DESC")
    .all();
  const inventoryIssues = db
    .prepare(
      `SELECT ri.item_name, ri.main_admin_status, COUNT(*) AS n FROM request_inventory ri
       WHERE ri.main_admin_status IN ('Low Stock Warning','Not Available','Substitute Required')
       GROUP BY ri.item_name, ri.main_admin_status`
    )
    .all();
  const completedLast7Days = db
    .prepare(
      `SELECT DATE(updated_at) AS day, COUNT(*) AS n FROM orders
       WHERE main_admin_status = 'Completed' AND updated_at >= datetime('now', '-7 days')
       GROUP BY DATE(updated_at) ORDER BY day DESC`
    )
    .all();

  res.render("main-admin/reports", { byStatus, inventoryIssues, completedLast7Days, mainAdminName: req.session.mainAdminName });
});

// ---------- Settings: driver accounts ----------
router.get("/settings", (req, res) => {
  const drivers = db.prepare("SELECT * FROM drivers ORDER BY name").all();
  res.render("main-admin/settings", { drivers, DRIVER_STATUS_OPTIONS, mainAdminName: req.session.mainAdminName });
});

router.post("/settings/drivers", (req, res) => {
  const { name, email, password, phone } = req.body;
  try {
    const hash = bcrypt.hashSync(password || "ChangeMe123!", 10);
    db.prepare("INSERT INTO drivers (name, email, password_hash, phone) VALUES (?, ?, ?, ?)").run(
      name,
      email,
      hash,
      phone || null
    );
  } catch (err) {
    console.error(err);
  }
  res.redirect("/main-admin/settings");
});

router.post("/settings/drivers/:id/status", (req, res) => {
  db.prepare("UPDATE drivers SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  res.redirect("/main-admin/settings");
});

router.post("/settings/drivers/:id/delete", (req, res) => {
  db.prepare("DELETE FROM drivers WHERE id = ?").run(req.params.id);
  res.redirect("/main-admin/settings");
});

module.exports = router;
