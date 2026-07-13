// Shared dropdown option lists used across the client/request admin views.

const REQUEST_TYPES = [
  "Halteverbot",
  "Absicherung",
  "Baustelle",
  "Containerstellung",
  "Kran",
  "Umzug",
  "Lieferung",
  "Sanierung",
  "Transport Support",
  "Other"
];

const URGENCY_OPTIONS = ["Standard", "48h", "Same-day", "Weekend"];

const KVR_STATUS_OPTIONS = [
  "Not Required",
  "Required",
  "Pending",
  "Approved",
  "Rejected",
  "Needs Resubmission",
  "Expired"
];

const ABSICHERUNG_TYPE_OPTIONS = [
  "Halteverbot only",
  "Half-side road closure",
  "Full road closure",
  "Transport support",
  "Container placement",
  "Crane work",
  "Construction site safety",
  "Pedestrian route protection",
  "Other"
];

const MAP_FEE_TIERS = [
  { value: "none", label: "Map upload only (€0)" },
  { value: "basic", label: "Basic map preparation (€50)" },
  { value: "sign_points", label: "Map with sign points (€100)" },
  { value: "polygon", label: "Map with point/line/polygon (€150)" }
];

const TRANSPORT_ZONES = [
  { value: "within", label: "Within city (€50)" },
  { value: "outside", label: "Outside city (€80)" }
];

const REQUEST_STATUSES = [
  "Request Draft",
  "Request Complete",
  "Inventory Planned",
  "Price Calculated",
  "Ready to Create Auftrag",
  "Auftrag Created"
];

const DOCUMENT_CATEGORIES = [
  "Client Email",
  "Offer / Angebot",
  "KVR Permission",
  "Absicherung",
  "Map",
  "Sketch",
  "Photos",
  "Price Calculation",
  "Lieferschein Draft",
  "Other"
];

const DOCUMENT_STATUSES = ["Uploaded", "Ready", "Needs Review", "Missing", "Rejected", "Replaced", "Approved"];

module.exports = {
  REQUEST_TYPES,
  URGENCY_OPTIONS,
  KVR_STATUS_OPTIONS,
  ABSICHERUNG_TYPE_OPTIONS,
  MAP_FEE_TIERS,
  TRANSPORT_ZONES,
  REQUEST_STATUSES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES
};
