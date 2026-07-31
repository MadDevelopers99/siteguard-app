const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { ADMIN_ROLE_OPTIONS } = require("../utils/constants");

router.get("/", (req, res) => {
  const employees = db.prepare("SELECT id, name, email, role, created_at FROM admins ORDER BY name").all();
  res.render("admin/employees", { employees, ADMIN_ROLE_OPTIONS, adminName: req.session.adminName, adminId: req.session.adminId });
});

router.post("/", (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = bcrypt.hashSync(password || "ChangeMe123!", 10);
    db.prepare("INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, ?)").run(
      name,
      email,
      hash,
      ADMIN_ROLE_OPTIONS.includes(role) ? role : "office_admin"
    );
  } catch (err) {
    console.error(err);
  }
  res.redirect("/admin/employees");
});

router.post("/:id/role", (req, res) => {
  const { role } = req.body;
  if (!ADMIN_ROLE_OPTIONS.includes(role)) return res.status(400).send("Invalid role.");
  db.prepare("UPDATE admins SET role = ? WHERE id = ?").run(role, req.params.id);
  res.redirect("/admin/employees");
});

router.post("/:id/delete", (req, res) => {
  if (Number(req.params.id) === req.session.adminId) {
    return res.status(400).send("You can't delete your own account.");
  }
  db.prepare("DELETE FROM admins WHERE id = ?").run(req.params.id);
  res.redirect("/admin/employees");
});

module.exports = router;
