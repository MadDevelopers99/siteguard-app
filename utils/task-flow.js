// Task Flow Matrix (Driver Tablet App PDF §10) + Inventory Report Rules (§25).
// One lookup used everywhere to decide which Task Detail tabs render and what
// the Submit Completion checklist requires — avoids duplicating this logic
// between routes/driver-tasks.js and the views.

// true = always required, false = never shown/required, "maybe" = depends on
// inventory_mode, "optional" = tab shown but not required for submission.
const TASK_TYPE_FLAGS = {
  "Setup / Deployment": { loading: true, pickup: false, photos: true, digitization: true },
  "Removal / Pickup": { loading: false, pickup: true, photos: true, digitization: "optional" },
  "Setup + Removal": { loading: true, pickup: true, photos: true, digitization: true },
  "Inspection Only": { loading: false, pickup: false, photos: "optional", digitization: false },
  "Correction Work": { loading: "maybe", pickup: "maybe", photos: true, digitization: "maybe" },
  "Material Delivery": { loading: true, pickup: false, photos: "optional", digitization: false },
  "Material Pickup": { loading: false, pickup: true, photos: "optional", digitization: false },
  "Empty Car Pickup": { loading: false, pickup: true, photos: "optional", digitization: false },
  "Return to SG": { loading: false, pickup: false, photos: false, digitization: false },
  Other: { loading: false, pickup: false, photos: "optional", digitization: "optional" }
};

const LOADING_MODES = new Set(["Loading Required"]);
const PICKUP_MODES = new Set(["Pickup Required", "Return Material Required", "Exchange Material"]);

// Inventory Mode -> report shape (§25).
const INVENTORY_REPORT_TYPES = {
  "Loading Required": "used_returned_damaged_missing",
  "Pickup Required": "picked_damaged_missing",
  "Return Material Required": "returned_damaged_missing",
  "Exchange Material": "used_returned_exchanged_damaged",
  "Inventory Not Required": null,
  "Inventory Check Only": "checked_issue_note"
};

function taskFlags(taskType, inventoryMode) {
  const flags = TASK_TYPE_FLAGS[taskType] || TASK_TYPE_FLAGS.Other;

  const requiresLoading = flags.loading === true || (flags.loading === "maybe" && LOADING_MODES.has(inventoryMode));
  const requiresPickup = flags.pickup === true || (flags.pickup === "maybe" && PICKUP_MODES.has(inventoryMode));
  const showPhotos = flags.photos !== false;
  const requiresPhotos = flags.photos === true;
  const showDigitization = flags.digitization !== false;
  const requiresDigitization = flags.digitization === true;

  const inventoryReportType = INVENTORY_REPORT_TYPES[inventoryMode] ?? null;
  const requiresInventoryReport = inventoryMode !== "Inventory Not Required";

  return {
    requiresLoading,
    requiresPickup,
    showPhotos,
    requiresPhotos,
    showDigitization,
    requiresDigitization,
    requiresInventoryReport,
    inventoryReportType
  };
}

module.exports = { taskFlags, TASK_TYPE_FLAGS, INVENTORY_REPORT_TYPES };
