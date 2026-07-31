// Shared order-list query logic for the Office Admin order dashboard.
// Centralized here so the price/city/service-type join used by the stat
// cards, the orders list, CSV/Excel export, and the PDF/Invoices/Reports
// pages can never drift out of sync with each other.
//
// Request-linked Auftraege price their work on `requests.total_gross`, not
// `orders.total` (which is only ever set once, at Auftrag-creation time, and
// goes stale if the request's pricing is edited afterward) — every money
// figure here uses effective_total = COALESCE(request.total_gross, order.total, 0)
// so the two order "shapes" (simple item orders vs. request-linked Auftraege)
// are always compared on the same footing.

const db = require("../db/database");

const ORDER_LIST_SQL = `
  SELECT
    o.*,
    c.name    AS client_name,
    c.company AS client_company,
    c.email   AS client_email,
    c.phone   AS client_phone,
    c.city    AS client_city,
    c.address AS client_address,
    cl.city   AS location_city,
    cl.length_meters AS location_length_m,
    r.request_number AS request_number,
    r.request_type   AS service_type,
    r.date_from       AS start_date,
    r.date_to         AS end_date,
    r.required_length_meters AS request_length_m,
    r.total_gross AS request_total_gross,
    COALESCE(cl.city, c.city) AS display_city,
    COALESCE(r.required_length_meters, cl.length_meters) AS zone_length_m,
    COALESCE(r.total_gross, o.total, 0) AS effective_total
  FROM orders o
  JOIN clients c ON c.id = o.client_id
  LEFT JOIN client_locations cl ON cl.id = o.location_id
  LEFT JOIN requests r ON r.id = o.request_id
`;

// filters: { status, source, q, city, service_type, date_from, date_to, payment_status, ma_status }
function buildOrderWhere(filters = {}) {
  const clauses = ["1=1"];
  const params = [];

  if (filters.status) { clauses.push("o.status = ?"); params.push(filters.status); }
  if (filters.source) { clauses.push("o.source = ?"); params.push(filters.source); }
  if (filters.q) {
    clauses.push("(c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR o.order_number LIKE ?)");
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like);
  }
  if (filters.city) { clauses.push("COALESCE(cl.city, c.city) LIKE ?"); params.push(`%${filters.city}%`); }
  if (filters.service_type) { clauses.push("r.request_type = ?"); params.push(filters.service_type); }
  if (filters.date_from) { clauses.push("date(o.created_at) >= date(?)"); params.push(filters.date_from); }
  if (filters.date_to) { clauses.push("date(o.created_at) <= date(?)"); params.push(filters.date_to); }
  if (filters.payment_status) { clauses.push("o.payment_status = ?"); params.push(filters.payment_status); }
  if (filters.ma_status) { clauses.push("o.main_admin_status = ?"); params.push(filters.ma_status); }

  return { whereSql: clauses.join(" AND "), params };
}

function getOrders(filters) {
  const { whereSql, params } = buildOrderWhere(filters);
  return db.prepare(`${ORDER_LIST_SQL} WHERE ${whereSql} ORDER BY o.created_at DESC`).all(...params);
}

function getOrderById(id) {
  return db.prepare(`${ORDER_LIST_SQL} WHERE o.id = ?`).get(id);
}

function getOrderStats() {
  return db.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(CASE WHEN o.source='website' THEN 1 ELSE 0 END) AS website_orders,
      SUM(CASE WHEN o.source='email' THEN 1 ELSE 0 END) AS email_orders,
      SUM(CASE WHEN o.source='manual' THEN 1 ELSE 0 END) AS manual_orders,
      SUM(CASE WHEN o.status='pending' THEN 1 ELSE 0 END) AS pending_orders,
      SUM(CASE WHEN o.status='approval_needed' THEN 1 ELSE 0 END) AS approval_needed,
      SUM(CASE WHEN o.status='confirmed' THEN 1 ELSE 0 END) AS confirmed_orders,
      SUM(CASE WHEN o.status='dispatched' THEN 1 ELSE 0 END) AS dispatched_orders,
      SUM(CASE WHEN o.status='returned_from_ma' THEN 1 ELSE 0 END) AS returned_orders,
      SUM(CASE WHEN o.status='delivered' THEN 1 ELSE 0 END) AS delivered_orders,
      SUM(CASE WHEN o.status='cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
      SUM(CASE WHEN o.status='confirmed' THEN COALESCE(r.total_gross,o.total,0) ELSE 0 END) AS confirmed_value,
      SUM(CASE WHEN o.status='delivered' THEN COALESCE(r.total_gross,o.total,0) ELSE 0 END) AS delivered_value,
      SUM(CASE WHEN o.status!='cancelled' AND strftime('%Y-%m',o.created_at)=strftime('%Y-%m','now')
               THEN COALESCE(r.total_gross,o.total,0) ELSE 0 END) AS revenue_this_month,
      SUM(CASE WHEN o.status NOT IN ('delivered','cancelled')
               THEN COALESCE(r.total_gross,o.total,0) ELSE 0 END) AS pending_revenue,
      SUM(CASE WHEN o.status='cancelled' THEN COALESCE(r.total_gross,o.total,0) ELSE 0 END) AS cancelled_value
    FROM orders o LEFT JOIN requests r ON r.id = o.request_id
  `).get();
}

// Shared column definitions for CSV/Excel export, so the two formats and the
// on-screen table can't drift apart.
const ORDER_EXPORT_COLUMNS = [
  { header: "Order Number", get: (o) => o.order_number },
  { header: "Date", get: (o) => o.created_at },
  { header: "Source", get: (o) => o.source },
  { header: "Client", get: (o) => o.client_name },
  { header: "Company", get: (o) => o.client_company || "" },
  { header: "City", get: (o) => o.display_city || "" },
  { header: "Service Type", get: (o) => o.service_type || "" },
  { header: "Start Date", get: (o) => o.start_date || o.needed_by || "" },
  { header: "End Date", get: (o) => o.end_date || "" },
  { header: "Zone Length (m)", get: (o) => (o.zone_length_m ?? "") },
  { header: "Price (EUR)", get: (o) => o.effective_total.toFixed(2) },
  { header: "Payment", get: (o) => o.payment_status || "Unpaid" },
  { header: "Status", get: (o) => o.status },
  { header: "MA Status", get: (o) => o.main_admin_status || "" },
  { header: "Email", get: (o) => o.client_email || "" },
  { header: "Phone", get: (o) => o.client_phone || "" }
];

module.exports = { ORDER_LIST_SQL, buildOrderWhere, getOrders, getOrderById, getOrderStats, ORDER_EXPORT_COLUMNS };
