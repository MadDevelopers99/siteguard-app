const express = require("express");
const router = express.Router();
const PDFDocument = require("pdfkit");
const { timeReport, projectReport, spatialReport, payrollReport } = require("../utils/time-report-query");

function fmtHours(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

router.get("/", (req, res) => {
  const tab = req.query.tab || "time";
  const time = timeReport();
  const projects = projectReport();
  const spatial = spatialReport();
  const payroll = payrollReport();

  res.render("time/reports", { tab, time, projects, spatial, payroll, fmtHours });
});

function csvEscape(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

router.get("/export.csv", (req, res) => {
  const tab = req.query.tab || "time";
  let header = [];
  let rows = [];

  if (tab === "project") {
    header = ["Project", "Customer", "Budget (h)", "Logged (h)", "Remaining (h)"];
    rows = projectReport().map((p) => [p.name, p.client_name, p.budget_hours ?? "", p.loggedHours, p.remaining ?? ""]);
  } else if (tab === "spatial") {
    header = ["Region", "Projects", "Hours Logged"];
    rows = spatialReport().map((r) => [r.region, r.project_count, r.hoursLogged]);
  } else if (tab === "payroll") {
    header = ["Staff", "Hours Logged", "Estimated Pay (€)"];
    rows = payrollReport().map((p) => [p.name, p.hoursLogged, p.estimated_pay.toFixed(2)]);
  } else {
    header = ["Staff", "Total Hours", "Approved Hours", "Pending Hours"];
    rows = timeReport().rows.map((r) => [
      r.name,
      (r.total_minutes / 60).toFixed(2),
      (r.approved_minutes / 60).toFixed(2),
      (r.pending_minutes / 60).toFixed(2)
    ]);
  }

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=time-report-${tab}.csv`);
  res.send(csv);
});

router.get("/export.pdf", (req, res) => {
  const tab = req.query.tab || "time";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="time-report-${tab}.pdf"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text("SiteGuard Time Tracking");
  doc.fontSize(9).fillColor("#666").text(`Generated: ${new Date().toLocaleString()}`);
  doc.fillColor("#000").moveDown();

  if (tab === "project") {
    doc.fontSize(14).text("Project Report", { underline: true }).moveDown(0.5);
    projectReport().forEach((p) => {
      doc.fontSize(10).text(`${p.client_name} — ${p.name}: ${p.loggedHours}h logged${p.budget_hours != null ? ` / ${p.budget_hours}h budget` : ""}`);
    });
  } else if (tab === "spatial") {
    doc.fontSize(14).text("Spatial Report", { underline: true }).moveDown(0.5);
    spatialReport().forEach((r) => {
      doc.fontSize(10).text(`${r.region}: ${r.project_count} projects, ${r.hoursLogged}h logged`);
    });
  } else if (tab === "payroll") {
    doc.fontSize(14).text("Payroll Estimate", { underline: true }).moveDown(0.5);
    payrollReport().forEach((p) => {
      doc.fontSize(10).text(`${p.name}: ${p.hoursLogged}h — est. €${p.estimated_pay.toFixed(2)}`);
    });
  } else {
    doc.fontSize(14).text("Time Report", { underline: true }).moveDown(0.5);
    const { rows } = timeReport();
    rows.forEach((r) => {
      doc.fontSize(10).text(`${r.name}: ${fmtHours(r.total_minutes)} total (${fmtHours(r.approved_minutes)} approved, ${fmtHours(r.pending_minutes)} pending)`);
    });
  }

  doc.end();
});

module.exports = router;
