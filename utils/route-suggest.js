// Route suggestion (Driver Tablet App PDF §7). No live GPS/distance data is
// available in this project (no maps API configured), so the heuristic is
// Priority first, then scheduled time — matches the PDF's own worked example
// (closest + deadline task first) closely enough without inventing distances.

const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2 };

// tasks: [{ id, priority, sortTime }] — sortTime any comparable string (e.g. "2026-07-16 09:00").
// Returns a new array of ids in suggested stop order.
function suggestOrder(tasks) {
  return [...tasks]
    .sort((a, b) => {
      const rankA = PRIORITY_RANK[a.priority] ?? PRIORITY_RANK.Normal;
      const rankB = PRIORITY_RANK[b.priority] ?? PRIORITY_RANK.Normal;
      if (rankA !== rankB) return rankA - rankB;
      const timeA = a.sortTime || "";
      const timeB = b.sortTime || "";
      return timeA.localeCompare(timeB);
    })
    .map((t) => t.id);
}

module.exports = { suggestOrder, PRIORITY_RANK };
