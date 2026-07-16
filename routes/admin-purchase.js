const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { generateNumber, statusBadgeClass } = require("../utils/helpers");
const {
  SUPPLIER_STATUSES,
  SUPPLIER_CATEGORIES,
  PO_STATUSES,
  WHOLESALE_BATCH_STATUSES,
  INTERNAL_SALE_STATUSES,
  PRICE_RULE_METHODS,
  PRICE_RULE_STATUSES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES
} = require("../utils/constants");

const VAT_RATE = 19;

function arr(v) {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

// ---------- Dashboard ----------
router.get("/dashboard", (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;

  const stats = {
    activePOs: count("SELECT COUNT(*) AS n FROM purchase_orders WHERE status NOT IN ('Closed','Cancelled')"),
    goodsWaiting: count("SELECT COUNT(*) AS n FROM purchase_orders WHERE status = 'Ordered'"),
    wholesaleStockValue: count(
      "SELECT COALESCE(SUM(available_qty * purchase_unit_cost),0) AS n FROM wholesale_batches WHERE status NOT IN ('Closed')"
    ),
    itemsReadyToSell: count("SELECT COUNT(*) AS n FROM wholesale_batches WHERE available_qty > 0 AND status IN ('Available','Partially Sold to SG')"),
    salesThisMonth: count(
      "SELECT COALESCE(SUM(gross_amount),0) AS n FROM internal_sales WHERE status = 'Completed' AND strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now')"
    ),
    openSupplierInvoices: count("SELECT COUNT(*) AS n FROM purchase_orders WHERE status = 'Invoice Received'"),
    pendingSgReceipts: count("SELECT COUNT(*) AS n FROM internal_sales WHERE status = 'Sent to SG'"),
    lowWholesaleStock: count("SELECT COUNT(*) AS n FROM wholesale_batches WHERE available_qty > 0 AND available_qty < 10")
  };

  res.render("admin-purchase/dashboard", { stats, adminName: req.session.adminName });
});

// ---------- Suppliers ----------
router.get("/suppliers", (req, res) => {
  const suppliers = db.prepare("SELECT * FROM suppliers ORDER BY name").all();
  res.render("admin-purchase/suppliers", { suppliers, statusBadgeClass, adminName: req.session.adminName });
});

router.get("/suppliers/new", (req, res) => {
  res.render("admin-purchase/supplier-form", { supplier: null, SUPPLIER_CATEGORIES, SUPPLIER_STATUSES });
});

router.post("/suppliers", (req, res) => {
  const { name, contact_person, phone, email, address, vat_id, payment_terms, category, notes } = req.body;
  db.prepare(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, vat_id, payment_terms, category, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, contact_person || null, phone || null, email || null, address || null, vat_id || null, payment_terms || null, category || null, notes || null);
  res.redirect("/admin/purchase/suppliers");
});

router.get("/suppliers/:id/edit", (req, res) => {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) return res.status(404).send("Supplier not found");
  res.render("admin-purchase/supplier-form", { supplier, SUPPLIER_CATEGORIES, SUPPLIER_STATUSES });
});

router.post("/suppliers/:id", (req, res) => {
  const { name, contact_person, phone, email, address, vat_id, payment_terms, category, status, notes } = req.body;
  db.prepare(
    `UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, vat_id = ?,
      payment_terms = ?, category = ?, status = ?, notes = ? WHERE id = ?`
  ).run(name, contact_person || null, phone || null, email || null, address || null, vat_id || null, payment_terms || null, category || null, status || "Active", notes || null, req.params.id);
  res.redirect("/admin/purchase/suppliers");
});

// ---------- Purchase Orders ----------
router.get("/orders", (req, res) => {
  const orders = db
    .prepare(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ORDER BY po.created_at DESC`)
    .all();
  res.render("admin-purchase/orders", { orders, statusBadgeClass, adminName: req.session.adminName });
});

router.get("/orders/new", (req, res) => {
  const suppliers = db.prepare("SELECT * FROM suppliers WHERE status = 'Active' ORDER BY name").all();
  res.render("admin-purchase/order-new", { suppliers });
});

router.post("/orders", (req, res) => {
  const { supplier_id, expected_delivery_date, payment_terms, delivery_address, notes, item_name, supplier_article_no, qty, unit_cost } = req.body;

  const names = arr(item_name), articleNos = arr(supplier_article_no), qtys = arr(qty), costs = arr(unit_cost);
  let netAmount = 0;
  const lineItems = names.map((name, idx) => {
    const q = parseFloat(qtys[idx]) || 0;
    const cost = parseFloat(costs[idx]) || 0;
    const net = q * cost;
    netAmount += net;
    return { name, articleNo: articleNos[idx] || null, qty: q, cost, net };
  }).filter((li) => li.name);

  const vatAmount = Math.round(netAmount * (VAT_RATE / 100) * 100) / 100;
  const grossAmount = Math.round((netAmount + vatAmount) * 100) / 100;

  const run = db.transaction(() => {
    const poNumber = generateNumber("PO");
    const poInfo = db
      .prepare(
        `INSERT INTO purchase_orders (po_number, supplier_id, expected_delivery_date, payment_terms, delivery_address, created_by, net_amount, vat_amount, gross_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(poNumber, supplier_id, expected_delivery_date || null, payment_terms || null, delivery_address || null, req.session.adminName || "Admin", netAmount, vatAmount, grossAmount, notes || null);

    const insertItem = db.prepare(
      `INSERT INTO purchase_order_items (po_id, item_name, supplier_article_no, qty, unit_cost, net_total) VALUES (?, ?, ?, ?, ?, ?)`
    );
    lineItems.forEach((li) => insertItem.run(poInfo.lastInsertRowid, li.name, li.articleNo, li.qty, li.cost, li.net));

    return poInfo.lastInsertRowid;
  });

  const poId = run();
  res.redirect(`/admin/purchase/orders/${poId}`);
});

router.get("/orders/:id", (req, res) => {
  const order = db
    .prepare(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`)
    .get(req.params.id);
  if (!order) return res.status(404).send("Purchase order not found");

  const items = db.prepare("SELECT * FROM purchase_order_items WHERE po_id = ?").all(req.params.id);
  const receipts = db.prepare("SELECT * FROM goods_receipts WHERE po_id = ? ORDER BY created_at DESC").all(req.params.id);
  const documents = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'purchase_order' AND entity_id = ? ORDER BY created_at DESC")
    .all(req.params.id);

  res.render("admin-purchase/order-detail", {
    order, items, receipts, documents, PO_STATUSES, DOCUMENT_CATEGORIES, DOCUMENT_STATUSES, statusBadgeClass, adminName: req.session.adminName
  });
});

router.post("/orders/:id", (req, res) => {
  db.prepare("UPDATE purchase_orders SET status = ?, supplier_invoice_number = ? WHERE id = ?").run(
    req.body.status, req.body.supplier_invoice_number || null, req.params.id
  );
  res.redirect(`/admin/purchase/orders/${req.params.id}`);
});

// ---------- Goods Received ----------
router.get("/receipts", (req, res) => {
  const receipts = db
    .prepare(`SELECT gr.*, po.po_number, s.name AS supplier_name FROM goods_receipts gr
               JOIN purchase_orders po ON po.id = gr.po_id JOIN suppliers s ON s.id = gr.supplier_id
               ORDER BY gr.created_at DESC`)
    .all();
  res.render("admin-purchase/receipts", { receipts, statusBadgeClass, adminName: req.session.adminName });
});

router.get("/receipts/new", (req, res) => {
  const orders = db
    .prepare(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
               WHERE po.status IN ('Ordered','Partially Received') ORDER BY po.created_at DESC`)
    .all();
  const poId = req.query.po_id;
  const selectedPo = poId ? db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(poId) : null;
  const poItems = poId ? db.prepare("SELECT * FROM purchase_order_items WHERE po_id = ?").all(poId) : [];
  res.render("admin-purchase/receipt-new", { orders, selectedPo, poItems });
});

router.post("/receipts", (req, res) => {
  const { po_id, received_by, delivery_note_number, storage_location, notes, po_item_id, item_name, ordered_qty, received_qty, condition } = req.body;

  const po = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(po_id);
  const poItemIds = arr(po_item_id), names = arr(item_name), orderedQtys = arr(ordered_qty), receivedQtys = arr(received_qty), conditions = arr(condition);

  let anyShort = false;
  const lineItems = names.map((name, idx) => {
    const ordered = parseFloat(orderedQtys[idx]) || 0;
    const received = parseFloat(receivedQtys[idx]) || 0;
    if (received < ordered) anyShort = true;
    return { poItemId: poItemIds[idx] || null, name, ordered, received, diff: received - ordered, condition: conditions[idx] || "Good" };
  });

  const run = db.transaction(() => {
    const grNumber = generateNumber("GR");
    const grInfo = db
      .prepare(
        `INSERT INTO goods_receipts (gr_number, po_id, supplier_id, received_by, delivery_note_number, storage_location, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(grNumber, po_id, po.supplier_id, received_by || req.session.adminName || "Admin", delivery_note_number || null, storage_location || null, anyShort ? "Partial" : "Complete", notes || null);

    const insertItem = db.prepare(
      `INSERT INTO goods_receipt_items (goods_receipt_id, po_item_id, item_name, ordered_qty, received_qty, difference, condition)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    lineItems.forEach((li) => insertItem.run(grInfo.lastInsertRowid, li.poItemId, li.name, li.ordered, li.received, li.diff, li.condition));

    db.prepare("UPDATE purchase_orders SET status = ? WHERE id = ?").run(anyShort ? "Partially Received" : "Received", po_id);

    return grInfo.lastInsertRowid;
  });

  const grId = run();
  res.redirect(`/admin/purchase/receipts?highlight=${grId}`);
});

router.post("/receipts/:id/create-batch", (req, res) => {
  const receipt = db.prepare("SELECT * FROM goods_receipts WHERE id = ?").get(req.params.id);
  const items = db.prepare("SELECT * FROM goods_receipt_items WHERE goods_receipt_id = ?").all(req.params.id);
  const poItems = db.prepare("SELECT * FROM purchase_order_items WHERE po_id = ?").all(receipt.po_id);
  const costByName = {};
  poItems.forEach((pi) => (costByName[pi.item_name] = pi.unit_cost));

  const run = db.transaction(() => {
    const insertBatch = db.prepare(
      `INSERT INTO wholesale_batches (batch_number, po_id, supplier_id, item_name, purchased_qty, available_qty, purchase_unit_cost, storage_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    items.forEach((it) => {
      if (it.received_qty > 0) {
        insertBatch.run(
          generateNumber("BATCH"), receipt.po_id, receipt.supplier_id, it.item_name,
          it.received_qty, it.received_qty, costByName[it.item_name] || 0, receipt.storage_location
        );
      }
    });
  });
  run();

  res.redirect("/admin/purchase/batches");
});

// ---------- Wholesale Stock / Batches ----------
router.get("/batches", (req, res) => {
  const batches = db
    .prepare(`SELECT b.*, s.name AS supplier_name FROM wholesale_batches b LEFT JOIN suppliers s ON s.id = b.supplier_id ORDER BY b.created_at DESC`)
    .all();
  res.render("admin-purchase/batches", { batches, statusBadgeClass, adminName: req.session.adminName });
});

router.post("/batches/:id/price", (req, res) => {
  const { internal_sg_sell_price, landed_cost } = req.body;
  db.prepare("UPDATE wholesale_batches SET internal_sg_sell_price = ?, landed_cost = ? WHERE id = ?").run(
    parseFloat(internal_sg_sell_price) || 0, landed_cost ? parseFloat(landed_cost) : null, req.params.id
  );
  res.redirect("/admin/purchase/batches");
});

// ---------- Internal Sale to SG ----------
router.get("/sales", (req, res) => {
  const sales = db.prepare("SELECT * FROM internal_sales ORDER BY created_at DESC").all();
  res.render("admin-purchase/sales", { sales, statusBadgeClass, adminName: req.session.adminName });
});

router.get("/sales/new", (req, res) => {
  const batches = db.prepare("SELECT * FROM wholesale_batches WHERE available_qty > 0 ORDER BY item_name").all();
  res.render("admin-purchase/sale-new", { batches });
});

router.post("/sales", (req, res) => {
  const { notes, batch_id, qty_sold, internal_unit_price } = req.body;
  const batchIds = arr(batch_id), qtys = arr(qty_sold), prices = arr(internal_unit_price);

  let netAmount = 0;
  const lineItems = batchIds.map((bid, idx) => {
    const batch = db.prepare("SELECT * FROM wholesale_batches WHERE id = ?").get(bid);
    const q = parseFloat(qtys[idx]) || 0;
    const price = parseFloat(prices[idx]) || (batch ? batch.internal_sg_sell_price : 0);
    const net = q * price;
    netAmount += net;
    return { batchId: bid, itemName: batch ? batch.item_name : "Unknown", qty: q, price, net };
  }).filter((li) => li.qty > 0);

  const vatAmount = Math.round(netAmount * (VAT_RATE / 100) * 100) / 100;
  const grossAmount = Math.round((netAmount + vatAmount) * 100) / 100;

  const run = db.transaction(() => {
    const saleNumber = generateNumber("SG-SALE");
    const saleInfo = db
      .prepare(
        `INSERT INTO internal_sales (sale_number, reference_number, net_amount, vat_amount, gross_amount, created_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(saleNumber, saleNumber, netAmount, vatAmount, grossAmount, req.session.adminName || "Admin", notes || null);

    const insertItem = db.prepare(
      `INSERT INTO internal_sale_items (internal_sale_id, batch_id, item_name, qty_sold, internal_unit_price, net_total) VALUES (?, ?, ?, ?, ?, ?)`
    );
    lineItems.forEach((li) => insertItem.run(saleInfo.lastInsertRowid, li.batchId, li.itemName, li.qty, li.price, li.net));

    return saleInfo.lastInsertRowid;
  });

  const saleId = run();
  res.redirect(`/admin/purchase/sales/${saleId}`);
});

router.get("/sales/:id", (req, res) => {
  const sale = db.prepare("SELECT * FROM internal_sales WHERE id = ?").get(req.params.id);
  if (!sale) return res.status(404).send("Internal sale not found");
  const items = db.prepare("SELECT * FROM internal_sale_items WHERE internal_sale_id = ?").all(req.params.id);
  const documents = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'internal_sale' AND entity_id = ? ORDER BY created_at DESC")
    .all(req.params.id);
  res.render("admin-purchase/sale-detail", {
    sale, items, documents, INTERNAL_SALE_STATUSES, DOCUMENT_CATEGORIES, DOCUMENT_STATUSES, statusBadgeClass, adminName: req.session.adminName
  });
});

router.post("/sales/:id/approve", (req, res) => {
  db.prepare("UPDATE internal_sales SET status = 'Approved', approved_by = ? WHERE id = ?").run(req.session.adminName || "Admin", req.params.id);
  res.redirect(`/admin/purchase/sales/${req.params.id}`);
});

router.post("/sales/:id/send", (req, res) => {
  db.prepare("UPDATE internal_sales SET status = 'Sent to SG' WHERE id = ?").run(req.params.id);
  res.redirect(`/admin/purchase/sales/${req.params.id}`);
});

router.post("/sales/:id/cancel", (req, res) => {
  db.prepare("UPDATE internal_sales SET status = 'Cancelled' WHERE id = ?").run(req.params.id);
  res.redirect(`/admin/purchase/sales/${req.params.id}`);
});

// The critical cross-module step: completing an internal sale moves real stock
// into Main Inventory. See plan §2 "What Happens After Internal Sale to SG?".
router.post("/sales/:id/complete", (req, res) => {
  const sale = db.prepare("SELECT * FROM internal_sales WHERE id = ?").get(req.params.id);
  if (!sale) return res.status(404).send("Internal sale not found");
  if (sale.status === "Completed") return res.redirect(`/admin/purchase/sales/${req.params.id}`);

  const items = db.prepare("SELECT * FROM internal_sale_items WHERE internal_sale_id = ?").all(req.params.id);

  const run = db.transaction(() => {
    items.forEach((li) => {
      const batch = db.prepare("SELECT * FROM wholesale_batches WHERE id = ?").get(li.batch_id);
      if (batch) {
        const newAvailable = Math.max(0, batch.available_qty - li.qty_sold);
        const newStatus = newAvailable === 0 ? "Sold to SG" : "Partially Sold to SG";
        db.prepare("UPDATE wholesale_batches SET available_qty = ?, status = ? WHERE id = ?").run(newAvailable, newStatus, li.batch_id);
      }

      let item = db.prepare("SELECT * FROM inventory_catalog WHERE item_name = ?").get(li.item_name);
      if (!item) {
        const info = db
          .prepare("INSERT INTO inventory_catalog (item_name, available_stock, main_supplier_id) VALUES (?, 0, NULL)")
          .run(li.item_name);
        item = db.prepare("SELECT * FROM inventory_catalog WHERE id = ?").get(info.lastInsertRowid);
      }

      db.prepare("UPDATE inventory_catalog SET available_stock = available_stock + ? WHERE id = ?").run(li.qty_sold, item.id);
      db.prepare(
        `INSERT INTO stock_movements (item_id, movement_type, quantity, source_type, source_reference, created_by, notes)
         VALUES (?, 'in', ?, 'Internal Sale to SG', ?, ?, ?)`
      ).run(item.id, li.qty_sold, sale.sale_number, req.session.adminName || "Admin", `Received from Purchase & Sell-to-SG (${sale.sale_number})`);

      const it = db.prepare("SELECT * FROM inventory_catalog WHERE id = ?").get(item.id);
      const available = (it.available_stock || 0) - (it.reserved_qty || 0) - (it.damaged_qty || 0);
      const status = it.available_stock <= 0 ? "Out of Stock" : available <= (it.minimum_stock || 0) ? "Low Stock" : "Available";
      db.prepare("UPDATE inventory_catalog SET status = ? WHERE id = ?").run(status, item.id);
    });

    db.prepare("UPDATE internal_sales SET status = 'Completed' WHERE id = ?").run(req.params.id);
  });
  run();

  res.redirect(`/admin/purchase/sales/${req.params.id}`);
});

// ---------- Price Rules ----------
router.get("/price-rules", (req, res) => {
  const rules = db.prepare("SELECT * FROM price_rules ORDER BY created_at DESC").all();
  res.render("admin-purchase/price-rules", { rules, PRICE_RULE_METHODS, PRICE_RULE_STATUSES, adminName: req.session.adminName });
});

router.post("/price-rules", (req, res) => {
  const { rule_name, item_category, calculation_method, markup_pct, fixed_fee, fixed_price, minimum_price, valid_from, valid_to } = req.body;
  db.prepare(
    `INSERT INTO price_rules (rule_name, item_category, calculation_method, markup_pct, fixed_fee, fixed_price, minimum_price, valid_from, valid_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(rule_name, item_category || null, calculation_method || "Fixed markup %", markup_pct ? parseFloat(markup_pct) : null, fixed_fee ? parseFloat(fixed_fee) : null, fixed_price ? parseFloat(fixed_price) : null, minimum_price ? parseFloat(minimum_price) : null, valid_from || null, valid_to || null);
  res.redirect("/admin/purchase/price-rules");
});

router.post("/price-rules/:id/deactivate", (req, res) => {
  const rule = db.prepare("SELECT * FROM price_rules WHERE id = ?").get(req.params.id);
  db.prepare("UPDATE price_rules SET status = ? WHERE id = ?").run(rule.status === "Active" ? "Inactive" : "Active", req.params.id);
  res.redirect("/admin/purchase/price-rules");
});

// ---------- Reports ----------
router.get("/reports", (req, res) => {
  const purchasesBySupplier = db
    .prepare(`SELECT s.name AS supplier_name, COUNT(po.id) AS order_count, COALESCE(SUM(po.gross_amount),0) AS total
               FROM suppliers s LEFT JOIN purchase_orders po ON po.supplier_id = s.id GROUP BY s.id ORDER BY total DESC`)
    .all();
  const salesReport = db.prepare("SELECT * FROM internal_sales WHERE status = 'Completed' ORDER BY sale_date DESC").all();
  const batchStock = db.prepare("SELECT item_name, SUM(available_qty) AS qty, SUM(available_qty * purchase_unit_cost) AS value FROM wholesale_batches GROUP BY item_name").all();
  const openInvoices = db.prepare("SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.status = 'Invoice Received'").all();

  res.render("admin-purchase/reports", { purchasesBySupplier, salesReport, batchStock, openInvoices, adminName: req.session.adminName });
});

// ---------- Settings ----------
router.get("/settings", (req, res) => {
  res.render("admin-purchase/settings", {
    SUPPLIER_STATUSES, SUPPLIER_CATEGORIES, PO_STATUSES, WHOLESALE_BATCH_STATUSES, INTERNAL_SALE_STATUSES, PRICE_RULE_METHODS,
    adminName: req.session.adminName
  });
});

module.exports = router;
