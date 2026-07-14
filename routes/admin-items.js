const express = require("express");
const router = express.Router();
const db = require("../db/database");

// ---------- List ----------
// NOTE: must be registered before GET "/:id/edit" so "/new" isn't captured as an id.
router.get("/", (req, res) => {
  const { q, category, status } = req.query;

  let sql = "SELECT * FROM items WHERE 1=1";
  const params = [];
  if (q) {
    sql += " AND (name LIKE ? OR sku LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (status === "active") sql += " AND active = 1";
  if (status === "inactive") sql += " AND active = 0";
  sql += " ORDER BY category, name";

  const items = db.prepare(sql).all(...params);
  const categories = db.prepare("SELECT DISTINCT category FROM items WHERE category IS NOT NULL ORDER BY category").all().map((r) => r.category);

  res.render("admin/items", {
    items,
    categories,
    filters: { q: q || "", category: category || "", status: status || "" }
  });
});

// ---------- New ----------
router.get("/new", (req, res) => {
  const categories = db.prepare("SELECT DISTINCT category FROM items WHERE category IS NOT NULL ORDER BY category").all().map((r) => r.category);
  res.render("admin/item-form", { item: null, categories });
});

router.post("/", (req, res) => {
  const { sku, name, category, price, unit, description, active } = req.body;
  try {
    db.prepare(
      `INSERT INTO items (sku, name, category, price, unit, description, active) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(sku, name, category || null, parseFloat(price) || 0, unit || "piece", description || null, active ? 1 : 0);
    res.redirect("/admin/items");
  } catch (err) {
    const categories = db.prepare("SELECT DISTINCT category FROM items WHERE category IS NOT NULL ORDER BY category").all().map((r) => r.category);
    res.render("admin/item-form", {
      item: req.body,
      categories,
      error: err.message.includes("UNIQUE") ? `SKU "${sku}" is already used by another item.` : err.message
    });
  }
});

// ---------- Edit ----------
router.get("/:id/edit", (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).send("Item not found");
  const categories = db.prepare("SELECT DISTINCT category FROM items WHERE category IS NOT NULL ORDER BY category").all().map((r) => r.category);
  res.render("admin/item-form", { item, categories });
});

router.post("/:id", (req, res) => {
  const { sku, name, category, price, unit, description, active } = req.body;
  try {
    db.prepare(
      `UPDATE items SET sku = ?, name = ?, category = ?, price = ?, unit = ?, description = ?, active = ? WHERE id = ?`
    ).run(sku, name, category || null, parseFloat(price) || 0, unit || "piece", description || null, active ? 1 : 0, req.params.id);
    res.redirect("/admin/items");
  } catch (err) {
    const categories = db.prepare("SELECT DISTINCT category FROM items WHERE category IS NOT NULL ORDER BY category").all().map((r) => r.category);
    res.render("admin/item-form", {
      item: { ...req.body, id: req.params.id },
      categories,
      error: err.message.includes("UNIQUE") ? `SKU "${sku}" is already used by another item.` : err.message
    });
  }
});

router.post("/:id/toggle", (req, res) => {
  db.prepare("UPDATE items SET active = 1 - active WHERE id = ?").run(req.params.id);
  res.redirect("/admin/items");
});

module.exports = router;
