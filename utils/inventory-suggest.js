// Starting-point inventory suggestions. The admin can add/edit/remove lines
// afterward on the request's Inventory tab — this is a suggestion, not a hard rule.

const ABSICHERUNG_PRESETS = {
  "Half-side road closure": [
    ["Absperrschranken", "Barriers", 20],
    ["Baken LED", "Baken", 12],
    ["Baken unbeleuchtet", "Baken", 10],
    ["Warning lights", "Warning Lights", 10],
    ["Z 123 Arbeitsstelle", "Traffic Signs", 2],
    ["Z 531-10 Einengungstafel", "Traffic Signs", 1],
    ["Standsockel", "Base Plates", 36],
    ["Cones", "Cones", 10]
  ],
  "Full road closure": [
    ["Absperrschranken", "Barriers", 32],
    ["Baken LED", "Baken", 20],
    ["Baken unbeleuchtet", "Baken", 16],
    ["Warning lights", "Warning Lights", 16],
    ["Z 123 Arbeitsstelle", "Traffic Signs", 4],
    ["Z 531-10 Einengungstafel", "Traffic Signs", 2],
    ["Standsockel", "Base Plates", 56],
    ["Cones", "Cones", 16]
  ],
  "Simple safety setup": [
    ["Absperrschranken", "Barriers", 8],
    ["Baken LED", "Baken", 4],
    ["Warning lights", "Warning Lights", 4],
    ["Cones", "Cones", 6]
  ],
  "Halteverbot only": [
    ["Cones", "Cones", 4]
  ],
  "Transport support": [
    ["Absperrschranken", "Barriers", 6],
    ["Cones", "Cones", 8]
  ],
  "Construction site safety": [
    ["Absperrschranken", "Barriers", 16],
    ["Baken LED", "Baken", 8],
    ["Warning lights", "Warning Lights", 8],
    ["Cones", "Cones", 10]
  ],
  "Pedestrian route protection": [
    ["Absperrschranken", "Barriers", 12],
    ["Cones", "Cones", 8]
  ]
};

function suggestForRequest({ requestType, lengthMeters, side, absicherungRequired, absicherungType }) {
  const rows = [];

  if (requestType === "Halteverbot" && lengthMeters > 0) {
    const bothSides = side === "both";
    const signs = Math.max(2, Math.ceil(lengthMeters / 5)) * (bothSides ? 2 : 1);
    rows.push(
      { item_name: "Halteverbot signs", category: "Signs", qty: signs, unit: "pcs" },
      { item_name: "Standsockel", category: "Base Plates", qty: signs * 2, unit: "pcs" },
      { item_name: "Rohrpfosten", category: "Poles", qty: signs, unit: "pcs" },
      { item_name: "Schellen", category: "Clamps", qty: signs * 2, unit: "pcs" },
      { item_name: "Zusatzzeichen date/time", category: "Signs", qty: signs, unit: "pcs" },
      { item_name: "Parked vehicle sheet", category: "Documents", qty: 1, unit: "sheet" }
    );
  }

  if (absicherungRequired) {
    const preset = ABSICHERUNG_PRESETS[absicherungType] || ABSICHERUNG_PRESETS["Simple safety setup"];
    preset.forEach(([item_name, category, qty]) => {
      rows.push({ item_name, category, qty, unit: "pcs" });
    });
  }

  return rows;
}

module.exports = { suggestForRequest, ABSICHERUNG_PRESETS };
