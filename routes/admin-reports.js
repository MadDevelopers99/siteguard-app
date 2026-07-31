const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { ORDER_STATUS_OPTIONS } = require("../utils/constants");

router.get("/", (req, res) => {
  const byStatus = db
    .prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY n DESC")
    .all();
  const bySource = db
    .prepare("SELECT source, COUNT(*) AS n FROM orders GROUP BY source ORDER BY n DESC")
    .all();
  const revenueByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', o.created_at) AS month,
              SUM(COALESCE(r.total_gross, o.total, 0)) AS revenue,
              COUNT(*) AS n
       FROM orders o LEFT JOIN requests r ON r.id = o.request_id
       WHERE o.status != 'cancelled'
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`
    )
    .all();

  const statusLabel = (value) => (ORDER_STATUS_OPTIONS.find((s) => s.value === value) || {}).label || value;

  res.render("admin/reports", { byStatus, bySource, revenueByMonth, statusLabel, adminName: req.session.adminName });
});

module.exports = router;
