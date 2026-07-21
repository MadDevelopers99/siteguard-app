const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { statusBadgeClass, signIconFor } = require("../utils/helpers");
const {
  INVENTORY_ITEM_STATUSES,
  STOCK_IN_SOURCE_TYPES,
  STOCK_OUT_REASON_TYPES,
  STOCK_ADJUSTMENT_REASONS,
  DAMAGED_MISSING_TYPES,
  DAMAGED_MISSING_STATUSES,
  STOCK_COUNT_STATUSES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES
} = require("../utils/constants");

function displayItemId(id) {
  return `INV-${String(id).padStart(3, "0")}`;
}

function displayCountId(id) {
  return `COUNT-${String(id).padStart(3, "0")}`;
}

// Recomputes an item's status from its current quantities. Called after every
// stock movement so the dashboard/list/low-stock views always match reality.
function refreshItemStatus(itemId) {
  const item = db.prepare("SELECT * FROM inventory_catalog WHERE id = ?").get(itemId);
  if (!item) return;
  const available = (item.available_stock || 0) - (item.reserved_qty || 0) - (item.damaged_qty || 0);
  let status = "Available";
  if ((item.available_stock || 0) <= 0) status = "Out of Stock";
  else if (available <= (item.minimum_stock || 0)) status = "Low Stock";
  if (!item.is_active) status = "Inactive";
  db.prepare("UPDATE inventory_catalog SET status = ? WHERE id = ?").run(status, itemId);
}

// ---------- Dashboard ----------
router.get("/dashboard", (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;

  const stats = {
    totalItems: count("SELECT COUNT(*) AS n FROM inventory_catalog WHERE is_active = 1"),
    totalStockQty: count("SELECT COALESCE(SUM(available_stock),0) AS n FROM inventory_catalog WHERE is_active = 1"),
    availableForUse: count(
      "SELECT COALESCE(SUM(available_stock - reserved_qty - damaged_qty),0) AS n FROM inventory_catalog WHERE is_active = 1"
    ),
    reservedQty: count("SELECT COALESCE(SUM(reserved_qty),0) AS n FROM inventory_catalog WHERE is_active = 1"),
    lowStockItems: count("SELECT COUNT(*) AS n FROM inventory_catalog WHERE is_active = 1 AND status = 'Low Stock'"),
    outOfStockItems: count("SELECT COUNT(*) AS n FROM inventory_catalog WHERE is_active = 1 AND status = 'Out of Stock'"),
    damagedItems: count("SELECT COALESCE(SUM(damaged_qty),0) AS n FROM inventory_catalog WHERE is_active = 1"),
    missingItems: count("SELECT COALESCE(SUM(missing_qty),0) AS n FROM inventory_catalog WHERE is_active = 1")
  };

  const lastCount = db.prepare("SELECT * FROM stock_counts ORDER BY count_date DESC LIMIT 1").get();

  res.render("admin-inventory/dashboard", { stats, lastCount, mainAdminName: null, adminName: req.session.adminName });
});

// ---------- Item List ----------
router.get("/items", (req, res) => {
  const { q, status, category } = req.query;
  let sql = "SELECT * FROM inventory_catalog WHERE is_active = 1";
  const params = [];
  if (q) {
    sql += " AND (item_name LIKE ? OR article_number LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  sql += " ORDER BY category, item_name";

  const items = db.prepare(sql).all(...params);
  const categories = db
    .prepare("SELECT DISTINCT category FROM inventory_catalog WHERE category IS NOT NULL ORDER BY category")
    .all()
    .map((r) => r.category);

  res.render("admin-inventory/item-list", {
    items,
    categories,
    filters: { q: q || "", status: status || "", category: category || "" },
    INVENTORY_ITEM_STATUSES,
    displayItemId,
    statusBadgeClass,
    signIconFor,
    adminName: req.session.adminName
  });
});

// ---------- Add Item ----------
router.get("/items/new", (req, res) => {
  const suppliers = db.prepare("SELECT * FROM suppliers WHERE status = 'Active' ORDER BY name").all();
  res.render("admin-inventory/item-new", { suppliers });
});

router.post("/items", (req, res) => {
  const {
    item_name, category, subcategory, article_number, barcode, unit, description,
    available_stock, minimum_stock, maximum_stock, storage_location,
    average_purchase_price, replacement_cost, usage_price, main_supplier_id, notes
  } = req.body;

  try {
    const info = db
      .prepare(
        `INSERT INTO inventory_catalog
          (item_name, category, subcategory, article_number, barcode, unit, description,
           available_stock, minimum_stock, maximum_stock, storage_location,
           average_purchase_price, replacement_cost, usage_price, main_supplier_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item_name, category || null, subcategory || null, article_number || null, barcode || null,
        unit || "pcs", description || null,
        parseFloat(available_stock) || 0, parseFloat(minimum_stock) || 0,
        maximum_stock ? parseFloat(maximum_stock) : null, storage_location || null,
        average_purchase_price ? parseFloat(average_purchase_price) : null,
        replacement_cost ? parseFloat(replacement_cost) : null,
        usage_price ? parseFloat(usage_price) : null,
        main_supplier_id || null, notes || null
      );
    refreshItemStatus(info.lastInsertRowid);
    res.redirect(`/admin/inventory/items/${info.lastInsertRowid}`);
  } catch (err) {
    const suppliers = db.prepare("SELECT * FROM suppliers WHERE status = 'Active' ORDER BY name").all();
    res.render("admin-inventory/item-new", {
      suppliers,
      error: err.message.includes("UNIQUE") ? `Item "${item_name}" already exists.` : err.message
    });
  }
});

// ---------- Item Profile ----------
router.get("/items/:id", (req, res) => {
  const item = db.prepare("SELECT * FROM inventory_catalog WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).send("Item not found");

  const movements = db
    .prepare("SELECT * FROM stock_movements WHERE item_id = ? ORDER BY date DESC, id DESC")
    .all(req.params.id);
  const purchaseHistory = movements.filter((m) => m.source_type === "Purchase" || m.source_type === "Internal Sale to SG");
  const usageHistory = movements.filter((m) => ["Issued to Auftrag", "Given to Driver"].includes(m.source_type));
  const damagedMissing = db
    .prepare("SELECT * FROM damaged_missing_records WHERE item_id = ? ORDER BY date DESC")
    .all(req.params.id);
  const documents = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'inventory_item' AND entity_id = ? ORDER BY created_at DESC")
    .all(req.params.id);
  const supplier = item.main_supplier_id
    ? db.prepare("SELECT * FROM suppliers WHERE id = ?").get(item.main_supplier_id)
    : null;
  const suppliers = db.prepare("SELECT * FROM suppliers WHERE status = 'Active' ORDER BY name").all();

  res.render("admin-inventory/item-profile", {
    item,
    supplier,
    suppliers,
    movements,
    purchaseHistory,
    usageHistory,
    damagedMissing,
    documents,
    tab: req.query.tab || "overview",
    STOCK_IN_SOURCE_TYPES,
    STOCK_OUT_REASON_TYPES,
    STOCK_ADJUSTMENT_REASONS,
    DAMAGED_MISSING_TYPES,
    DOCUMENT_CATEGORIES,
    DOCUMENT_STATUSES,
    displayItemId,
    statusBadgeClass,
    signIconFor,
    adminName: req.session.adminName
  });
});

router.post("/items/:id", (req, res) => {
  const {
    item_name, category, subcategory, article_number, barcode, unit, description,
    minimum_stock, maximum_stock, storage_location,
    average_purchase_price, replacement_cost, usage_price, main_supplier_id, notes
  } = req.body;

  db.prepare(
    `UPDATE inventory_catalog SET
      item_name = ?, category = ?, subcategory = ?, article_number = ?, barcode = ?, unit = ?, description = ?,
      minimum_stock = ?, maximum_stock = ?, storage_location = ?,
      average_purchase_price = ?, replacement_cost = ?, usage_price = ?, main_supplier_id = ?, notes = ?
     WHERE id = ?`
  ).run(
    item_name, category || null, subcategory || null, article_number || null, barcode || null,
    unit || "pcs", description || null,
    parseFloat(minimum_stock) || 0, maximum_stock ? parseFloat(maximum_stock) : null, storage_location || null,
    average_purchase_price ? parseFloat(average_purchase_price) : null,
    replacement_cost ? parseFloat(replacement_cost) : null,
    usage_price ? parseFloat(usage_price) : null,
    main_supplier_id || null, notes || null,
    req.params.id
  );
  refreshItemStatus(req.params.id);
  res.redirect(`/admin/inventory/items/${req.params.id}?tab=overview`);
});

router.post("/items/:id/notes", (req, res) => {
  db.prepare("UPDATE inventory_catalog SET notes = ? WHERE id = ?").run(req.body.notes || null, req.params.id);
  res.redirect(`/admin/inventory/items/${req.params.id}?tab=notes`);
});

router.post("/items/:id/deactivate", (req, res) => {
  db.prepare("UPDATE inventory_catalog SET is_active = 1 - is_active WHERE id = ?").run(req.params.id);
  refreshItemStatus(req.params.id);
  res.redirect("/admin/inventory/items");
});

// ---------- Stock In / Out / Adjust ----------
router.post("/items/:id/stock-in", (req, res) => {
  const { quantity, source_type, source_reference, storage_location, notes } = req.body;
  const qty = parseFloat(quantity) || 0;

  const run = db.transaction(() => {
    db.prepare("UPDATE inventory_catalog SET available_stock = available_stock + ? WHERE id = ?").run(qty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_id, movement_type, quantity, source_type, source_reference, storage_location, created_by, notes)
       VALUES (?, 'in', ?, ?, ?, ?, ?, ?)`
    ).run(req.params.id, qty, source_type || "Other", source_reference || null, storage_location || null, req.session.adminName || "Admin", notes || null);
    refreshItemStatus(req.params.id);
  });
  run();

  res.redirect(`/admin/inventory/items/${req.params.id}?tab=movements`);
});

router.post("/items/:id/stock-out", (req, res) => {
  const { quantity, reason, source_reference, storage_location, notes } = req.body;
  const qty = parseFloat(quantity) || 0;

  const run = db.transaction(() => {
    db.prepare("UPDATE inventory_catalog SET available_stock = MAX(0, available_stock - ?) WHERE id = ?").run(qty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_id, movement_type, quantity, source_type, source_reference, storage_location, created_by, notes)
       VALUES (?, 'out', ?, ?, ?, ?, ?, ?)`
    ).run(req.params.id, qty, reason || "Other", source_reference || null, storage_location || null, req.session.adminName || "Admin", notes || null);
    refreshItemStatus(req.params.id);
  });
  run();

  res.redirect(`/admin/inventory/items/${req.params.id}?tab=movements`);
});

router.post("/items/:id/adjust", (req, res) => {
  const { new_quantity, reason, notes } = req.body;
  const item = db.prepare("SELECT * FROM inventory_catalog WHERE id = ?").get(req.params.id);
  const oldQty = item.available_stock || 0;
  const newQty = parseFloat(new_quantity) || 0;
  const diff = newQty - oldQty;

  const run = db.transaction(() => {
    db.prepare("UPDATE inventory_catalog SET available_stock = ? WHERE id = ?").run(newQty, req.params.id);
    db.prepare(
      `INSERT INTO stock_movements (item_id, movement_type, quantity, source_type, reason, created_by, notes)
       VALUES (?, 'adjustment', ?, 'Stock Count Correction', ?, ?, ?)`
    ).run(req.params.id, diff, reason || "Other", req.session.adminName || "Admin", notes || `Adjusted from ${oldQty} to ${newQty}`);
    refreshItemStatus(req.params.id);
  });
  run();

  res.redirect(`/admin/inventory/items/${req.params.id}?tab=movements`);
});

// ---------- Damaged / Missing ----------
router.get("/damaged-missing", (req, res) => {
  const records = db
    .prepare(
      `SELECT d.*, i.item_name FROM damaged_missing_records d JOIN inventory_catalog i ON i.id = d.item_id ORDER BY d.date DESC`
    )
    .all();
  const items = db.prepare("SELECT * FROM inventory_catalog WHERE is_active = 1 ORDER BY item_name").all();
  res.render("admin-inventory/damaged-missing", {
    records, items, DAMAGED_MISSING_TYPES, DAMAGED_MISSING_STATUSES, statusBadgeClass, adminName: req.session.adminName
  });
});

router.post("/damaged-missing", (req, res) => {
  const { item_id, type, quantity, source, reason, repairable, replacement_needed, notes } = req.body;
  const qty = parseFloat(quantity) || 0;

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO damaged_missing_records (item_id, type, quantity, source, reason, repairable, replacement_needed, reported_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(item_id, type || "Damaged", qty, source || null, reason || null, repairable ? 1 : 0, replacement_needed ? 1 : 0, req.session.adminName || "Admin", notes || null);

    const column = type === "Missing" ? "missing_qty" : "damaged_qty";
    db.prepare(`UPDATE inventory_catalog SET ${column} = ${column} + ? WHERE id = ?`).run(qty, item_id);
    refreshItemStatus(item_id);
  });
  run();

  res.redirect("/admin/inventory/damaged-missing");
});

router.post("/damaged-missing/:id/status", (req, res) => {
  db.prepare("UPDATE damaged_missing_records SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  res.redirect("/admin/inventory/damaged-missing");
});

// ---------- Low Stock Alerts ----------
router.get("/low-stock", (req, res) => {
  const items = db
    .prepare(
      `SELECT * FROM inventory_catalog WHERE is_active = 1 AND status IN ('Low Stock', 'Out of Stock') ORDER BY item_name`
    )
    .all();
  res.render("admin-inventory/low-stock", { items, statusBadgeClass, displayItemId, adminName: req.session.adminName });
});

router.post("/low-stock/:id/minimum", (req, res) => {
  db.prepare("UPDATE inventory_catalog SET minimum_stock = ? WHERE id = ?").run(parseFloat(req.body.minimum_stock) || 0, req.params.id);
  refreshItemStatus(req.params.id);
  res.redirect("/admin/inventory/low-stock");
});

// ---------- Stock Count ----------
router.get("/stock-counts", (req, res) => {
  const counts = db.prepare("SELECT * FROM stock_counts ORDER BY count_date DESC").all();
  res.render("admin-inventory/stock-counts", { counts, displayCountId, statusBadgeClass, adminName: req.session.adminName });
});

router.post("/stock-counts", (req, res) => {
  const { storage_location, notes } = req.body;
  const info = db
    .prepare("INSERT INTO stock_counts (storage_location, counted_by, notes) VALUES (?, ?, ?)")
    .run(storage_location || null, req.session.adminName || "Admin", notes || null);
  res.redirect(`/admin/inventory/stock-counts/${info.lastInsertRowid}`);
});

router.get("/stock-counts/:id", (req, res) => {
  const stockCount = db.prepare("SELECT * FROM stock_counts WHERE id = ?").get(req.params.id);
  if (!stockCount) return res.status(404).send("Stock count not found");

  const countedItemIds = db.prepare("SELECT item_id FROM stock_count_items WHERE stock_count_id = ?").all(req.params.id).map((r) => r.item_id);
  const items = db.prepare("SELECT * FROM inventory_catalog WHERE is_active = 1 ORDER BY item_name").all();
  const countItems = db
    .prepare(
      `SELECT sci.*, i.item_name FROM stock_count_items sci JOIN inventory_catalog i ON i.id = sci.item_id
       WHERE sci.stock_count_id = ? ORDER BY i.item_name`
    )
    .all(req.params.id);

  res.render("admin-inventory/stock-count-detail", {
    stockCount, items, countItems, countedItemIds, displayCountId, statusBadgeClass, adminName: req.session.adminName
  });
});

router.post("/stock-counts/:id/items", (req, res) => {
  const { item_id, counted_qty } = req.body;
  const item = db.prepare("SELECT * FROM inventory_catalog WHERE id = ?").get(item_id);
  const systemQty = item.available_stock || 0;
  const counted = parseFloat(counted_qty) || 0;
  const difference = counted - systemQty;
  const action = difference === 0 ? "OK" : Math.abs(difference) > systemQty * 0.1 ? "Review" : "Adjust";

  db.prepare(
    `INSERT INTO stock_count_items (stock_count_id, item_id, system_qty, counted_qty, difference, action)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, item_id, systemQty, counted, difference, action);

  res.redirect(`/admin/inventory/stock-counts/${req.params.id}`);
});

router.post("/stock-counts/:id/approve", (req, res) => {
  const countItems = db.prepare("SELECT * FROM stock_count_items WHERE stock_count_id = ?").all(req.params.id);

  const run = db.transaction(() => {
    countItems.forEach((ci) => {
      if (ci.difference !== 0) {
        db.prepare("UPDATE inventory_catalog SET available_stock = ? WHERE id = ?").run(ci.counted_qty, ci.item_id);
        db.prepare(
          `INSERT INTO stock_movements (item_id, movement_type, quantity, source_type, reason, source_reference, created_by, notes)
           VALUES (?, 'adjustment', ?, 'Stock Count Correction', 'Stock Count Correction', ?, ?, ?)`
        ).run(ci.item_id, ci.difference, displayCountId(req.params.id), req.session.adminName || "Admin", `Stock count adjustment: ${ci.system_qty} → ${ci.counted_qty}`);
        refreshItemStatus(ci.item_id);
      }
    });
    db.prepare("UPDATE stock_counts SET status = 'Approved', approved_by = ? WHERE id = ?").run(req.session.adminName || "Admin", req.params.id);
  });
  run();

  res.redirect(`/admin/inventory/stock-counts/${req.params.id}`);
});

// ---------- Settings ----------
router.get("/settings", (req, res) => {
  res.render("admin-inventory/settings", {
    INVENTORY_ITEM_STATUSES, STOCK_IN_SOURCE_TYPES, STOCK_OUT_REASON_TYPES, STOCK_ADJUSTMENT_REASONS,
    DAMAGED_MISSING_TYPES, DAMAGED_MISSING_STATUSES, STOCK_COUNT_STATUSES,
    adminName: req.session.adminName
  });
});

module.exports = router;
