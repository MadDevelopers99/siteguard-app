const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { generateRequestNumber } = require("../utils/helpers");
const { calculatePrice, ZONE_LENGTH_OPTIONS, REASON_OPTIONS } = require("../utils/price-calculator");

const RAVIAN_MATRIX = {
  name: "Ravian Matrix",
  tagline: "Traffic Services",
  phone: "089 / 123 456 78",
  hours: "Mon–Fri 07:00–18:00"
};

router.get("/", (req, res) => {
  res.render("price-calculator", { company: RAVIAN_MATRIX, ZONE_LENGTH_OPTIONS, REASON_OPTIONS });
});

function parseCalcInput(body) {
  const isCustomLength = body.zone_length === "Custom length";
  const zoneLength = isCustomLength ? null : parseFloat(body.zone_length);
  return {
    zoneLength,
    isCustomLength,
    bothSides: body.both_sides === "1" || body.both_sides === "true",
    dateFrom: body.start_date,
    dateTo: body.end_date
  };
}

router.post("/calculate", (req, res) => {
  const result = calculatePrice(parseCalcInput(req.body));
  res.json(result);
});

router.post("/submit", (req, res) => {
  try {
    const {
      city, postal_code, street, house_number,
      start_date, end_date, start_time, end_time,
      zone_length, reason, both_sides,
      name, phone, email, notes
    } = req.body;

    if (!city || !postal_code || !street || !house_number || !start_date || !end_date || !name || !phone || !email) {
      return res.status(400).json({ ok: false, error: "Please fill in all required fields." });
    }

    const priceResult = calculatePrice(parseCalcInput(req.body));
    const bothSides = both_sides === "1" || both_sides === "true";

    const create = db.transaction(() => {
      let client = db.prepare("SELECT * FROM clients WHERE email = ?").get(email);
      if (!client) {
        const info = db
          .prepare(
            `INSERT INTO clients (name, email, phone, city, source)
             VALUES (?, ?, ?, ?, 'website')`
          )
          .run(name, email, phone, city);
        client = { id: info.lastInsertRowid };
      }

      const locationInfo = db
        .prepare(
          `INSERT INTO client_locations (client_id, street, house_number, zip, city, location_type, side_of_street, map_status)
           VALUES (?, ?, ?, ?, ?, 'Halteverbot', ?, 'needed')`
        )
        .run(client.id, street, house_number, postal_code, city, bothSides ? "both" : "one");

      const requestNumber = generateRequestNumber();
      const requestInfo = db
        .prepare(
          `INSERT INTO requests (
            request_number, client_id, location_id, status, request_type, purpose,
            date_from, date_to, time_from, time_to, number_of_days,
            required_length_meters, side, special_instructions,
            subtotal_net, vat_rate, vat_amount, total_gross
           ) VALUES (?, ?, ?, ?, 'Halteverbot', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 19, ?, ?)`
        )
        .run(
          requestNumber,
          client.id,
          locationInfo.lastInsertRowid,
          priceResult.manualReview ? "Request Draft" : "Request Complete",
          reason || null,
          start_date,
          end_date,
          start_time || "07:00",
          end_time || "17:00",
          priceResult.numberOfDays || null,
          priceResult.manualReview ? null : zone_length,
          bothSides ? "both" : "one",
          [
            priceResult.manualReview ? `Custom zone length requested: ${zone_length}. Needs manual review.` : null,
            notes || null
          ].filter(Boolean).join(" — ") || null,
          priceResult.manualReview ? 0 : priceResult.subtotalNet,
          priceResult.manualReview ? 0 : priceResult.vatAmount,
          priceResult.manualReview ? 0 : priceResult.totalGross
        );

      const requestId = requestInfo.lastInsertRowid;

      if (!priceResult.manualReview) {
        const insertPricing = db.prepare(
          `INSERT INTO request_pricing (request_id, price_item, calculation_type, qty, unit_price, days, net_total, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'auto')`
        );
        const baseNet = Math.round((priceResult.baseServiceFee / 1.19) * 100) / 100;
        const signNet = Math.round((priceResult.subtotalNet - baseNet) * 100) / 100;
        insertPricing.run(requestId, "Base service fee", "Fixed", 1, baseNet, null, baseNet);
        insertPricing.run(
          requestId,
          "Halteverbot signs",
          "Per sign/day",
          priceResult.numberOfSigns,
          priceResult.signRate,
          priceResult.numberOfDays,
          signNet
        );
      }

      return { requestNumber, requestId };
    });

    const result = create();
    res.json({ ok: true, requestNumber: result.requestNumber, manualReview: priceResult.manualReview });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Something went wrong submitting your request." });
  }
});

module.exports = router;
