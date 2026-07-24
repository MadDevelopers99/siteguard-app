const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { generateRequestNumber } = require("../utils/helpers");
const { calculatePrice, ZONE_LENGTH_OPTIONS, REASON_OPTIONS } = require("../utils/price-calculator");

const SITE_GUARD = {
  name: "Site Guard",
  tagline: "Traffic Services",
  phone: "+49 30 1234 5678",
  hours: "Mon–Fri 07:00–18:00"
};

router.get("/", (req, res) => {
  res.render("price-calculator", { company: SITE_GUARD, ZONE_LENGTH_OPTIONS, REASON_OPTIONS });
});

function parseCalcInput(addr) {
  const isCustomLength = addr.zone_length === "Custom length";
  const zoneLength = isCustomLength ? null : parseFloat(addr.zone_length);
  return {
    zoneLength,
    isCustomLength,
    bothSides: addr.both_sides === "1" || addr.both_sides === "true",
    dateFrom: addr.start_date,
    dateTo: addr.end_date
  };
}

// Normalizes either an `addresses[]` array (the calculator always sends this,
// even for a single address block) or, defensively, a bare single-address body.
function normalizeAddresses(body) {
  if (Array.isArray(body.addresses)) return body.addresses;
  if (body.addresses && typeof body.addresses === "object") return Object.values(body.addresses);
  return [body];
}

router.post("/calculate", (req, res) => {
  const addresses = normalizeAddresses(req.body);
  const results = addresses.map((addr) => calculatePrice(parseCalcInput(addr)));

  const anyManualReview = results.some((r) => r.manualReview);
  const combined = results.reduce(
    (acc, r) => {
      if (r.manualReview) return acc;
      acc.totalGross += r.totalGross;
      acc.vatAmount += r.vatAmount;
      acc.grandTotal += r.grandTotal;
      return acc;
    },
    { totalGross: 0, vatAmount: 0, grandTotal: 0 }
  );
  combined.totalGross = Math.round(combined.totalGross * 100) / 100;
  combined.vatAmount = Math.round(combined.vatAmount * 100) / 100;
  combined.grandTotal = Math.round(combined.grandTotal * 100) / 100;

  res.json({ manualReview: anyManualReview, results, combined });
});

router.post("/submit", (req, res) => {
  try {
    const {
      vorname, nachname, phone, email, client_mode,
      client_type, company, country, street, house_number, zip, city,
      payment_method, notes, map_marking
    } = req.body;

    if (!vorname || !nachname || !phone || !email) {
      return res.status(400).json({ ok: false, error: "Please fill in all required contact fields." });
    }

    const addresses = normalizeAddresses(req.body).filter((a) => a && (a.city || a.from_street));
    if (addresses.length === 0) {
      return res.status(400).json({ ok: false, error: "Please add at least one address." });
    }
    for (const addr of addresses) {
      if (!addr.city || !addr.postal_code || !addr.from_street || !addr.from_house_number || !addr.start_date || !addr.end_date) {
        return res.status(400).json({ ok: false, error: "Please fill in all required fields for each address." });
      }
    }

    const priceResults = addresses.map((addr) => calculatePrice(parseCalcInput(addr)));
    const name = `${vorname} ${nachname}`.trim();

    const create = db.transaction(() => {
      let client = db.prepare("SELECT * FROM clients WHERE email = ?").get(email);
      if (!client) {
        const info = db
          .prepare(
            `INSERT INTO clients (name, company, email, phone, city, client_type, country, street, house_number, zip, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'website')`
          )
          .run(
            name,
            company || null,
            email,
            phone,
            city || null,
            client_type || null,
            country || "Germany",
            street || null,
            house_number || null,
            zip || null
          );
        client = { id: info.lastInsertRowid };
      }

      const requestNumbers = [];

      addresses.forEach((addr, idx) => {
        const priceResult = priceResults[idx];
        const bothSides = addr.both_sides === "1" || addr.both_sides === "true";

        const locationInfo = db
          .prepare(
            `INSERT INTO client_locations (client_id, street, house_number, till_street, till_house_number, zip, city, location_type, side_of_street, map_status, map_pin)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Halteverbot', ?, 'needed', ?)`
          )
          .run(
            client.id,
            addr.from_street,
            addr.from_house_number,
            addr.till_street || null,
            addr.till_house_number || null,
            addr.postal_code,
            addr.city,
            bothSides ? "both" : "one",
            idx === 0 && map_marking ? map_marking : null
          );

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
            addr.reason || null,
            addr.start_date,
            addr.end_date,
            addr.start_time || "07:00",
            addr.end_time || "17:00",
            priceResult.numberOfDays || null,
            priceResult.manualReview ? null : addr.zone_length,
            bothSides ? "both" : "one",
            [
              priceResult.manualReview ? `Custom zone length requested: ${addr.zone_length}. Needs manual review.` : null,
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

        requestNumbers.push(requestNumber);
      });

      return { requestNumbers };
    });

    const result = create();
    res.json({
      ok: true,
      requestNumbers: result.requestNumbers,
      manualReview: priceResults.some((r) => r.manualReview)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Something went wrong submitting your request." });
  }
});

module.exports = router;
