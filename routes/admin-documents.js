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

router.post("/upload", upload.single("file"), (req, res) => {
  const { entity_type, entity_id, category } = req.body;
  if (!req.file || !entity_type || !entity_id) {
    return res.status(400).send("Missing file or target.");
  }

  db.prepare(
    `INSERT INTO documents (entity_type, entity_id, category, original_name, stored_filename, uploaded_by, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Uploaded')`
  ).run(entity_type, entity_id, category || "Other", req.file.originalname, req.file.filename, req.session.adminName || "Admin");

  const backTo = entity_type === "client"
    ? `/admin/clients/${entity_id}?tab=documents`
    : `/admin/requests/${entity_id}?tab=documents`;
  res.redirect(backTo);
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
  const backTo = doc.entity_type === "client"
    ? `/admin/clients/${doc.entity_id}?tab=documents`
    : `/admin/requests/${doc.entity_id}?tab=documents`;
  res.redirect(backTo);
});

router.post("/:id/delete", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return res.status(404).send("Document not found");
  db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
  fs.unlink(path.join(uploadsDir, doc.stored_filename), () => {});
  const backTo = doc.entity_type === "client"
    ? `/admin/clients/${doc.entity_id}?tab=documents`
    : `/admin/requests/${doc.entity_id}?tab=documents`;
  res.redirect(backTo);
});

module.exports = router;
