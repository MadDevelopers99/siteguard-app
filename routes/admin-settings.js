const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");

router.get("/", (req, res) => {
  const admin = db.prepare("SELECT id, name, email FROM admins WHERE id = ?").get(req.session.adminId);
  res.render("admin/settings", { admin, adminName: req.session.adminName, error: null, success: null });
});

router.post("/", (req, res) => {
  const { name, email, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.session.adminId);

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE admins SET name = ?, email = ?, password_hash = ? WHERE id = ?").run(
      name, email, hash, admin.id
    );
  } else {
    db.prepare("UPDATE admins SET name = ?, email = ? WHERE id = ?").run(name, email, admin.id);
  }

  req.session.adminName = name;
  const updated = db.prepare("SELECT id, name, email FROM admins WHERE id = ?").get(admin.id);
  res.render("admin/settings", { admin: updated, adminName: req.session.adminName, error: null, success: "Settings updated." });
});

module.exports = router;
