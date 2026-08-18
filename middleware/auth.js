function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.redirect("/admin/login");
}

function requireMainAdmin(req, res, next) {
  if (req.session && req.session.mainAdminId) {
    return next();
  }
  return res.redirect("/main-admin/login");
}

function requireDriver(req, res, next) {
  if (req.session && req.session.driverId) {
    return next();
  }
  return res.redirect("/driver/login");
}

// Used by routes reachable from more than one role (e.g. shared document uploads).
function requireAnyRole(req, res, next) {
  if (req.session && (req.session.adminId || req.session.mainAdminId || req.session.driverId)) {
    return next();
  }
  return res.redirect("/admin/login");
}

// Time Tracking portal has its own standalone account system, independent
// of the Admin/Main Admin/Driver sessions above.
function requireTimeUser(req, res, next) {
  if (req.session && req.session.timeUserId) {
    return next();
  }
  return res.redirect("/time/login");
}

// Gates the Time Tracking Admin Dashboard + entry approve/reject — everything
// else in the portal stays open to any logged-in time user (no broader RBAC).
function requireTimeAdmin(req, res, next) {
  if (!req.session || !req.session.timeUserId) {
    return res.redirect("/time/login");
  }
  const db = require("../db/database");
  const user = db.prepare("SELECT is_admin FROM time_users WHERE id = ?").get(req.session.timeUserId);
  if (user && user.is_admin) {
    return next();
  }
  return res.status(403).send("Time Tracking admin access required.");
}

module.exports = {
  requireAdmin,
  requireMainAdmin,
  requireDriver,
  requireAnyRole,
  requireTimeUser,
  requireTimeAdmin
};
