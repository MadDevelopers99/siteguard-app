const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { generateOrderNumber } = require("../utils/helpers");

// Home / catalog page
router.get("/", (req, res) => {
  const items = db
    .prepare("SELECT * FROM items WHERE active = 1 ORDER BY category, name")
    .all();

  const categories = [...new Set(items.map((i) => i.category))];

  res.render("index", { items, categories, company: companyInfo() });
});

// Submit an order from the public site
router.post("/order", (req, res) => {
  try {
    const {
      name,
      company,
      email,
      phone,
      site_address,
      city,
      needed_by,
      notes,
      cart // JSON string: [{item_id, quantity}]
    } = req.body;

    if (!name || !email || !phone || !cart) {
      return res.status(400).json({ ok: false, error: "Missing required fields." });
    }

    const cartItems = JSON.parse(cart);
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ ok: false, error: "Cart is empty." });
    }

    const insertOrder = db.transaction(() => {
      // Find or create client (match by email)
      let client = db.prepare("SELECT * FROM clients WHERE email = ?").get(email);
      if (!client) {
        const info = db
          .prepare(
            `INSERT INTO clients (name, company, email, phone, address, city, source)
             VALUES (?, ?, ?, ?, ?, ?, 'website')`
          )
          .run(name, company || null, email, phone, site_address || null, city || null);
        client = { id: info.lastInsertRowid };
      }

      const orderNumber = generateOrderNumber();
      const orderInfo = db
        .prepare(
          `INSERT INTO orders (order_number, client_id, status, source, site_address, needed_by, notes, total)
           VALUES (?, ?, 'pending', 'website', ?, ?, ?, 0)`
        )
        .run(orderNumber, client.id, site_address || null, needed_by || null, notes || null);

      const orderId = orderInfo.lastInsertRowid;
      let total = 0;

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, item_id, item_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      for (const ci of cartItems) {
        const item = db.prepare("SELECT * FROM items WHERE id = ?").get(ci.item_id);
        if (!item) continue;
        const qty = Math.max(1, parseInt(ci.quantity, 10) || 1);
        const lineTotal = item.price * qty;
        total += lineTotal;
        insertItem.run(orderId, item.id, item.name, item.price, qty, lineTotal);
      }

      db.prepare("UPDATE orders SET total = ? WHERE id = ?").run(total, orderId);

      return { orderNumber, total };
    });

    const result = insertOrder();
    res.json({ ok: true, orderNumber: result.orderNumber, total: result.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Something went wrong submitting your order." });
  }
});

function companyInfo() {
  return {
    name: "SiteGuard Baustellensicherung GmbH",
    tagline: "Barriers, signage & site protection — delivered before the first digger arrives.",
    email: "orders@siteguard.de",
    phone: "+49 30 1234 5678"
  };
}

module.exports = router;
