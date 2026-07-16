const express = require("express");
const router = express.Router();
const db = require("../db/database");
const {
  REJECT_REASON_OPTIONS,
  ISSUE_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  PHOTO_CATEGORY_OPTIONS,
  DIGITIZATION_OBJECT_TYPES
} = require("../utils/constants");
const { taskFlags } = require("../utils/task-flow");
const { suggestOrder } = require("../utils/route-suggest");
const {
  driverOwnsOrder,
  listDriverTasks,
  getDriverTask,
  fullAddress,
  sortTimeFor,
  DRIVER_STATUS_TO_MAIN_ADMIN_STATUS
} = require("./driver-shared");

function updateDriverStatus(orderId, driverAppStatus) {
  db.prepare(
    "UPDATE order_driver_assignment SET driver_app_status = ?, updated_at = datetime('now') WHERE order_id = ?"
  ).run(driverAppStatus, orderId);
  const mainAdminStatus = DRIVER_STATUS_TO_MAIN_ADMIN_STATUS[driverAppStatus];
  if (mainAdminStatus) {
    db.prepare("UPDATE orders SET main_admin_status = ?, updated_at = datetime('now') WHERE id = ?").run(
      mainAdminStatus,
      orderId
    );
  }
}

function parseFeatures(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------- Task list ----------
router.get("/", (req, res) => {
  const tasks = listDriverTasks(req.session.driverId);
  res.render("driver/tasks", { tasks, driverName: req.session.driverName, fullAddress });
});

router.post("/:id/accept", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");
  updateDriverStatus(req.params.id, "Accepted");
  res.redirect("/driver/tasks");
});

router.post("/:id/reject", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");
  db.prepare(
    "UPDATE order_driver_assignment SET driver_app_status = 'Rejected', reject_reason = ?, updated_at = datetime('now') WHERE order_id = ?"
  ).run(req.body.reject_reason || null, req.params.id);
  res.redirect("/driver/tasks");
});

// ---------- Task Detail ----------
router.get("/:id", (req, res) => {
  const task = getDriverTask(req.params.id, req.session.driverId);
  if (!task) return res.status(404).send("Task not found");

  const flags = taskFlags(task.task_type, task.inventory_mode);

  const inventoryRows = task.request_id
    ? db.prepare("SELECT * FROM request_inventory WHERE request_id = ?").all(task.request_id)
    : [];

  const map = db.prepare("SELECT * FROM order_map WHERE order_id = ?").get(req.params.id);
  const features = map ? parseFeatures(map.driver_field_markings) : [];

  let visibleDocuments = [];
  if (task.documents_visible_to_driver) {
    const orderDocs = db
      .prepare("SELECT * FROM documents WHERE entity_type = 'order' AND entity_id = ? AND category = 'Map' ORDER BY created_at DESC")
      .all(req.params.id);
    const requestDocs = task.request_id
      ? db
          .prepare(
            "SELECT * FROM documents WHERE entity_type = 'request' AND entity_id = ? AND category IN ('KVR Permission', 'Absicherung') ORDER BY created_at DESC"
          )
          .all(task.request_id)
      : [];
    visibleDocuments = [...orderDocs, ...requestDocs];
  }

  const photos = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'order' AND entity_id = ? AND category != 'Map' ORDER BY created_at DESC")
    .all(req.params.id);

  const issues = db.prepare("SELECT * FROM task_issues WHERE order_id = ? ORDER BY created_at DESC").all(req.params.id);
  const openIssueCount = issues.filter((i) => i.status === "Open").length;

  const photosOk = !flags.requiresPhotos || photos.length > 0;
  const digitizationOk = !flags.requiresDigitization || features.length > 0;
  const inventoryOk =
    !flags.requiresInventoryReport ||
    inventoryRows.length === 0 ||
    inventoryRows.some((r) => r.used_qty != null || r.picked_qty != null || r.returned_qty != null);
  const issuesOk = openIssueCount === 0;
  const checklist = { photosOk, digitizationOk, inventoryOk, issuesOk };

  res.render("driver/task-detail", {
    task,
    flags,
    inventoryRows,
    map,
    features,
    visibleDocuments,
    photos,
    issues,
    checklist,
    tab: req.query.tab || "overview",
    error: req.query.error || null,
    fullAddress: fullAddress(task),
    driverName: req.session.driverName,
    PRIORITY_OPTIONS,
    REJECT_REASON_OPTIONS,
    ISSUE_TYPE_OPTIONS,
    PHOTO_CATEGORY_OPTIONS,
    DIGITIZATION_OBJECT_TYPES
  });
});

// ---------- Loading ----------
router.post("/:id/loading", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  const ids = Array.isArray(req.body.item_id) ? req.body.item_id : [req.body.item_id].filter(Boolean);
  const arr = (v) => (Array.isArray(v) ? v : [v]);
  const loadedArr = arr(req.body.loaded_qty);

  const save = db.transaction(() => {
    const update = db.prepare("UPDATE request_inventory SET loaded_qty = ? WHERE id = ?");
    ids.forEach((id, idx) => update.run(parseFloat(loadedArr[idx]) || 0, id));
    updateDriverStatus(req.params.id, "Loading");
    db.prepare("UPDATE drivers SET status = 'Loading' WHERE id = ?").run(req.session.driverId);
  });
  save();

  res.redirect(`/driver/tasks/${req.params.id}?tab=loading`);
});

// ---------- Pickup ----------
router.post("/:id/pickup", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  const ids = Array.isArray(req.body.item_id) ? req.body.item_id : [req.body.item_id].filter(Boolean);
  const arr = (v) => (Array.isArray(v) ? v : [v]);
  const pickedArr = arr(req.body.picked_qty);
  const damagedArr = arr(req.body.damaged_qty);
  const missingArr = arr(req.body.missing_qty);

  const save = db.transaction(() => {
    const update = db.prepare("UPDATE request_inventory SET picked_qty = ?, damaged_qty = ?, missing_qty = ? WHERE id = ?");
    ids.forEach((id, idx) => {
      update.run(parseFloat(pickedArr[idx]) || 0, parseFloat(damagedArr[idx]) || 0, parseFloat(missingArr[idx]) || 0, id);
    });
  });
  save();

  res.redirect(`/driver/tasks/${req.params.id}?tab=pickup`);
});

// ---------- Work ----------
const WORK_ACTION_TO_STATUS = {
  arrived: "Arrived",
  setup_started: "In Progress",
  setup_completed: "Setup Completed",
  removal_started: "In Progress",
  removal_completed: "Removal Completed",
  work_completed: "In Progress"
};

router.post("/:id/work", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  const { work_action, driver_notes, issue_note } = req.body;
  const status = WORK_ACTION_TO_STATUS[work_action];

  const save = db.transaction(() => {
    if (work_action === "arrived") {
      db.prepare(
        "UPDATE order_driver_assignment SET work_started_at = COALESCE(work_started_at, datetime('now')) WHERE order_id = ?"
      ).run(req.params.id);
    }
    if (["setup_completed", "removal_completed", "work_completed"].includes(work_action)) {
      db.prepare(
        "UPDATE order_driver_assignment SET work_completed_at = datetime('now') WHERE order_id = ?"
      ).run(req.params.id);
    }
    if (driver_notes !== undefined || issue_note !== undefined) {
      db.prepare("UPDATE order_driver_assignment SET driver_notes = ?, issue_note = ? WHERE order_id = ?").run(
        driver_notes || null,
        issue_note || null,
        req.params.id
      );
    }
    if (status) updateDriverStatus(req.params.id, status);
    db.prepare("UPDATE drivers SET status = 'On Work' WHERE id = ?").run(req.session.driverId);
  });
  save();

  res.redirect(`/driver/tasks/${req.params.id}?tab=work`);
});

// ---------- Field Digitization ----------
function digitizationErrors(features, inventoryRows) {
  const errors = [];
  if (features.length === 0) errors.push("Add at least one point, line, or area before submitting.");
  const loadedByItem = {};
  inventoryRows.forEach((r) => (loadedByItem[r.id] = r.loaded_qty || r.planned_qty || 0));
  const usedByItem = {};
  features.forEach((f, idx) => {
    if (!f.objectType) errors.push(`Feature ${idx + 1} has no object type.`);
    if (!f.itemId) errors.push(`Feature ${idx + 1} has no inventory item.`);
    const qty = parseFloat(f.qty) || 0;
    if (f.itemId) usedByItem[f.itemId] = (usedByItem[f.itemId] || 0) + qty;
  });
  Object.entries(usedByItem).forEach(([itemId, used]) => {
    const loaded = loadedByItem[itemId];
    if (loaded != null && used > loaded) {
      const row = inventoryRows.find((r) => String(r.id) === String(itemId));
      errors.push(`Used quantity for ${row ? row.item_name : "item"} (${used}) exceeds loaded quantity (${loaded}).`);
    }
  });
  return { errors, usedByItem };
}

router.post("/:id/digitization", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  db.prepare(
    `INSERT INTO order_map (order_id, driver_field_markings, map_status, updated_at)
     VALUES (?, ?, 'Driver Updated Map', datetime('now'))
     ON CONFLICT(order_id) DO UPDATE SET driver_field_markings = excluded.driver_field_markings, map_status = 'Driver Updated Map', updated_at = datetime('now')`
  ).run(req.params.id, req.body.features || "[]");

  res.redirect(`/driver/tasks/${req.params.id}?tab=digitization`);
});

router.post("/:id/digitization/submit", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  const task = getDriverTask(req.params.id, req.session.driverId);
  const inventoryRows = task.request_id
    ? db.prepare("SELECT * FROM request_inventory WHERE request_id = ?").all(task.request_id)
    : [];
  const features = parseFeatures(req.body.features);
  const { errors, usedByItem } = digitizationErrors(features, inventoryRows);

  if (errors.length > 0) {
    return res.redirect(`/driver/tasks/${req.params.id}?tab=digitization&error=${encodeURIComponent(errors.join(" "))}`);
  }

  const submit = db.transaction(() => {
    db.prepare(
      `INSERT INTO order_map (order_id, driver_field_markings, map_status, updated_at)
       VALUES (?, ?, 'Driver Updated Map', datetime('now'))
       ON CONFLICT(order_id) DO UPDATE SET driver_field_markings = excluded.driver_field_markings, map_status = 'Driver Updated Map', updated_at = datetime('now')`
    ).run(req.params.id, JSON.stringify(features));

    const updateUsed = db.prepare("UPDATE request_inventory SET used_qty = ? WHERE id = ?");
    Object.entries(usedByItem).forEach(([itemId, used]) => updateUsed.run(used, itemId));
  });
  submit();

  res.redirect(`/driver/tasks/${req.params.id}?tab=inventory-report`);
});

// ---------- Inventory Report ----------
router.post("/:id/inventory-report", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  // Only touch the columns the current report type actually rendered — never
  // blindly null out columns another tab (e.g. digitization's auto-filled
  // used_qty) already wrote, the same class of bug fixed earlier for Notes tabs.
  const ids = Array.isArray(req.body.item_id) ? req.body.item_id : [req.body.item_id].filter(Boolean);
  const arr = (v) => (v === undefined ? null : Array.isArray(v) ? v : [v]);
  const fields = {
    used_qty: arr(req.body.used_qty),
    picked_qty: arr(req.body.picked_qty),
    returned_qty: arr(req.body.returned_qty),
    damaged_qty: arr(req.body.damaged_qty),
    missing_qty: arr(req.body.missing_qty),
    notes: arr(req.body.notes)
  };
  const presentColumns = Object.keys(fields).filter((col) => fields[col] !== null);

  if (presentColumns.length > 0 && ids.length > 0) {
    const setSql = presentColumns.map((col) => `${col} = ?`).join(", ");
    const update = db.prepare(`UPDATE request_inventory SET ${setSql} WHERE id = ?`);
    const save = db.transaction(() => {
      ids.forEach((id, idx) => {
        const values = presentColumns.map((col) => {
          const v = fields[col][idx];
          if (col === "notes") return v || null;
          return v !== undefined && v !== "" ? parseFloat(v) || 0 : null;
        });
        update.run(...values, id);
      });
    });
    save();
  }

  res.redirect(`/driver/tasks/${req.params.id}?tab=inventory-report`);
});

// ---------- Issues ----------
router.post("/:id/issues", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  const { issue_type, priority, description, location, driver_note } = req.body;
  db.prepare(
    `INSERT INTO task_issues (order_id, driver_id, issue_type, priority, description, location, driver_note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.params.id,
    req.session.driverId,
    issue_type || "Other",
    priority || "Normal",
    description || null,
    location || null,
    driver_note || null
  );

  res.redirect(`/driver/tasks/${req.params.id}?tab=issues`);
});

router.post("/:id/issues/:issueId/resolve", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  db.prepare("UPDATE task_issues SET status = 'Resolved', resolved_at = datetime('now') WHERE id = ? AND order_id = ?").run(
    req.params.issueId,
    req.params.id
  );

  res.redirect(`/driver/tasks/${req.params.id}?tab=issues`);
});

// ---------- Submit Completion ----------
router.post("/:id/submit", (req, res) => {
  const assignment = driverOwnsOrder(req.params.id, req.session.driverId);
  if (!assignment) return res.status(404).send("Task not found");

  const task = getDriverTask(req.params.id, req.session.driverId);
  const flags = taskFlags(task.task_type, task.inventory_mode);

  const inventoryRows = task.request_id
    ? db.prepare("SELECT * FROM request_inventory WHERE request_id = ?").all(task.request_id)
    : [];
  const photos = db
    .prepare("SELECT COUNT(*) AS n FROM documents WHERE entity_type = 'order' AND entity_id = ? AND category != 'Map'")
    .get(req.params.id).n;
  const map = db.prepare("SELECT * FROM order_map WHERE order_id = ?").get(req.params.id);
  const features = map ? parseFeatures(map.driver_field_markings) : [];
  const openIssues = db
    .prepare("SELECT COUNT(*) AS n FROM task_issues WHERE order_id = ? AND status = 'Open'")
    .get(req.params.id).n;

  const missing = [];
  if (flags.requiresPhotos && photos === 0) missing.push("completion photos");
  if (flags.requiresDigitization && features.length === 0) missing.push("field digitization");
  if (
    flags.requiresInventoryReport &&
    inventoryRows.length > 0 &&
    !inventoryRows.some((r) => r.used_qty != null || r.picked_qty != null || r.returned_qty != null)
  ) {
    missing.push("inventory report");
  }
  if (openIssues > 0) missing.push("resolve open issues");

  if (missing.length > 0) {
    return res.redirect(
      `/driver/tasks/${req.params.id}?tab=submit&error=${encodeURIComponent("Please complete: " + missing.join(", "))}`
    );
  }

  const { driver_notes } = req.body;
  const submit = db.transaction(() => {
    db.prepare(
      `UPDATE order_driver_assignment SET driver_notes = ?, completion_time = datetime('now'),
       completion_status = 'Submitted by Driver', driver_app_status = 'Submitted for Review',
       work_completed_at = COALESCE(work_completed_at, datetime('now')), updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(driver_notes || assignment.driver_notes || null, req.params.id);

    db.prepare("UPDATE orders SET main_admin_status = 'Driver Completed', updated_at = datetime('now') WHERE id = ?").run(
      req.params.id
    );

    if (assignment.primary_driver_id === req.session.driverId) {
      db.prepare("UPDATE drivers SET status = 'Completed' WHERE id = ?").run(req.session.driverId);
    }
  });
  submit();

  const remaining = listDriverTasks(req.session.driverId).filter((t) =>
    ["Accepted", "Loading", "On Route", "Arrived", "In Progress"].includes(t.driver_app_status)
  );
  const suggestedIds = suggestOrder(remaining.map((t) => ({ id: t.id, priority: t.priority, sortTime: sortTimeFor(t) })));
  const nextTask = suggestedIds.length ? remaining.find((t) => t.id === suggestedIds[0]) : null;

  res.render("driver/next-task", { nextTask, driverName: req.session.driverName, fullAddress });
});

module.exports = router;
