const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { INTEGRATION_PROVIDERS } = require("../utils/constants");

function providerDef(key) {
  return INTEGRATION_PROVIDERS.find((p) => p.key === key);
}

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM time_integrations ORDER BY display_name").all();
  const integrations = rows.map((row) => ({
    ...row,
    def: providerDef(row.provider_key)
  }));
  res.render("time/integrations", { integrations });
});

router.get("/:key/configure", (req, res) => {
  const def = providerDef(req.params.key);
  if (!def) return res.status(404).send("Unknown integration");
  const row = db.prepare("SELECT * FROM time_integrations WHERE provider_key = ?").get(req.params.key);
  const config = row && row.config ? JSON.parse(row.config) : {};
  res.render("time/integration-configure", { def, row, config, error: null });
});

router.post("/:key/configure", (req, res) => {
  const def = providerDef(req.params.key);
  if (!def) return res.status(404).send("Unknown integration");

  const config = {};
  def.fields.forEach((f) => {
    config[f.name] = req.body[f.name] || "";
  });

  db.prepare("UPDATE time_integrations SET config = ?, status = 'configured', updated_at = datetime('now') WHERE provider_key = ?").run(
    JSON.stringify(config),
    req.params.key
  );

  res.redirect("/time/integrations");
});

router.post("/:key/disconnect", (req, res) => {
  db.prepare("UPDATE time_integrations SET config = NULL, status = 'not_configured', updated_at = datetime('now') WHERE provider_key = ?").run(
    req.params.key
  );
  res.redirect("/time/integrations");
});

module.exports = router;
