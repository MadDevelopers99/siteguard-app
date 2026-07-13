const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { generateRequestNumber, generateOrderNumber } = require("../utils/helpers");
const { suggestForRequest } = require("../utils/inventory-suggest");
const { calculatePricing } = require("../utils/pricing");
const {
  REQUEST_TYPES,
  URGENCY_OPTIONS,
  KVR_STATUS_OPTIONS,
  ABSICHERUNG_TYPE_OPTIONS,
  MAP_FEE_TIERS,
  TRANSPORT_ZONES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES
} = require("../utils/constants");

function displayRequestId(id) {
  return `REQ-${3000 + id}`;
}

function recomputeTotals(request) {
  const rows = db.prepare("SELECT * FROM request_pricing WHERE request_id = ? ORDER BY sort_order, id").all(request.id);
  const subtotalNet = rows.reduce((sum, r) => sum + r.net_total, 0);
  const vatRate = request.vat_rate || 19;
  const vatAmount = Math.round(subtotalNet * (vatRate / 100) * 100) / 100;
  const totalGross = Math.round((subtotalNet + vatAmount) * 100) / 100;
  db.prepare(
    "UPDATE requests SET subtotal_net = ?, vat_amount = ?, total_gross = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(subtotalNet, vatAmount, totalGross, request.id);
  return { subtotalNet, vatAmount, totalGross };
}

// ---------- New request ----------
router.get("/new", (req, res) => {
  const clientId = req.query.client_id;
  const clientRow = clientId ? db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId) : null;
  const clients = clientRow ? [] : db.prepare("SELECT * FROM clients ORDER BY company, name").all();
  res.render("admin/request-new", { clientRow, clients, REQUEST_TYPES, URGENCY_OPTIONS });
});

router.post("/", (req, res) => {
  const {
    client_id, request_type, purpose, date_from, date_to, time_from, time_to,
    number_of_days, urgency, required_length_meters, parking_spaces, side, special_instructions
  } = req.body;

  if (!client_id) return res.status(400).send("A client is required to start a request.");

  const info = db
    .prepare(
      `INSERT INTO requests
        (request_number, client_id, request_type, purpose, date_from, date_to, time_from, time_to,
         number_of_days, urgency, required_length_meters, parking_spaces, side, special_instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      generateRequestNumber(), client_id, request_type || null, purpose || null,
      date_from || null, date_to || null, time_from || null, time_to || null,
      number_of_days ? parseInt(number_of_days, 10) : null, urgency || "Standard",
      required_length_meters ? parseFloat(required_length_meters) : null,
      parking_spaces ? parseInt(parking_spaces, 10) : null, side || "one", special_instructions || null
    );

  res.redirect(`/admin/requests/${info.lastInsertRowid}?tab=details`);
});

// ---------- Workspace ----------
router.get("/:id", (req, res) => {
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);
  if (!request) return res.status(404).send("Request not found");

  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(request.client_id);
  const clientLocations = db.prepare("SELECT * FROM client_locations WHERE client_id = ? ORDER BY created_at DESC").all(request.client_id);
  const location = request.location_id ? db.prepare("SELECT * FROM client_locations WHERE id = ?").get(request.location_id) : null;
  const inventoryRows = db.prepare("SELECT * FROM request_inventory WHERE request_id = ? ORDER BY id").all(request.id);
  const pricingRows = db.prepare("SELECT * FROM request_pricing WHERE request_id = ? ORDER BY sort_order, id").all(request.id);
  const documents = db.prepare("SELECT * FROM documents WHERE entity_type = 'request' AND entity_id = ? ORDER BY created_at DESC").all(request.id);
  const order = request.order_id ? db.prepare("SELECT * FROM orders WHERE id = ?").get(request.order_id) : null;

  res.render("admin/request-workspace", {
    request,
    clientRow: client,
    clientLocations,
    location,
    inventoryRows,
    pricingRows,
    documents,
    order,
    tab: req.query.tab || "details",
    REQUEST_TYPES,
    URGENCY_OPTIONS,
    KVR_STATUS_OPTIONS,
    ABSICHERUNG_TYPE_OPTIONS,
    MAP_FEE_TIERS,
    TRANSPORT_ZONES,
    DOCUMENT_CATEGORIES,
    DOCUMENT_STATUSES,
    displayRequestId
  });
});

// ---------- Details ----------
router.post("/:id", (req, res) => {
  const {
    request_type, purpose, date_from, date_to, time_from, time_to,
    number_of_days, urgency, required_length_meters, parking_spaces, side, special_instructions
  } = req.body;

  db.prepare(
    `UPDATE requests SET
      request_type = ?, purpose = ?, date_from = ?, date_to = ?, time_from = ?, time_to = ?,
      number_of_days = ?, urgency = ?, required_length_meters = ?, parking_spaces = ?, side = ?,
      special_instructions = ?, status = CASE WHEN status = 'Request Draft' THEN 'Request Complete' ELSE status END,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    request_type || null, purpose || null, date_from || null, date_to || null, time_from || null, time_to || null,
    number_of_days ? parseInt(number_of_days, 10) : null, urgency || "Standard",
    required_length_meters ? parseFloat(required_length_meters) : null,
    parking_spaces ? parseInt(parking_spaces, 10) : null, side || "one", special_instructions || null,
    req.params.id
  );

  res.redirect(`/admin/requests/${req.params.id}?tab=details`);
});

// ---------- Location ----------
router.post("/:id/location", (req, res) => {
  const { location_id, new_street, new_house_number, new_zip, new_city, new_location_type } = req.body;
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);

  let finalLocationId = location_id ? parseInt(location_id, 10) : null;

  if (!finalLocationId && new_street) {
    const info = db
      .prepare(
        `INSERT INTO client_locations (client_id, street, house_number, zip, city, location_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(request.client_id, new_street, new_house_number || null, new_zip || null, new_city || null, new_location_type || null);
    finalLocationId = info.lastInsertRowid;
  }

  db.prepare("UPDATE requests SET location_id = ?, updated_at = datetime('now') WHERE id = ?").run(finalLocationId, req.params.id);
  res.redirect(`/admin/requests/${req.params.id}?tab=location`);
});

// ---------- KVR ----------
router.post("/:id/kvr", (req, res) => {
  const {
    kvr_required, kvr_status, kvr_authority, kvr_permission_number,
    kvr_valid_from, kvr_valid_to, kvr_special_conditions
  } = req.body;

  db.prepare(
    `UPDATE requests SET
      kvr_required = ?, kvr_status = ?, kvr_authority = ?, kvr_permission_number = ?,
      kvr_valid_from = ?, kvr_valid_to = ?, kvr_special_conditions = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    kvr_required ? 1 : 0, kvr_status || "Not Required", kvr_authority || null, kvr_permission_number || null,
    kvr_valid_from || null, kvr_valid_to || null, kvr_special_conditions || null,
    req.params.id
  );

  res.redirect(`/admin/requests/${req.params.id}?tab=kvr`);
});

// ---------- Absicherung ----------
router.post("/:id/absicherung", (req, res) => {
  const {
    absicherung_required, absicherung_type, half_side_closure, full_closure,
    pedestrian_path_affected, cycle_lane_affected, traffic_plan_required,
    parked_vehicle_list_required, safety_notes
  } = req.body;

  db.prepare(
    `UPDATE requests SET
      absicherung_required = ?, absicherung_type = ?, half_side_closure = ?, full_closure = ?,
      pedestrian_path_affected = ?, cycle_lane_affected = ?, traffic_plan_required = ?,
      parked_vehicle_list_required = ?, safety_notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    absicherung_required ? 1 : 0, absicherung_type || null, half_side_closure ? 1 : 0, full_closure ? 1 : 0,
    pedestrian_path_affected ? 1 : 0, cycle_lane_affected ? 1 : 0, traffic_plan_required ? 1 : 0,
    parked_vehicle_list_required ? 1 : 0, safety_notes || null,
    req.params.id
  );

  res.redirect(`/admin/requests/${req.params.id}?tab=absicherung`);
});

// ---------- Inventory ----------
router.post("/:id/inventory/suggest", (req, res) => {
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);

  const suggestions = suggestForRequest({
    requestType: request.request_type,
    lengthMeters: request.required_length_meters || 0,
    side: request.side,
    absicherungRequired: !!request.absicherung_required,
    absicherungType: request.absicherung_type
  });

  const replaceSuggested = db.transaction(() => {
    db.prepare("DELETE FROM request_inventory WHERE request_id = ? AND source = 'suggested'").run(request.id);
    const insert = db.prepare(
      `INSERT INTO request_inventory (request_id, item_name, category, planned_qty, unit, source) VALUES (?, ?, ?, ?, ?, 'suggested')`
    );
    suggestions.forEach((s) => insert.run(request.id, s.item_name, s.category, s.qty, s.unit));
    db.prepare("UPDATE requests SET status = CASE WHEN status IN ('Request Draft','Request Complete') THEN 'Inventory Planned' ELSE status END, updated_at = datetime('now') WHERE id = ?").run(request.id);
  });
  replaceSuggested();

  res.redirect(`/admin/requests/${req.params.id}?tab=inventory`);
});

router.post("/:id/inventory", (req, res) => {
  const { item_name, category, planned_qty, unit, status, notes } = req.body;
  db.prepare(
    `INSERT INTO request_inventory (request_id, item_name, category, planned_qty, unit, status, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
  ).run(req.params.id, item_name, category || null, parseFloat(planned_qty) || 0, unit || "pcs", status || "Available", notes || null);
  res.redirect(`/admin/requests/${req.params.id}?tab=inventory`);
});

router.post("/:id/inventory/:itemId/delete", (req, res) => {
  db.prepare("DELETE FROM request_inventory WHERE id = ? AND request_id = ?").run(req.params.itemId, req.params.id);
  res.redirect(`/admin/requests/${req.params.id}?tab=inventory`);
});

// ---------- Pricing ----------
router.post("/:id/pricing/calculate", (req, res) => {
  const { map_fee_tier, transport_zone } = req.body;

  const runCalc = db.transaction(() => {
    db.prepare("UPDATE requests SET map_fee_tier = ?, transport_zone = ?, updated_at = datetime('now') WHERE id = ?").run(
      map_fee_tier || "none", transport_zone || "within", req.params.id
    );
    const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);
    const inventoryRows = db.prepare("SELECT * FROM request_inventory WHERE request_id = ?").all(request.id);
    const { lines } = calculatePricing(request, inventoryRows);

    db.prepare("DELETE FROM request_pricing WHERE request_id = ? AND source = 'auto'").run(request.id);
    const insert = db.prepare(
      `INSERT INTO request_pricing (request_id, price_item, calculation_type, qty, unit_price, days, net_total, source, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'auto', ?)`
    );
    lines.forEach((l, idx) => insert.run(request.id, l.price_item, l.calculation_type, l.qty, l.unit_price, l.days, l.net_total, idx));

    db.prepare("UPDATE requests SET status = CASE WHEN status != 'Auftrag Created' THEN 'Price Calculated' ELSE status END WHERE id = ?").run(request.id);
    recomputeTotals(request);
  });
  runCalc();

  res.redirect(`/admin/requests/${req.params.id}?tab=pricing`);
});

router.post("/:id/pricing", (req, res) => {
  const { price_item, calculation_type, qty, unit_price, days, net_total } = req.body;
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);

  const addLine = db.transaction(() => {
    db.prepare(
      `INSERT INTO request_pricing (request_id, price_item, calculation_type, qty, unit_price, days, net_total, source, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 999)`
    ).run(request.id, price_item, calculation_type || "Manual", parseFloat(qty) || 1, parseFloat(unit_price) || 0, days ? parseFloat(days) : null, parseFloat(net_total));
    recomputeTotals(request);
  });
  addLine();

  res.redirect(`/admin/requests/${req.params.id}?tab=pricing`);
});

router.post("/:id/pricing/:lineId/delete", (req, res) => {
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);
  const removeLine = db.transaction(() => {
    db.prepare("DELETE FROM request_pricing WHERE id = ? AND request_id = ?").run(req.params.lineId, req.params.id);
    recomputeTotals(request);
  });
  removeLine();
  res.redirect(`/admin/requests/${req.params.id}?tab=pricing`);
});

// ---------- Create Auftrag ----------
router.post("/:id/create-auftrag", (req, res) => {
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);
  if (!request) return res.status(404).send("Request not found");
  if (request.order_id) return res.redirect(`/admin/orders/${request.order_id}`);

  const location = request.location_id ? db.prepare("SELECT * FROM client_locations WHERE id = ?").get(request.location_id) : null;
  const siteAddress = location
    ? `${location.street}${location.house_number ? " " + location.house_number : ""}, ${location.zip || ""} ${location.city || ""}`.trim()
    : null;

  const createAuftrag = db.transaction(() => {
    const orderInfo = db
      .prepare(
        `INSERT INTO orders (order_number, client_id, status, source, site_address, needed_by, notes, total, request_id, location_id)
         VALUES (?, ?, 'confirmed', 'email', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        generateOrderNumber(), request.client_id, siteAddress, request.date_to || null,
        request.special_instructions || null, request.total_gross || 0, request.id, request.location_id
      );

    db.prepare("UPDATE requests SET status = 'Auftrag Created', order_id = ?, updated_at = datetime('now') WHERE id = ?").run(
      orderInfo.lastInsertRowid, request.id
    );

    return orderInfo.lastInsertRowid;
  });

  const orderId = createAuftrag();
  res.redirect(`/admin/orders/${orderId}`);
});

module.exports = router;
