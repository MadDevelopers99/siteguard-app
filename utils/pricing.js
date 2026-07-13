const BASE_FEE_BY_TYPE = {
  Halteverbot: 100,
  Absicherung: 250,
  Kran: 150,
  Containerstellung: 150
};

const ABSICHERUNG_FEE_BY_TYPE = {
  "Simple safety setup": 100,
  "Half-side road closure": 400,
  "Full road closure": 550,
  "Traffic safety plan": 250,
  "Transport support": 350
};

const MAP_FEE_BY_TIER = {
  none: 0,
  basic: 50,
  sign_points: 100,
  polygon: 150
};

const TRANSPORT_FEE_BY_ZONE = {
  within: 50,
  outside: 80
};

const URGENCY_FEE = {
  Standard: 0,
  "48h": 75,
  "Same-day": 150,
  Weekend: 250
};

const SIGN_PRICE_PER_DAY = 5;

function calculatePricing(request, inventoryRows) {
  const lines = [];
  const days = request.number_of_days || 1;

  const baseFee = BASE_FEE_BY_TYPE[request.request_type] || 100;
  lines.push({ price_item: "Base service fee", calculation_type: "Fixed", qty: 1, unit_price: baseFee, days: null, net_total: baseFee });

  const signRow = inventoryRows.find((r) => r.item_name === "Halteverbot signs");
  if (signRow && signRow.planned_qty > 0) {
    const net = signRow.planned_qty * SIGN_PRICE_PER_DAY * days;
    lines.push({
      price_item: "Halteverbot signs",
      calculation_type: "Per sign/day",
      qty: signRow.planned_qty,
      unit_price: SIGN_PRICE_PER_DAY,
      days,
      net_total: net
    });
  }

  if (request.kvr_required) {
    lines.push({ price_item: "KVR service fee", calculation_type: "Fixed", qty: 1, unit_price: 80, days: null, net_total: 80 });
  }

  if (request.absicherung_required) {
    const fee = ABSICHERUNG_FEE_BY_TYPE[request.absicherung_type] || ABSICHERUNG_FEE_BY_TYPE["Simple safety setup"];
    lines.push({ price_item: `Absicherung: ${request.absicherung_type || "Simple safety setup"}`, calculation_type: "Fixed", qty: 1, unit_price: fee, days: null, net_total: fee });
  }

  const mapFee = MAP_FEE_BY_TIER[request.map_fee_tier] ?? 0;
  if (mapFee > 0) {
    lines.push({ price_item: "Map preparation", calculation_type: "Fixed", qty: 1, unit_price: mapFee, days: null, net_total: mapFee });
  }

  const transportFee = TRANSPORT_FEE_BY_ZONE[request.transport_zone] ?? TRANSPORT_FEE_BY_ZONE.within;
  lines.push({ price_item: "Transport fee", calculation_type: "Fixed", qty: 1, unit_price: transportFee, days: null, net_total: transportFee });

  const urgencyFee = URGENCY_FEE[request.urgency] ?? 0;
  if (urgencyFee > 0) {
    lines.push({ price_item: `Urgency fee (${request.urgency})`, calculation_type: "Fixed", qty: 1, unit_price: urgencyFee, days: null, net_total: urgencyFee });
  }

  const subtotalNet = lines.reduce((sum, l) => sum + l.net_total, 0);
  const vatRate = request.vat_rate || 19;
  const vatAmount = Math.round(subtotalNet * (vatRate / 100) * 100) / 100;
  const totalGross = Math.round((subtotalNet + vatAmount) * 100) / 100;

  return { lines, subtotalNet, vatAmount, totalGross, vatRate };
}

module.exports = {
  calculatePricing,
  BASE_FEE_BY_TYPE,
  ABSICHERUNG_FEE_BY_TYPE,
  MAP_FEE_BY_TIER,
  TRANSPORT_FEE_BY_ZONE,
  URGENCY_FEE
};
