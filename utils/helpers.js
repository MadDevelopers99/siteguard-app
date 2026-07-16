function generateOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SG-${y}${m}${d}-${rand}`;
}

function generateRequestNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `REQ-${y}${m}${d}-${rand}`;
}

// Generic version of generateOrderNumber/generateRequestNumber's pattern, used
// for the Inventory/Purchase modules' PO/GR/BATCH/SG-SALE numbers.
function generateNumber(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

function formatEUR(amount) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(amount || 0);
}

// Buckets the many status strings used across the Main Admin / Driver workflow
// into the 5 badge colors already defined in public/css/style.css, rather than
// adding a new CSS class per status. Order matters — checked top to bottom.
const STATUS_BADGE_RULES = [
  [/cancel|problem|blocked|missing|reject|damaged|not available/i, "cancelled"],
  [/approv|ready|complet|ok\b|deliver|avail|active/i, "delivered"],
  [/review|pending|needs|waiting|hold|check/i, "pending"],
  [/progress|loading|unload|route|arriv|setup|removal|work/i, "dispatched"],
  [/new|sent|assign|receiv|accept/i, "confirmed"]
];

function statusBadgeClass(status) {
  const s = String(status || "");
  for (const [pattern, cssClass] of STATUS_BADGE_RULES) {
    if (pattern.test(s)) return cssClass;
  }
  return "pending";
}

module.exports = { generateOrderNumber, generateRequestNumber, generateNumber, formatEUR, statusBadgeClass };
