const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db/database");

const uploadsDir = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomBytes(16).toString("hex") + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

function uploaderName(req) {
  return req.session.adminName || req.session.mainAdminName || req.session.driverName || "User";
}

function backToFor(req, entityType, entityId) {
  if (entityType === "client") return `/admin/clients/${entityId}?tab=documents`;
  if (entityType === "request") return `/admin/requests/${entityId}?tab=documents`;
  if (entityType === "driver") return `/main-admin/team/drivers/${entityId}?tab=documents`;
  if (entityType === "inventory_item") return `/admin/inventory/items/${entityId}?tab=documents`;
  if (entityType === "purchase_order") return `/admin/purchase/orders/${entityId}`;
  if (entityType === "goods_receipt") return `/admin/purchase/receipts`;
  if (entityType === "internal_sale") return `/admin/purchase/sales/${entityId}`;
  // entityType === "order"
  if (req.session.driverId) return `/driver/tasks/${entityId}?tab=photos`;
  return `/main-admin/auftraege/${entityId}?tab=map`;
}

router.post("/upload", upload.single("file"), (req, res) => {
  const { entity_type, entity_id, category, gps_location } = req.body;
  if (!req.file || !entity_type || !entity_id) {
    return res.status(400).send("Missing file or target.");
  }

  db.prepare(
    `INSERT INTO documents (entity_type, entity_id, category, original_name, stored_filename, uploaded_by, status, gps_location)
     VALUES (?, ?, ?, ?, ?, ?, 'Uploaded', ?)`
  ).run(entity_type, entity_id, category || "Other", req.file.originalname, req.file.filename, uploaderName(req), gps_location || null);

  res.redirect(backToFor(req, entity_type, entity_id));
});

router.get("/:id/download", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return res.status(404).send("Document not found");
  res.download(path.join(uploadsDir, doc.stored_filename), doc.original_name);
});

router.post("/:id/status", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return res.status(404).send("Document not found");
  db.prepare("UPDATE documents SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  res.redirect(backToFor(req, doc.entity_type, doc.entity_id));
});

router.post("/:id/delete", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return res.status(404).send("Document not found");
  db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
  fs.unlink(path.join(uploadsDir, doc.stored_filename), () => {});
  res.redirect(backToFor(req, doc.entity_type, doc.entity_id));
});

module.exports = router;
