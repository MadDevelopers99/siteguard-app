// Real-geo counterpart to utils/route-suggest.js's priority-based heuristic:
// haversine nearest-neighbor stop ordering. No routing API — straight-line
// distance only (per the approved pragmatic substitute for Route Planning).
const { haversineMeters } = require("./geofence");

// stops: [{id, lat, lng}]. start: {lat,lng} or null (falls back to the first stop).
// Returns stop ids in nearest-neighbor visiting order.
function suggestRouteOrder(stops, start) {
  const remaining = [...stops];
  const order = [];
  let current = start;

  if (!current && remaining.length) {
    current = remaining[0];
  }

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineMeters(current, s);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    order.push(next.id);
    current = next;
  }

  return order;
}

// Total distance (km) for stops visited in the given order, optionally from a start point.
function routeDistanceKm(stops, start) {
  let total = 0;
  let prev = start || (stops.length ? stops[0] : null);
  const rest = start ? stops : stops.slice(1);
  rest.forEach((s) => {
    total += haversineMeters(prev, s) / 1000;
    prev = s;
  });
  return total;
}

const ASSUMED_AVG_SPEED_KMH = 40;

module.exports = { suggestRouteOrder, routeDistanceKm, ASSUMED_AVG_SPEED_KMH };
