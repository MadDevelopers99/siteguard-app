const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const db = require("../db/database");
const { requireAdmin } = require("../middleware/auth");
const { generateOrderNumber, statusBadgeClass } = require("../utils/helpers");
const { getOrders, getOrderById, getOrderStats, ORDER_EXPORT_COLUMNS } = require("../utils/order-query");
const {
  ORDER_STATUS_OPTIONS,
  ORDER_SOURCE_OPTIONS,
  ORDER_PAYMENT_STATUS_OPTIONS,
  MAIN_ADMIN_STATUSES,
  REQUEST_TYPES,
  RETURN_REASONS,
  SG_COMPANY
} = require("../utils/constants");

const ORDER_STATUS_VALUES = ORDER_STATUS_OPTIONS.map((s) => s.value);
const orderStatusLabel = (value) => (ORDER_STATUS_OPTIONS.find((s) => s.value === value) || {}).label || value;

// ---------- Auth ----------
router.get("/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin/dashboard");
  res.render("admin/login", { error: null });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE email = ? AND role = 'office_admin'").get(email);
  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash)) {
    return res.render("admin/login", { error: "Invalid email or password." });
  }
  req.session.adminId = admin.id;
  req.session.adminName = admin.name;
  res.redirect("/admin/dashboard");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// Everything below requires login
router.use(requireAdmin);

// ---------- Dashboard: pure stat-card overview ----------
router.get("/dashboard", (req, res) => {
  const stats = getOrderStats();
  res.render("admin/dashboard", { stats, adminName: req.session.adminName });
});

// ---------- Orders: filterable list ----------
router.get("/orders", (req, res) => {
  const { status, source, q, city, service_type, date_from, date_to, payment_status, ma_status } = req.query;
  const filters = {
    status: status || "", source: source || "", q: q || "", city: city || "",
    service_type: service_type || "", date_from: date_from || "", date_to: date_to || "",
    payment_status: payment_status || "", ma_status: ma_status || ""
  };
  const orders = getOrders(filters);

  res.render("admin/orders", {
    orders,
    filters,
    ORDER_STATUS_OPTIONS,
    ORDER_SOURCE_OPTIONS,
    ORDER_PAYMENT_STATUS_OPTIONS,
    MAIN_ADMIN_STATUSES,
    REQUEST_TYPES,
    statusBadgeClass,
    orderStatusLabel,
    adminName: req.session.adminName
  });
});

// ---------- Exports (CSV / Excel) — respect the same filters as /orders ----------
router.get("/orders/export.csv", (req, res) => {
  const orders = getOrders(req.query);
  const header = ORDER_EXPORT_COLUMNS.map((c) => c.header);
  const rows = orders.map((o) => ORDER_EXPORT_COLUMNS.map((c) => c.get(o)));

  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=orders.csv");
  res.send(csv);
});

router.get("/orders/export.xlsx", async (req, res) => {
  const orders = getOrders(req.query);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");
  sheet.addRow(ORDER_EXPORT_COLUMNS.map((c) => c.header));
  orders.forEach((o) => sheet.addRow(ORDER_EXPORT_COLUMNS.map((c) => c.get(o))));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => { col.width = 18; });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=orders.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

// ---------- Order detail + status update ----------
router.get("/orders/:id", (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).send("Order not found");

  const lineItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(req.params.id);
  const linkedRequest = order.request_id
    ? db.prepare("SELECT * FROM requests WHERE id = ?").get(order.request_id)
    : null;
  const requestPricing = linkedRequest
    ? db.prepare("SELECT * FROM request_pricing WHERE request_id = ? ORDER BY sort_order, id").all(linkedRequest.id)
    : [];

  res.render("admin/order-detail", {
    order,
    lineItems,
    linkedRequest,
    requestPricing,
    statusBadgeClass,
    orderStatusLabel,
    ORDER_STATUS_OPTIONS,
    ORDER_PAYMENT_STATUS_OPTIONS,
    RETURN_REASONS
  });
});

router.post("/orders/:id/status", (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUS_VALUES.includes(status)) {
    return res.status(400).send("Invalid status value.");
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    req.params.id
  );
  res.redirect(`/admin/orders/${req.params.id}`);
});

// ---------- One-click order actions (used by both the list's Actions menu and the detail page) ----------
function redirectBack(req, res, orderId) {
  const referrer = req.get("Referrer");
  res.redirect(referrer || `/admin/orders/${orderId}`);
}

router.post("/orders/:id/confirm", (req, res) => {
  db.prepare("UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  redirectBack(req, res, req.params.id);
});

router.post("/orders/:id/send-to-ma", (req, res) => {
  db.prepare("UPDATE orders SET status = 'dispatched', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  redirectBack(req, res, req.params.id);
});

router.post("/orders/:id/mark-delivered", (req, res) => {
  db.prepare("UPDATE orders SET status = 'delivered', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  redirectBack(req, res, req.params.id);
});

router.post("/orders/:id/cancel", (req, res) => {
  db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  redirectBack(req, res, req.params.id);
});

router.post("/orders/:id/return", (req, res) => {
  const { return_reason, return_note } = req.body;
  db.prepare(
    "UPDATE orders SET status = 'returned_from_ma', return_reason = ?, return_note = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(return_reason || null, return_note || null, req.params.id);
  redirectBack(req, res, req.params.id);
});

router.post("/orders/:id/payment-status", (req, res) => {
  const { payment_status } = req.body;
  if (!ORDER_PAYMENT_STATUS_OPTIONS.includes(payment_status)) {
    return res.status(400).send("Invalid payment status.");
  }
  db.prepare("UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(
    payment_status,
    req.params.id
  );
  redirectBack(req, res, req.params.id);
});

// ---------- PDF order/invoice summary (also reused by the Invoices page) ----------
router.get("/orders/:id/pdf", (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return res.status(404).send("Order not found");

  const lineItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  const requestPricing = order.request_id
    ? db.prepare("SELECT * FROM request_pricing WHERE request_id = ? ORDER BY sort_order, id").all(order.request_id)
    : [];

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Order-${order.order_number}.pdf"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text(SG_COMPANY.name);
  doc.fontSize(10).text(SG_COMPANY.address);
  doc.text(SG_COMPANY.phone);
  doc.moveDown();

  doc.fontSize(14).text(`Order Summary — ${order.order_number}`);
  doc.fontSize(9).fillColor("#666").text(`Generated: ${new Date().toLocaleString()}`);
  doc.fillColor("#000");
  doc.moveDown();

  doc.fontSize(12).text("Bill To", { underline: true });
  doc.fontSize(10).text(order.client_name);
  if (order.client_company) doc.text(order.client_company);
  if (order.client_email) doc.text(order.client_email);
  if (order.client_phone) doc.text(order.client_phone);
  if (order.client_address) doc.text(order.client_address);
  if (order.client_city) doc.text(order.client_city);
  doc.moveDown();

  doc.fontSize(12).text("Order Details", { underline: true });
  doc.fontSize(10).text(`Source: ${order.source}`);
  doc.text(`Status: ${orderStatusLabel(order.status)}`);
  doc.text(`Payment: ${order.payment_status || "Unpaid"}`);
  doc.text(`Created: ${order.created_at}`);
  doc.moveDown();

  if (order.request_id) {
    doc.fontSize(12).text("Service", { underline: true });
    doc.fontSize(10).text(`Type: ${order.service_type || "—"}`);
    doc.text(`Dates: ${order.start_date || "—"} to ${order.end_date || "—"}`);
    doc.text(`Zone Length: ${order.zone_length_m ? order.zone_length_m + " m" : "—"}`);
    doc.moveDown();

    doc.fontSize(12).text("Pricing Breakdown", { underline: true });
    requestPricing.forEach((p) => {
      doc.fontSize(10).text(`${p.price_item} — Qty ${p.qty} — €${p.net_total.toFixed(2)}`);
    });
  } else {
    doc.fontSize(12).text("Items", { underline: true });
    lineItems.forEach((li) => {
      doc.fontSize(10).text(`${li.item_name} x${li.quantity} — €${li.line_total.toFixed(2)}`);
    });
  }
  doc.moveDown();
  doc.fontSize(14).text(`Total: €${order.effective_total.toFixed(2)}`, { align: "right" });

  doc.end();
});

// ---------- Manual order entry (Website / Email / Manual) ----------
router.get("/orders/new/form", (req, res) => {
  const items = db.prepare("SELECT * FROM items WHERE active = 1 ORDER BY category, name").all();
  const clients = db.prepare("SELECT * FROM clients ORDER BY name").all();
  const source = ORDER_SOURCE_OPTIONS.includes(req.query.source) ? req.query.source : "email";
  const sourceLabels = { website: "Website Order", email: "Order (Email)", manual: "Manual Order" };

  res.render("admin/new-order", {
    items,
    clients,
    preselectClientId: req.query.client_id || "",
    presetClientMode: req.query.client_mode === "existing" ? "existing" : "",
    source,
    sourceLabel: sourceLabels[source]
  });
});

router.post("/orders/new", (req, res) => {
  try {
    const {
      client_mode, // 'existing' or 'new'
      client_id,
      name, company, email, phone, address, city,
      site_address, needed_by, notes,
      source: rawSource,
      item_ids, // array
      quantities // array, same order as item_ids
    } = req.body;

    const source = ORDER_SOURCE_OPTIONS.includes(rawSource) ? rawSource : "email";

    const insertOrder = db.transaction(() => {
      let finalClientId = client_id;

      if (client_mode === "new") {
        const info = db
          .prepare(
            `INSERT INTO clients (name, company, email, phone, address, city, source)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(name, company || null, email || null, phone || null, address || null, city || null, source);
        finalClientId = info.lastInsertRowid;
      }

      const orderNumber = generateOrderNumber();
      const orderInfo = db
        .prepare(
          `INSERT INTO orders (order_number, client_id, status, source, site_address, needed_by, notes, total)
           VALUES (?, ?, 'confirmed', ?, ?, ?, ?, 0)`
        )
        .run(orderNumber, finalClientId, source, site_address || null, needed_by || null, notes || null);

      const orderId = orderInfo.lastInsertRowid;
      let total = 0;

      const insertLine = db.prepare(
        `INSERT INTO order_items (order_id, item_id, item_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      const ids = Array.isArray(item_ids) ? item_ids : [item_ids];
      const qtys = Array.isArray(quantities) ? quantities : [quantities];

      ids.forEach((itemId, idx) => {
        if (!itemId) return;
        const qty = Math.max(1, parseInt(qtys[idx], 10) || 1);
        const item = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
        if (!item) return;
        const lineTotal = item.price * qty;
        total += lineTotal;
        insertLine.run(orderId, item.id, item.name, item.price, qty, lineTotal);
      });

      db.prepare("UPDATE orders SET total = ? WHERE id = ?").run(total, orderId);
      return orderId;
    });

    const orderId = insertOrder();
    res.redirect(`/admin/orders/${orderId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating order: " + err.message);
  }
});

// ---------- Order edit (simple item-based orders only — request-linked
// Auftraege are edited via their Request at /admin/requests/:id) ----------
router.get("/orders/:id/edit", (req, res) => {
  const order = db.prepare("SELECT o.*, c.* , o.id as order_id, c.id as client_id FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?").get(req.params.id);
  if (!order) return res.status(404).send("Order not found");
  if (order.request_id) return res.redirect(`/admin/requests/${order.request_id}`);

  const items = db.prepare("SELECT * FROM items WHERE active = 1 ORDER BY category, name").all();
  const lineItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.order_id);
  res.render("admin/order-edit", { order, items, lineItems });
});

router.post("/orders/:id/edit", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).send("Order not found");
  if (order.request_id) return res.redirect(`/admin/requests/${order.request_id}`);

  const { site_address, needed_by, notes, item_ids, quantities } = req.body;

  const updateOrder = db.transaction(() => {
    db.prepare("DELETE FROM order_items WHERE order_id = ?").run(order.id);

    const insertLine = db.prepare(
      `INSERT INTO order_items (order_id, item_id, item_name, unit_price, quantity, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const ids = Array.isArray(item_ids) ? item_ids : [item_ids].filter(Boolean);
    const qtys = Array.isArray(quantities) ? quantities : [quantities];
    let total = 0;

    ids.forEach((itemId, idx) => {
      if (!itemId) return;
      const qty = Math.max(1, parseInt(qtys[idx], 10) || 1);
      const item = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
      if (!item) return;
      const lineTotal = item.price * qty;
      total += lineTotal;
      insertLine.run(order.id, item.id, item.name, item.price, qty, lineTotal);
    });

    db.prepare(
      "UPDATE orders SET site_address = ?, needed_by = ?, notes = ?, total = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(site_address || null, needed_by || null, notes || null, total, order.id);
  });

  updateOrder();
  res.redirect(`/admin/orders/${order.id}`);
});

// ---------- Clients (list, workspace, contacts, locations) ----------
router.use("/clients", require("./admin-clients"));

// ---------- Requests (Request-to-Auftrag builder) ----------
router.use("/requests", require("./admin-requests"));

// ---------- Items (public storefront catalog) ----------
router.use("/items", require("./admin-items"));

// ---------- Inventories: Main Inventory + Purchase & Sell-to-SG ----------
router.use("/inventory", require("./admin-inventory"));
router.use("/purchase", require("./admin-purchase"));

// ---------- Office Employees / Invoices / Reports / Settings ----------
router.use("/employees", require("./admin-employees"));
router.use("/invoices", require("./admin-invoices"));
router.use("/reports", require("./admin-reports"));
router.use("/settings", require("./admin-settings"));

// Note: /admin/documents is mounted directly in server.js (not here) so it's
// reachable by Main Admin and Driver sessions too, not just Office Admin.

module.exports = router;
