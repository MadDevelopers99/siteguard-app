// Public "No-Parking Zone" price calculator — a separate, simpler fixed-formula
// estimator for the marketing site, distinct from the internal Office Admin
// pricing engine (utils/pricing.js) which prices a fully-built Auftrag with
// KVR/Absicherung/map/transport/urgency fees. This one matches the PDF spec's
// own fixed formula exactly: Base Service Fee + (Signs x Sign Rate x Days).

const BASE_SERVICE_FEE = 90;
const SIGN_RATE = 5;
const VAT_RATE = 19;

const ZONE_LENGTH_OPTIONS = ["10 meters", "15 meters", "20 meters", "25 meters", "30 meters", "40 meters", "50 meters", "Custom length"];

const REASON_OPTIONS = [
  "Private move",
  "Company move",
  "Furniture delivery",
  "Construction site",
  "Container placement",
  "Crane work",
  "Event",
  "Clearance / removal",
  "Bulky waste disposal",
  "Tree work",
  "Other"
];

function signsForZoneLength(meters) {
  if (meters <= 15) return 2;
  if (meters <= 25) return 4;
  if (meters <= 40) return 6;
  if (meters <= 50) return 8;
  return null; // manual review
}

// Inclusive day count, e.g. 21.07.2026 -> 30.07.2026 = 10 days.
function numberOfDays(dateFrom, dateTo) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const days = Math.round((to - from) / 86400000) + 1;
  return days > 0 ? days : null;
}

// zoneLength: numeric meters, or null when isCustomLength is true.
function calculatePrice({ zoneLength, isCustomLength, bothSides, dateFrom, dateTo }) {
  const days = numberOfDays(dateFrom, dateTo);
  if (!days) return { error: "Please enter a valid start and end date." };

  let signs = isCustomLength ? null : signsForZoneLength(parseFloat(zoneLength));
  if (signs === null) return { manualReview: true, numberOfDays: days };

  if (bothSides) signs *= 2;

  const signCost = signs * SIGN_RATE * days;
  const totalGross = Math.round((BASE_SERVICE_FEE + signCost) * 100) / 100;
  const subtotalNet = Math.round((totalGross / (1 + VAT_RATE / 100)) * 100) / 100;
  const vatAmount = Math.round((totalGross - subtotalNet) * 100) / 100;
  // Display-only figure for the public calculator's "Estimated Total + VAT = Total"
  // breakdown line requested by the client. Internal bookkeeping (subtotal_net/
  // vat_amount/total_gross stored on the Request) keeps the standard net+VAT=gross
  // convention above and is unaffected by this field.
  const grandTotal = Math.round((totalGross + vatAmount) * 100) / 100;

  return {
    manualReview: false,
    numberOfSigns: signs,
    numberOfDays: days,
    baseServiceFee: BASE_SERVICE_FEE,
    signRate: SIGN_RATE,
    signCost,
    subtotalNet,
    vatAmount,
    totalGross,
    grandTotal
  };
}

module.exports = { calculatePrice, signsForZoneLength, numberOfDays, BASE_SERVICE_FEE, SIGN_RATE, VAT_RATE, ZONE_LENGTH_OPTIONS, REASON_OPTIONS };
