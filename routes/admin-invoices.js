const express = require("express");
const router = express.Router();
const { getOrders } = require("../utils/order-query");
const { statusBadgeClass } = require("../utils/helpers");
const { ORDER_PAYMENT_STATUS_OPTIONS } = require("../utils/constants");

// Invoices = orders that have a real price attached (confirmed/delivered),
// reusing the same order data + PDF route as the main Orders list rather
// than maintaining a separate invoice ledger.
router.get("/", (req, res) => {
  const { payment_status, q } = req.query;
  const confirmed = getOrders({ status: "confirmed", q });
  const delivered = getOrders({ status: "delivered", q });
  let orders = [...confirmed, ...delivered].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (payment_status) orders = orders.filter((o) => (o.payment_status || "Unpaid") === payment_status);

  res.render("admin/invoices", {
    orders,
    filters: { payment_status: payment_status || "", q: q || "" },
    ORDER_PAYMENT_STATUS_OPTIONS,
    statusBadgeClass,
    adminName: req.session.adminName
  });
});

module.exports = router;
