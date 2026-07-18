// Tyre / Nozzle direction clock selector logic (Parked Vehicle task PDF).

const TYRE_DIRECTION_OPTIONS = [
  "12 Uhr", "1 Uhr", "2 Uhr", "3 Uhr", "4 Uhr", "5 Uhr", "6 Uhr",
  "7 Uhr", "8 Uhr", "9 Uhr", "10 Uhr", "11 Uhr", "Unknown"
];

// 12 Uhr -> 0°, 3 Uhr -> 90°, 6 Uhr -> 180°, 9 Uhr -> 270°, Unknown -> null.
function angleForHour(hourLabel) {
  if (!hourLabel || hourLabel === "Unknown") return null;
  const hour = parseInt(hourLabel, 10);
  if (Number.isNaN(hour)) return null;
  return (hour % 12) * 30;
}

module.exports = { TYRE_DIRECTION_OPTIONS, angleForHour };
