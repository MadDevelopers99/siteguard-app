const express = require("express");
const router = express.Router();
const db = require("../db/database");

router.use((req, res, next) => {
  res.locals.userName = req.session.timeUserName;
  next();
});

router.get("/", (req, res) => {
  const services = db.prepare("SELECT * FROM services ORDER BY name").all();
  res.render("time/services", { services });
});

router.post("/", (req, res) => {
  const { name } = req.body;
  if (name && name.trim()) {
    db.prepare("INSERT INTO services (name) VALUES (?)").run(name.trim());
  }
  res.redirect("/time/services");
});

router.post("/:id/toggle", (req, res) => {
  db.prepare("UPDATE services SET is_active = 1 - is_active WHERE id = ?").run(req.params.id);
  res.redirect("/time/services");
});

module.exports = router;
