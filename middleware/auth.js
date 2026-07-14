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

module.exports = { requireAdmin, requireMainAdmin, requireDriver, requireAnyRole };
