const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { ASSET_STATUS_OPTIONS } = require("../utils/constants");

function projectOptions() {
  return db
    .prepare(`SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id ORDER BY c.name, p.name`)
    .all();
}

router.get("/", (req, res) => {
  const { project_id, status } = req.query;
  let sql = `
    SELECT a.*, p.name AS project_name, c.name AS client_name
    FROM time_assets a
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE 1=1
  `;
  const params = [];
  if (project_id) {
    sql += " AND a.project_id = ?";
    params.push(project_id);
  }
  if (status) {
    sql += " AND a.status = ?";
    params.push(status);
  }
  sql += " ORDER BY a.created_at DESC";
  const assets = db.prepare(sql).all(...params);

  const markers = assets.filter((a) => a.lat != null).map((a) => ({ lat: a.lat, lng: a.lng, label: a.name, color: "#6d55e6" }));

  res.render("time/assets", {
    assets,
    markers,
    projects: projectOptions(),
    ASSET_STATUS_OPTIONS,
    filters: { project_id: project_id || "", status: status || "" }
  });
});

router.get("/new", (req, res) => {
  res.render("time/asset-form", { asset: null, projects: projectOptions(), ASSET_STATUS_OPTIONS, error: null });
});

function assetBody(req) {
  const { name, asset_type, project_id, serial_number, status, lat, lng, notes } = req.body;
  return {
    name,
    asset_type: asset_type || null,
    project_id: project_id || null,
    serial_number: serial_number || null,
    status: status || "Active",
    lat: lat ? parseFloat(lat) : null,
    lng: lng ? parseFloat(lng) : null,
    notes: notes || null
  };
}

router.post("/", (req, res) => {
  const b = assetBody(req);
  if (!b.name) {
    return res.render("time/asset-form", {
      asset: req.body,
      projects: projectOptions(),
      ASSET_STATUS_OPTIONS,
      error: "Please enter an asset name."
    });
  }

  const info = db
    .prepare(
      `INSERT INTO time_assets (name, asset_type, project_id, serial_number, status, lat, lng, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(b.name, b.asset_type, b.project_id, b.serial_number, b.status, b.lat, b.lng, b.notes);

  res.redirect(`/time/assets/${info.lastInsertRowid}`);
});

router.get("/:id", (req, res) => {
  const asset = db
    .prepare(
      `SELECT a.*, p.name AS project_name, c.name AS client_name
       FROM time_assets a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE a.id = ?`
    )
    .get(req.params.id);
  if (!asset) return res.status(404).send("Asset not found");

  const maintenance = db.prepare("SELECT * FROM time_asset_maintenance WHERE asset_id = ? ORDER BY date DESC").all(asset.id);
  res.render("time/asset-detail", { asset, maintenance });
});

router.get("/:id/edit", (req, res) => {
  const asset = db.prepare("SELECT * FROM time_assets WHERE id = ?").get(req.params.id);
  if (!asset) return res.status(404).send("Asset not found");
  res.render("time/asset-form", { asset, projects: projectOptions(), ASSET_STATUS_OPTIONS, error: null });
});

router.post("/:id", (req, res) => {
  const b = assetBody(req);
  db.prepare(
    `UPDATE time_assets SET name = ?, asset_type = ?, project_id = ?, serial_number = ?, status = ?, lat = ?, lng = ?, notes = ?,
     updated_at = datetime('now') WHERE id = ?`
  ).run(b.name, b.asset_type, b.project_id, b.serial_number, b.status, b.lat, b.lng, b.notes, req.params.id);
  res.redirect(`/time/assets/${req.params.id}`);
});

router.post("/:id/maintenance", (req, res) => {
  const { date, description, performed_by, cost } = req.body;
  if (description) {
    db.prepare("INSERT INTO time_asset_maintenance (asset_id, date, description, performed_by, cost) VALUES (?, ?, ?, ?, ?)").run(
      req.params.id,
      date || new Date().toISOString().slice(0, 10),
      description,
      performed_by || null,
      cost ? parseFloat(cost) : null
    );
  }
  res.redirect(`/time/assets/${req.params.id}`);
});

module.exports = router;
