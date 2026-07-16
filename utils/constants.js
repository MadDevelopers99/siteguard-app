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
  "Available Later",
  "Assigned",
  "On Work",
  "Loading",
  "Unloading",
  "On Break",
  "Completed",
  "Sick Leave",
  "Absent",
  "Vacation",
  "Not Available",
  "Inactive"
];

const DRIVER_APP_STATUS_OPTIONS = [
  "Not Sent",
  "Sent to Driver",
  "Accepted",
  "Rejected",
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

// ---------- Standalone Driver / Team Management ----------

const DRIVER_ROLES = [
  "Driver",
  "Bifahrer",
  "Team Lead",
  "Warehouse Helper",
  "Temporary Driver",
  "Student Helper",
  "Freelancer"
];

const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Minijob",
  "Student",
  "Freelancer",
  "Temporary",
  "Subcontractor"
];

const VEHICLE_TYPES = ["Transporter", "Van", "Truck", "Car", "Trailer", "Other"];

const VEHICLE_STATUSES = [
  "Available",
  "Assigned",
  "On Work",
  "In Service",
  "Damaged",
  "Unavailable",
  "Reserved",
  "Inactive"
];

const TEAM_STATUSES = ["Planned", "Active", "Completed", "Cancelled", "Changed"];

const VACATION_TYPES = ["Annual Leave", "Unpaid Leave", "Family Leave", "Personal Leave", "Other"];

const VACATION_STATUSES = ["Planned", "Pending Approval", "Approved", "Rejected", "Cancelled", "Completed"];

const ABSENCE_TYPES = ["Sick Leave", "Absent", "Emergency Leave", "No Show", "Late Arrival", "Early Leave"];

const ABSENCE_STATUSES = [
  "Active",
  "Resolved",
  "Pending Document",
  "Unexcused",
  "Approved",
  "Rejected",
  "Closed"
];

const DRIVER_NOTE_TYPES = [
  "General Note",
  "Performance Note",
  "Availability Note",
  "Vehicle Note",
  "Behavior Note",
  "Document Note",
  "Warning Note",
  "Positive Feedback"
];

const WORK_AREAS = ["Munich North", "Munich South", "Munich East", "Munich West", "Munich Center", "Other"];

// ---------- Main Inventory ----------

const INVENTORY_ITEM_STATUSES = ["Available", "Low Stock", "Out of Stock", "Inactive"];

const STOCK_IN_SOURCE_TYPES = [
  "Purchase",
  "Return from Auftrag",
  "Return from Driver",
  "Internal Sale to SG",
  "Stock Count Correction",
  "Other"
];

const STOCK_OUT_REASON_TYPES = [
  "Issued to Auftrag",
  "Given to Driver",
  "Internal Transfer",
  "Damaged Removal",
  "Missing Item",
  "Disposal",
  "External Sale",
  "Other"
];

const STOCK_ADJUSTMENT_REASONS = [
  "Stock Count Correction",
  "Wrong Entry",
  "System Correction",
  "Damaged Correction",
  "Missing Correction",
  "Return Correction",
  "Other"
];

const DAMAGED_MISSING_TYPES = ["Damaged", "Missing", "Lost", "Broken", "Stolen", "Disposed"];

const DAMAGED_MISSING_STATUSES = [
  "Open",
  "Under Review",
  "Approved",
  "Rejected",
  "Repaired",
  "Replaced",
  "Written Off",
  "Closed"
];

const STOCK_COUNT_STATUSES = ["In Progress", "Pending Approval", "Approved", "Closed"];

// ---------- Purchase & Sell-to-SG ----------

const SUPPLIER_STATUSES = ["Active", "Inactive"];

const SUPPLIER_CATEGORIES = ["Signs & Signage", "Barriers & Fencing", "Lighting", "General Materials", "Other"];

const PO_STATUSES = [
  "Draft",
  "Ordered",
  "Partially Received",
  "Received",
  "Invoice Received",
  "Paid",
  "Cancelled",
  "Closed"
];

const WHOLESALE_BATCH_STATUSES = [
  "Available",
  "Partially Sold to SG",
  "Sold to SG",
  "Reserved",
  "Damaged",
  "Closed"
];

const INTERNAL_SALE_STATUSES = [
  "Draft",
  "Ready for Approval",
  "Approved",
  "Sent to SG",
  "Received by SG",
  "Completed",
  "Cancelled"
];

const PRICE_RULE_METHODS = [
  "Fixed markup %",
  "Fixed margin %",
  "Fixed internal SG price",
  "Cost + handling fee",
  "Manual price",
  "Item-category-based price"
];

const PRICE_RULE_STATUSES = ["Active", "Inactive"];

// ---------- Driver Tablet App ----------

const TASK_TYPE_OPTIONS = [
  "Setup / Deployment",
  "Removal / Pickup",
  "Setup + Removal",
  "Inspection Only",
  "Correction Work",
  "Material Delivery",
  "Material Pickup",
  "Empty Car Pickup",
  "Return to SG",
  "Other"
];

const INVENTORY_MODE_OPTIONS = [
  "Loading Required",
  "No Loading Required",
  "Pickup Required",
  "Return Material Required",
  "Exchange Material",
  "Inventory Not Required",
  "Inventory Check Only"
];

const REJECT_REASON_OPTIONS = [
  "Sick",
  "Not available",
  "Vehicle problem",
  "Too far",
  "Already assigned",
  "Material problem",
  "Other"
];

const ISSUE_TYPE_OPTIONS = [
  "Parked cars blocking area",
  "Material missing",
  "Material damaged",
  "Wrong location",
  "Map unclear",
  "KVR problem",
  "Police / authority issue",
  "Customer not reachable",
  "Street access blocked",
  "Vehicle problem",
  "Weather problem",
  "Accident / damage",
  "Other"
];

const PHOTO_CATEGORY_OPTIONS = [
  "Final Setup Photos",
  "Street Overview",
  "Sign Placement Proof",
  "Barricade / Absicherung Proof",
  "Parked Cars Proof",
  "Pickup / Removal Proof",
  "Damage Proof",
  "Returned Material Proof",
  "Other"
];

const DIGITIZATION_OBJECT_TYPES = [
  "Pole",
  "Halteverbot Sign",
  "Base Plate / Standsockel",
  "Clamp",
  "Warning Light",
  "Bakenleuchte",
  "Traffic Sign",
  "Single Barrier",
  "Parked Car Marker",
  "Other"
];

const SG_COMPANY = {
  name: "SiteGuard GmbH",
  address: "Industriestrasse 12, 80339 München, Germany",
  phone: "+49 89 1234567"
};

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
  PRIORITY_OPTIONS,
  DRIVER_ROLES,
  EMPLOYMENT_TYPES,
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  TEAM_STATUSES,
  VACATION_TYPES,
  VACATION_STATUSES,
  ABSENCE_TYPES,
  ABSENCE_STATUSES,
  DRIVER_NOTE_TYPES,
  WORK_AREAS,
  INVENTORY_ITEM_STATUSES,
  STOCK_IN_SOURCE_TYPES,
  STOCK_OUT_REASON_TYPES,
  STOCK_ADJUSTMENT_REASONS,
  DAMAGED_MISSING_TYPES,
  DAMAGED_MISSING_STATUSES,
  STOCK_COUNT_STATUSES,
  SUPPLIER_STATUSES,
  SUPPLIER_CATEGORIES,
  PO_STATUSES,
  WHOLESALE_BATCH_STATUSES,
  INTERNAL_SALE_STATUSES,
  PRICE_RULE_METHODS,
  PRICE_RULE_STATUSES,
  TASK_TYPE_OPTIONS,
  INVENTORY_MODE_OPTIONS,
  REJECT_REASON_OPTIONS,
  ISSUE_TYPE_OPTIONS,
  PHOTO_CATEGORY_OPTIONS,
  DIGITIZATION_OBJECT_TYPES,
  SG_COMPANY
};
