const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { requireAdmin } = require("../middleware/auth");
const { generateOrderNumber } = require("../utils/helpers");

// ---------- Auth ----------
router.get("/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin/dashboard");
  res.render("admin/login", { error: null });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE email = ?").get(email);
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

// ---------- Dashboard: Excel-like orders table ----------
router.get("/dashboard", (req, res) => {
  const { status, source, q } = req.query;

  let sql = `
    SELECT o.*, c.name AS client_name, c.company AS client_company,
           c.email AS client_email, c.phone AS client_phone, c.city AS client_city
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += " AND o.status = ?";
    params.push(status);
  }
  if (source) {
    sql += " AND o.source = ?";
    params.push(source);
  }
  if (q) {
    sql += ` AND (c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ? OR o.order_number LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  sql += " ORDER BY o.created_at DESC";

  const orders = db.prepare(sql).all(...params);

  const stats = db
    .prepare(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN source='email' THEN 1 ELSE 0 END) AS email_count,
         SUM(total) AS total_value
       FROM orders`
    )
    .get();

  res.render("admin/dashboard", {
    orders,
    stats,
    filters: { status: status || "", source: source || "", q: q || "" },
    adminName: req.session.adminName
  });
});

// CSV export (opens in Excel)
router.get("/orders/export.csv", (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.order_number, o.status, o.source, o.created_at, o.total,
              c.name AS client_name, c.company, c.email, c.phone, c.city, o.site_address, o.needed_by
       FROM orders o JOIN clients c ON c.id = o.client_id
       ORDER BY o.created_at DESC`
    )
    .all();

  const header = [
    "Order Number", "Status", "Source", "Created At", "Total (EUR)",
    "Client Name", "Company", "Email", "Phone", "City", "Site Address", "Needed By"
  ];
  const rows = orders.map((o) => [
    o.order_number, o.status, o.source, o.created_at, o.total,
    o.client_name, o.company || "", o.email || "", o.phone || "", o.city || "",
    o.site_address || "", o.needed_by || ""
  ]);

  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=orders.csv");
  res.send(csv);
});

// ---------- Order detail + status update ----------
router.get("/orders/:id", (req, res) => {
  const order = db
    .prepare(
      `SELECT o.*, c.* , o.id as order_id, c.id as client_id
       FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`
    )
    .get(req.params.id);
  if (!order) return res.status(404).send("Order not found");

  const lineItems = db
    .prepare("SELECT * FROM order_items WHERE order_id = ?")
    .all(req.params.id);

  res.render("admin/order-detail", { order, lineItems });
});

router.post("/orders/:id/status", (req, res) => {
  const { status } = req.body;
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    req.params.id
  );
  res.redirect(`/admin/orders/${req.params.id}`);
});

// ---------- Manual order entry (for orders received via email) ----------
router.get("/orders/new/form", (req, res) => {
  const items = db.prepare("SELECT * FROM items WHERE active = 1 ORDER BY category, name").all();
  const clients = db.prepare("SELECT * FROM clients ORDER BY name").all();
  res.render("admin/new-order", { items, clients });
});

router.post("/orders/new", (req, res) => {
  try {
    const {
      client_mode, // 'existing' or 'new'
      client_id,
      name, company, email, phone, address, city,
      site_address, needed_by, notes,
      item_ids, // array
      quantities // array, same order as item_ids
    } = req.body;

    const insertOrder = db.transaction(() => {
      let finalClientId = client_id;

      if (client_mode === "new") {
        const info = db
          .prepare(
            `INSERT INTO clients (name, company, email, phone, address, city, source)
             VALUES (?, ?, ?, ?, ?, ?, 'email')`
          )
          .run(name, company || null, email || null, phone || null, address || null, city || null);
        finalClientId = info.lastInsertRowid;
      }

      const orderNumber = generateOrderNumber();
      const orderInfo = db
        .prepare(
          `INSERT INTO orders (order_number, client_id, status, source, site_address, needed_by, notes, total)
           VALUES (?, ?, 'confirmed', 'email', ?, ?, ?, 0)`
        )
        .run(orderNumber, finalClientId, site_address || null, needed_by || null, notes || null);

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

// ---------- Clients list ----------
router.get("/clients", (req, res) => {
  const clients = db
    .prepare(
      `SELECT c.*, COUNT(o.id) AS order_count, COALESCE(SUM(o.total),0) AS total_spent
       FROM clients c LEFT JOIN orders o ON o.client_id = c.id
       GROUP BY c.id ORDER BY c.created_at DESC`
    )
    .all();
  res.render("admin/clients", { clients });
});

module.exports = router;
