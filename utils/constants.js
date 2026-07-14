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

// ---------- Main Admin / Driver workflow ----------

const MAIN_ADMIN_STATUSES = [
  "Received from Office Admin",
  "Pending Main Admin Review",
  "Returned to Office Admin",
  "Approved for Operation",
  "Inventory Review",
  "Inventory Approved",
  "Ready for Driver Assignment",
  "Driver Assigned",
  "Sent to Driver",
  "Accepted by Driver",
  "Driver Loading",
  "On Route",
  "Arrived on Site",
  "In Progress",
  "Driver Completed",
  "Waiting Main Admin Review",
  "Returned to Driver",
  "Completion Approved",
  "Completed",
  "Sent Back to Office Admin",
  "Archived",
  "Cancelled"
];

const RETURN_REASONS = [
  "KVR missing",
  "Map unclear",
  "Inventory plan wrong",
  "Date/time conflict",
  "Location incomplete",
  "Absicherung unclear",
  "Documents missing",
  "Price issue",
  "Other"
];

const INVENTORY_APPROVAL_STATUSES = [
  "Pending Review",
  "Edited by Main Admin",
  "Approved for Warehouse",
  "Needs Warehouse Check",
  "Low Stock Warning",
  "Not Available",
  "Substitute Required",
  "Ready for Driver Loading"
];

const DRIVER_STATUS_OPTIONS = [
  "Available",
  "Assigned",
  "On Work",
  "Loading",
  "Unloading",
  "On Break",
  "Sick Leave",
  "Absent",
  "Completed"
];

const DRIVER_APP_STATUS_OPTIONS = [
  "Not Sent",
  "Sent to Driver",
  "Accepted",
  "Loading",
  "On Route",
  "Arrived",
  "In Progress",
  "Blocked",
  "Setup Completed",
  "Removal Completed",
  "Submitted for Review"
];

const MAP_STATUS_OPTIONS = [
  "Map Needed",
  "Map Received",
  "Map Edited",
  "Map Approved",
  "Sent to Driver",
  "Driver Updated Map",
  "Needs Correction",
  "Final Map Approved"
];

const COMPLETION_STATUS_OPTIONS = [
  "Waiting for Driver Submission",
  "Submitted by Driver",
  "Photos Missing",
  "Inventory Report Missing",
  "Map Update Missing",
  "Needs Driver Correction",
  "Ready for Main Admin Review",
  "Approved by Main Admin",
  "Rejected / Returned to Driver"
];

const PRIORITY_OPTIONS = ["Normal", "High", "Urgent"];

module.exports = {
  REQUEST_TYPES,
  URGENCY_OPTIONS,
  KVR_STATUS_OPTIONS,
  ABSICHERUNG_TYPE_OPTIONS,
  MAP_FEE_TIERS,
  TRANSPORT_ZONES,
  REQUEST_STATUSES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  MAIN_ADMIN_STATUSES,
  RETURN_REASONS,
  INVENTORY_APPROVAL_STATUSES,
  DRIVER_STATUS_OPTIONS,
  DRIVER_APP_STATUS_OPTIONS,
  MAP_STATUS_OPTIONS,
  COMPLETION_STATUS_OPTIONS,
  PRIORITY_OPTIONS
};
