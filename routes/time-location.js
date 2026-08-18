const express = require("express");
const router = express.Router();
const { recordLocationPing } = require("../utils/geofence");

router.post("/ping", (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  const accuracy = req.body.accuracy != null ? parseFloat(req.body.accuracy) : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat/lng required" });
  }

  const transitions = recordLocationPing(req.session.timeUserId, lat, lng, accuracy);
  res.json({ ok: true, transitions });
});

module.exports = router;
