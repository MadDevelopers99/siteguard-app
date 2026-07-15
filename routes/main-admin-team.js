const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { statusBadgeClass } = require("../utils/helpers");
const {
  DRIVER_ROLES,
  EMPLOYMENT_TYPES,
  DRIVER_STATUS_OPTIONS,
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  TEAM_STATUSES,
  VACATION_TYPES,
  VACATION_STATUSES,
  ABSENCE_TYPES,
  ABSENCE_STATUSES,
  DRIVER_NOTE_TYPES,
  WORK_AREAS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES
} = require("../utils/constants");

const UNAVAILABLE_STATUSES = ["Sick Leave", "Absent", "Vacation", "Not Available", "Inactive"];

function logHistory(driverId, actionText, changedBy) {
  db.prepare("INSERT INTO driver_history (driver_id, action_text, changed_by) VALUES (?, ?, ?)").run(
    driverId,
    actionText,
    changedBy || "Main Admin"
  );
}

function displayDriverId(id) {
  return `DR-${String(id).padStart(3, "0")}`;
}

function displayVehicleId(id) {
  return `VH-${String(id).padStart(3, "0")}`;
}

// ---------- Dashboard ----------
router.get("/dashboard", (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;

  const stats = {
    total: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1"),
    availableToday: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1 AND status IN ('Available','Available Later')"),
    onWork: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1 AND status = 'On Work'"),
    sickLeave: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1 AND status = 'Sick Leave'"),
    absent: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1 AND status = 'Absent'"),
    vacation: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1 AND status = 'Vacation'"),
    withCar: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1 AND assigned_vehicle_id IS NOT NULL"),
    withoutCar: count("SELECT COUNT(*) AS n FROM drivers WHERE is_active = 1 AND assigned_vehicle_id IS NULL"),
    openPairings: count(
      "SELECT COUNT(*) AS n FROM driver_teams WHERE status IN ('Planned','Active') AND bifahrer_id IS NULL"
    )
  };

  const drivers = db
    .prepare(
      `SELECT d.*, v.vehicle_name
       FROM drivers d LEFT JOIN vehicles v ON v.id = d.assigned_vehicle_id
       WHERE d.is_active = 1 ORDER BY d.name`
    )
    .all();

  const teamByDriver = {};
  db.prepare("SELECT * FROM driver_teams WHERE status IN ('Planned','Active')")
    .all()
    .forEach((t) => {
      if (!teamByDriver[t.main_driver_id]) teamByDriver[t.main_driver_id] = t;
    });
  const driverNameById = {};
  drivers.forEach((d) => (driverNameById[d.id] = d.name));

  const vacationByDriver = {};
  db.prepare("SELECT * FROM driver_vacations WHERE status IN ('Planned','Pending Approval','Approved')")
    .all()
    .forEach((v) => {
      if (!vacationByDriver[v.driver_id]) vacationByDriver[v.driver_id] = v;
    });

  res.render("main-admin-team/dashboard", {
    stats,
    drivers,
    teamByDriver,
    driverNameById,
    vacationByDriver,
    displayDriverId,
    statusBadgeClass,
    mainAdminName: req.session.mainAdminName
  });
});

// ---------- Driver List ----------
router.get("/drivers", (req, res) => {
  const { q, status, role, area, car } = req.query;

  let sql = "SELECT d.*, v.vehicle_name FROM drivers d LEFT JOIN vehicles v ON v.id = d.assigned_vehicle_id WHERE d.is_active = 1";
  const params = [];
  if (q) {
    sql += " AND (d.name LIKE ? OR d.phone LIKE ? OR d.email LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (status) {
    sql += " AND d.status = ?";
    params.push(status);
  }
  if (role) {
    sql += " AND d.role = ?";
    params.push(role);
  }
  if (area) {
    sql += " AND d.work_area = ?";
    params.push(area);
  }
  if (car === "with") sql += " AND d.assigned_vehicle_id IS NOT NULL";
  if (car === "without") sql += " AND d.assigned_vehicle_id IS NULL";
  sql += " ORDER BY d.name";

  const drivers = db.prepare(sql).all(...params);

  res.render("main-admin-team/driver-list", {
    drivers,
    filters: { q: q || "", status: status || "", role: role || "", area: area || "", car: car || "" },
    DRIVER_STATUS_OPTIONS,
    DRIVER_ROLES,
    WORK_AREAS,
    displayDriverId,
    statusBadgeClass,
    mainAdminName: req.session.mainAdminName
  });
});

// ---------- Add Driver ----------
router.get("/drivers/new", (req, res) => {
  res.render("main-admin-team/driver-new", { DRIVER_ROLES, EMPLOYMENT_TYPES, WORK_AREAS, error: null });
});

router.post("/drivers", (req, res) => {
  const {
    first_name, last_name, phone, email, password, address, city, postal_code,
    emergency_contact_name, emergency_contact_phone, role, employment_type, start_date,
    work_area, preferred_work_days, can_drive_vehicle, can_work_as_bifahrer, can_lead_team,
    can_work_night_shift, can_work_weekend
  } = req.body;

  const displayName = `${first_name || ""} ${last_name || ""}`.trim() || email;

  try {
    const hash = bcrypt.hashSync(password || "ChangeMe123!", 10);
    const info = db
      .prepare(
        `INSERT INTO drivers
          (name, email, password_hash, phone, first_name, last_name, address, city, postal_code,
           emergency_contact_name, emergency_contact_phone, role, employment_type, start_date,
           work_area, preferred_work_days, can_drive_vehicle, can_work_as_bifahrer, can_lead_team,
           can_work_night_shift, can_work_weekend)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        displayName, email, hash, phone || null, first_name || null, last_name || null,
        address || null, city || null, postal_code || null,
        emergency_contact_name || null, emergency_contact_phone || null,
        role || "Driver", employment_type || "Full-time", start_date || null,
        work_area || null, preferred_work_days || null,
        can_drive_vehicle ? 1 : 0, can_work_as_bifahrer ? 1 : 0, can_lead_team ? 1 : 0,
        can_work_night_shift ? 1 : 0, can_work_weekend ? 1 : 0
      );

    logHistory(info.lastInsertRowid, "Driver created", req.session.mainAdminName);
    res.redirect(`/main-admin/team/drivers/${info.lastInsertRowid}`);
  } catch (err) {
    res.render("main-admin-team/driver-new", {
      DRIVER_ROLES, EMPLOYMENT_TYPES, WORK_AREAS,
      error: err.message.includes("UNIQUE") ? `Email "${email}" is already used by another driver.` : err.message
    });
  }
});

// ---------- Driver Profile ----------
router.get("/drivers/:id", (req, res) => {
  const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(req.params.id);
  if (!driver) return res.status(404).send("Driver not found");

  const vehicles = db.prepare("SELECT * FROM vehicles ORDER BY vehicle_name").all();
  const assignedVehicle = driver.assigned_vehicle_id
    ? db.prepare("SELECT * FROM vehicles WHERE id = ?").get(driver.assigned_vehicle_id)
    : null;

  const drivers = db.prepare("SELECT * FROM drivers WHERE is_active = 1 ORDER BY name").all();
  const teamsAsMain = db
    .prepare("SELECT * FROM driver_teams WHERE main_driver_id = ? ORDER BY created_at DESC")
    .all(req.params.id);
  const teamsAsBifahrer = db
    .prepare("SELECT * FROM driver_teams WHERE bifahrer_id = ? OR second_bifahrer_id = ? ORDER BY created_at DESC")
    .all(req.params.id, req.params.id);
  const vacations = db
    .prepare("SELECT * FROM driver_vacations WHERE driver_id = ? ORDER BY date_from DESC")
    .all(req.params.id);
  const absences = db
    .prepare("SELECT * FROM driver_absences WHERE driver_id = ? ORDER BY date_from DESC")
    .all(req.params.id);
  const notes = db
    .prepare("SELECT * FROM driver_notes WHERE driver_id = ? ORDER BY is_pinned DESC, created_at DESC")
    .all(req.params.id);
  const documents = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'driver' AND entity_id = ? ORDER BY created_at DESC")
    .all(req.params.id);
  const history = db
    .prepare("SELECT * FROM driver_history WHERE driver_id = ? ORDER BY created_at DESC")
    .all(req.params.id);

  const driverNameById = {};
  drivers.forEach((d) => (driverNameById[d.id] = d.name));

  res.render("main-admin-team/driver-profile", {
    driver,
    vehicles,
    assignedVehicle,
    drivers,
    driverNameById,
    teamsAsMain,
    teamsAsBifahrer,
    vacations,
    absences,
    notes,
    documents,
    history,
    tab: req.query.tab || "overview",
    DRIVER_ROLES,
    EMPLOYMENT_TYPES,
    WORK_AREAS,
    DRIVER_STATUS_OPTIONS,
    VACATION_TYPES,
    VACATION_STATUSES,
    ABSENCE_TYPES,
    ABSENCE_STATUSES,
    DRIVER_NOTE_TYPES,
    DOCUMENT_CATEGORIES,
    DOCUMENT_STATUSES,
    displayDriverId,
    displayVehicleId,
    statusBadgeClass,
    mainAdminName: req.session.mainAdminName
  });
});

router.post("/drivers/:id", (req, res) => {
  const {
    first_name, last_name, phone, email, address, city, postal_code,
    emergency_contact_name, emergency_contact_phone, role, employment_type, start_date,
    work_area, preferred_work_days, can_drive_vehicle, can_work_as_bifahrer, can_lead_team,
    can_work_night_shift, can_work_weekend
  } = req.body;

  const displayName = `${first_name || ""} ${last_name || ""}`.trim() || email;

  db.prepare(
    `UPDATE drivers SET
      name = ?, email = ?, phone = ?, first_name = ?, last_name = ?, address = ?, city = ?, postal_code = ?,
      emergency_contact_name = ?, emergency_contact_phone = ?, role = ?, employment_type = ?, start_date = ?,
      work_area = ?, preferred_work_days = ?, can_drive_vehicle = ?, can_work_as_bifahrer = ?, can_lead_team = ?,
      can_work_night_shift = ?, can_work_weekend = ?
     WHERE id = ?`
  ).run(
    displayName, email, phone || null, first_name || null, last_name || null,
    address || null, city || null, postal_code || null,
    emergency_contact_name || null, emergency_contact_phone || null,
    role || "Driver", employment_type || "Full-time", start_date || null,
    work_area || null, preferred_work_days || null,
    can_drive_vehicle ? 1 : 0, can_work_as_bifahrer ? 1 : 0, can_lead_team ? 1 : 0,
    can_work_night_shift ? 1 : 0, can_work_weekend ? 1 : 0,
    req.params.id
  );

  logHistory(req.params.id, "Personal/work details updated", req.session.mainAdminName);
  res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=personal`);
});

router.post("/drivers/:id/status", (req, res) => {
  const { status, availability_from, availability_until, reason } = req.body;

  db.prepare(
    "UPDATE drivers SET status = ?, availability_from = ?, availability_until = ? WHERE id = ?"
  ).run(status, availability_from || null, availability_until || null, req.params.id);

  logHistory(
    req.params.id,
    `Status changed to ${status}${reason ? ` (${reason})` : ""}`,
    req.session.mainAdminName
  );
  res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=availability`);
});

router.post("/drivers/:id/deactivate", (req, res) => {
  const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(req.params.id);
  const deactivate = db.transaction(() => {
    db.prepare("UPDATE drivers SET is_active = 1 - is_active WHERE id = ?").run(req.params.id);
    if (driver.assigned_vehicle_id) {
      db.prepare("UPDATE vehicles SET assigned_driver_id = NULL, status = 'Available' WHERE id = ?").run(driver.assigned_vehicle_id);
      db.prepare("UPDATE drivers SET assigned_vehicle_id = NULL WHERE id = ?").run(req.params.id);
    }
  });
  deactivate();
  logHistory(req.params.id, driver.is_active ? "Driver deactivated" : "Driver reactivated", req.session.mainAdminName);
  res.redirect("/main-admin/team/drivers");
});

// ---------- Vehicle assignment ----------
router.post("/drivers/:id/assign-vehicle", (req, res) => {
  const { vehicle_id } = req.body;
  const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(req.params.id);
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicle_id);
  if (!vehicle) return res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=vehicle`);

  const assign = db.transaction(() => {
    if (driver.assigned_vehicle_id) {
      db.prepare("UPDATE vehicles SET assigned_driver_id = NULL, status = 'Available' WHERE id = ?").run(driver.assigned_vehicle_id);
    }
    db.prepare("UPDATE vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = ?").run(req.params.id);
    db.prepare("UPDATE vehicles SET assigned_driver_id = ?, status = 'Assigned' WHERE id = ?").run(req.params.id, vehicle_id);
    db.prepare("UPDATE drivers SET assigned_vehicle_id = ? WHERE id = ?").run(vehicle_id, req.params.id);
  });
  assign();

  logHistory(req.params.id, `Vehicle ${vehicle.vehicle_name} assigned`, req.session.mainAdminName);
  res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=vehicle`);
});

router.post("/drivers/:id/remove-vehicle", (req, res) => {
  const driver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(req.params.id);
  if (driver.assigned_vehicle_id) {
    const remove = db.transaction(() => {
      db.prepare("UPDATE vehicles SET assigned_driver_id = NULL, status = 'Available' WHERE id = ?").run(driver.assigned_vehicle_id);
      db.prepare("UPDATE drivers SET assigned_vehicle_id = NULL WHERE id = ?").run(req.params.id);
    });
    remove();
    logHistory(req.params.id, "Vehicle removed", req.session.mainAdminName);
  }
  res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=vehicle`);
});

// ---------- Notes ----------
router.post("/drivers/:id/notes", (req, res) => {
  const { note_type, note_text, is_private } = req.body;
  db.prepare(
    "INSERT INTO driver_notes (driver_id, note_type, note_text, is_private, created_by) VALUES (?, ?, ?, ?, ?)"
  ).run(req.params.id, note_type || "General Note", note_text, is_private ? 1 : 0, req.session.mainAdminName || "Main Admin");
  res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=notes`);
});

router.post("/drivers/:id/notes/:noteId/pin", (req, res) => {
  db.prepare("UPDATE driver_notes SET is_pinned = 1 - is_pinned WHERE id = ?").run(req.params.noteId);
  res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=notes`);
});

router.post("/drivers/:id/notes/:noteId/delete", (req, res) => {
  db.prepare("DELETE FROM driver_notes WHERE id = ?").run(req.params.noteId);
  res.redirect(`/main-admin/team/drivers/${req.params.id}?tab=notes`);
});

// ---------- Vehicles ----------
router.get("/vehicles", (req, res) => {
  const vehicles = db
    .prepare(
      `SELECT v.*, d.name AS driver_name FROM vehicles v LEFT JOIN drivers d ON d.id = v.assigned_driver_id ORDER BY v.vehicle_name`
    )
    .all();
  res.render("main-admin-team/vehicles", { vehicles, displayVehicleId, statusBadgeClass, mainAdminName: req.session.mainAdminName });
});

router.get("/vehicles/new", (req, res) => {
  res.render("main-admin-team/vehicle-form", { vehicle: null, VEHICLE_TYPES, VEHICLE_STATUSES });
});

router.post("/vehicles", (req, res) => {
  const { vehicle_name, plate_number, vehicle_type, capacity, fuel_type, insurance_expiry, tuv_expiry, service_date, status, notes } = req.body;
  db.prepare(
    `INSERT INTO vehicles (vehicle_name, plate_number, vehicle_type, capacity, fuel_type, insurance_expiry, tuv_expiry, service_date, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(vehicle_name, plate_number || null, vehicle_type || null, capacity || null, fuel_type || null, insurance_expiry || null, tuv_expiry || null, service_date || null, status || "Available", notes || null);
  res.redirect("/main-admin/team/vehicles");
});

router.get("/vehicles/:id/edit", (req, res) => {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(req.params.id);
  if (!vehicle) return res.status(404).send("Vehicle not found");
  res.render("main-admin-team/vehicle-form", { vehicle, VEHICLE_TYPES, VEHICLE_STATUSES });
});

router.post("/vehicles/:id", (req, res) => {
  const { vehicle_name, plate_number, vehicle_type, capacity, fuel_type, insurance_expiry, tuv_expiry, service_date, status, notes } = req.body;
  db.prepare(
    `UPDATE vehicles SET vehicle_name = ?, plate_number = ?, vehicle_type = ?, capacity = ?, fuel_type = ?,
      insurance_expiry = ?, tuv_expiry = ?, service_date = ?, status = ?, notes = ? WHERE id = ?`
  ).run(vehicle_name, plate_number || null, vehicle_type || null, capacity || null, fuel_type || null, insurance_expiry || null, tuv_expiry || null, service_date || null, status || "Available", notes || null, req.params.id);
  res.redirect("/main-admin/team/vehicles");
});

// ---------- Bifahrer / Team Pairing ----------
router.get("/teams", (req, res) => {
  const teams = db
    .prepare(
      `SELECT t.*, m.name AS main_driver_name, b.name AS bifahrer_name, s.name AS second_bifahrer_name, v.vehicle_name
       FROM driver_teams t
       JOIN drivers m ON m.id = t.main_driver_id
       LEFT JOIN drivers b ON b.id = t.bifahrer_id
       LEFT JOIN drivers s ON s.id = t.second_bifahrer_id
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       ORDER BY t.created_at DESC`
    )
    .all();
  const drivers = db.prepare("SELECT * FROM drivers WHERE is_active = 1 ORDER BY name").all();
  const vehicles = db.prepare("SELECT * FROM vehicles ORDER BY vehicle_name").all();
  res.render("main-admin-team/teams", {
    teams, drivers, vehicles, TEAM_STATUSES, statusBadgeClass,
    error: req.query.error || null,
    mainAdminName: req.session.mainAdminName
  });
});

router.post("/teams", (req, res) => {
  const { main_driver_id, bifahrer_id, second_bifahrer_id, vehicle_id, date, time_from, time_to, notes } = req.body;

  const mainDriver = db.prepare("SELECT * FROM drivers WHERE id = ?").get(main_driver_id);
  if (!mainDriver || UNAVAILABLE_STATUSES.includes(mainDriver.status)) {
    return res.redirect("/main-admin/team/teams?error=" + encodeURIComponent("Main driver is not available (status: " + (mainDriver ? mainDriver.status : "unknown") + ")."));
  }
  if (bifahrer_id) {
    const bifahrer = db.prepare("SELECT * FROM drivers WHERE id = ?").get(bifahrer_id);
    if (!bifahrer || UNAVAILABLE_STATUSES.includes(bifahrer.status)) {
      return res.redirect("/main-admin/team/teams?error=" + encodeURIComponent("Bifahrer is not available (status: " + (bifahrer ? bifahrer.status : "unknown") + ")."));
    }
  }

  const activeElsewhere = db
    .prepare(
      `SELECT COUNT(*) AS n FROM driver_teams WHERE status = 'Active'
       AND (main_driver_id = ? OR bifahrer_id = ? OR second_bifahrer_id = ?
         OR main_driver_id = ? OR bifahrer_id = ? OR second_bifahrer_id = ?)`
    )
    .get(main_driver_id, main_driver_id, main_driver_id, bifahrer_id || 0, bifahrer_id || 0, bifahrer_id || 0).n;
  if (activeElsewhere > 0) {
    return res.redirect("/main-admin/team/teams?error=" + encodeURIComponent("One of the selected drivers is already in another active team."));
  }

  db.prepare(
    `INSERT INTO driver_teams (main_driver_id, bifahrer_id, second_bifahrer_id, vehicle_id, date, time_from, time_to, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(main_driver_id, bifahrer_id || null, second_bifahrer_id || null, vehicle_id || null, date || null, time_from || null, time_to || null, notes || null);

  logHistory(main_driver_id, `Paired with ${bifahrer_id ? "Bifahrer" : "team"}`, req.session.mainAdminName);
  if (bifahrer_id) logHistory(bifahrer_id, `Assigned as Bifahrer to ${mainDriver.name}`, req.session.mainAdminName);

  res.redirect("/main-admin/team/teams");
});

router.post("/teams/:id/status", (req, res) => {
  const team = db.prepare("SELECT * FROM driver_teams WHERE id = ?").get(req.params.id);
  db.prepare("UPDATE driver_teams SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  if (team) logHistory(team.main_driver_id, `Team status changed to ${req.body.status}`, req.session.mainAdminName);
  res.redirect("/main-admin/team/teams");
});

// ---------- Vacation Planner ----------
router.get("/vacations", (req, res) => {
  const vacations = db
    .prepare(
      `SELECT vac.*, d.name AS driver_name, r.name AS replacement_name
       FROM driver_vacations vac JOIN drivers d ON d.id = vac.driver_id
       LEFT JOIN drivers r ON r.id = vac.replacement_driver_id
       ORDER BY vac.date_from DESC`
    )
    .all();
  const drivers = db.prepare("SELECT * FROM drivers WHERE is_active = 1 ORDER BY name").all();
  res.render("main-admin-team/vacations", { vacations, drivers, VACATION_TYPES, VACATION_STATUSES, statusBadgeClass, mainAdminName: req.session.mainAdminName });
});

router.post("/vacations", (req, res) => {
  const { driver_id, date_from, date_to, vacation_type, replacement_needed, replacement_driver_id, notes } = req.body;
  db.prepare(
    `INSERT INTO driver_vacations (driver_id, date_from, date_to, vacation_type, replacement_needed, replacement_driver_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(driver_id, date_from, date_to, vacation_type || "Annual Leave", replacement_needed ? 1 : 0, replacement_driver_id || null, notes || null);
  logHistory(driver_id, `Vacation planned from ${date_from} to ${date_to}`, req.session.mainAdminName);
  res.redirect("/main-admin/team/vacations");
});

router.post("/vacations/:id/:action(approve|reject|cancel)", (req, res) => {
  const statusMap = { approve: "Approved", reject: "Rejected", cancel: "Cancelled" };
  const vacation = db.prepare("SELECT * FROM driver_vacations WHERE id = ?").get(req.params.id);
  db.prepare("UPDATE driver_vacations SET status = ? WHERE id = ?").run(statusMap[req.params.action], req.params.id);
  if (vacation) {
    logHistory(vacation.driver_id, `Vacation ${statusMap[req.params.action].toLowerCase()}`, req.session.mainAdminName);
    if (req.params.action === "approve") {
      db.prepare("UPDATE drivers SET status = 'Vacation' WHERE id = ?").run(vacation.driver_id);
    }
  }
  res.redirect("/main-admin/team/vacations");
});

// ---------- Sick Leave & Absence ----------
router.get("/absences", (req, res) => {
  const absences = db
    .prepare(`SELECT a.*, d.name AS driver_name FROM driver_absences a JOIN drivers d ON d.id = a.driver_id ORDER BY a.date_from DESC`)
    .all();
  const drivers = db.prepare("SELECT * FROM drivers WHERE is_active = 1 ORDER BY name").all();
  res.render("main-admin-team/absences", { absences, drivers, ABSENCE_TYPES, ABSENCE_STATUSES, statusBadgeClass, mainAdminName: req.session.mainAdminName });
});

router.post("/absences", (req, res) => {
  const { driver_id, absence_type, date_from, date_to, full_day, reason, document_required, notes } = req.body;
  db.prepare(
    `INSERT INTO driver_absences (driver_id, absence_type, date_from, date_to, full_day, reason, document_required, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(driver_id, absence_type || "Sick Leave", date_from, date_to || null, full_day ? 1 : 0, reason || null, document_required ? 1 : 0, notes || null);

  const newDriverStatus = (absence_type || "Sick Leave") === "Sick Leave" ? "Sick Leave" : "Absent";
  db.prepare("UPDATE drivers SET status = ? WHERE id = ?").run(newDriverStatus, driver_id);
  logHistory(driver_id, `Marked ${newDriverStatus}${reason ? ` (${reason})` : ""}`, req.session.mainAdminName);

  res.redirect("/main-admin/team/absences");
});

router.post("/absences/:id/resolve", (req, res) => {
  const absence = db.prepare("SELECT * FROM driver_absences WHERE id = ?").get(req.params.id);
  db.prepare("UPDATE driver_absences SET status = 'Resolved' WHERE id = ?").run(req.params.id);
  if (absence) {
    db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ?").run(absence.driver_id);
    logHistory(absence.driver_id, "Absence resolved, marked Available", req.session.mainAdminName);
  }
  res.redirect("/main-admin/team/absences");
});

// ---------- Daily Planning Board ----------
router.get("/planning-board", (req, res) => {
  const drivers = db.prepare("SELECT * FROM drivers WHERE is_active = 1 ORDER BY name").all();
  const available = drivers.filter((d) => ["Available", "Available Later"].includes(d.status));
  const withVehicle = drivers.filter((d) => d.assigned_vehicle_id);
  const withoutVehicle = drivers.filter((d) => !d.assigned_vehicle_id && !UNAVAILABLE_STATUSES.includes(d.status));
  const sickAbsent = drivers.filter((d) => ["Sick Leave", "Absent"].includes(d.status));
  const onVacation = drivers.filter((d) => d.status === "Vacation");

  const teams = db
    .prepare(
      `SELECT t.*, m.name AS main_driver_name, b.name AS bifahrer_name, v.vehicle_name
       FROM driver_teams t JOIN drivers m ON m.id = t.main_driver_id
       LEFT JOIN drivers b ON b.id = t.bifahrer_id
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       WHERE t.status IN ('Planned','Active') ORDER BY t.date DESC`
    )
    .all();

  const vehicleNameById = {};
  db.prepare("SELECT * FROM vehicles").all().forEach((v) => (vehicleNameById[v.id] = v.vehicle_name));

  res.render("main-admin-team/planning-board", {
    available, withVehicle, withoutVehicle, sickAbsent, onVacation, teams, vehicleNameById,
    mainAdminName: req.session.mainAdminName
  });
});

// ---------- Settings (static reference) ----------
router.get("/settings", (req, res) => {
  res.render("main-admin-team/settings", {
    DRIVER_ROLES, EMPLOYMENT_TYPES, DRIVER_STATUS_OPTIONS, VEHICLE_TYPES, VEHICLE_STATUSES,
    VACATION_TYPES, ABSENCE_TYPES, DOCUMENT_CATEGORIES, WORK_AREAS, TEAM_STATUSES,
    mainAdminName: req.session.mainAdminName
  });
});

module.exports = router;
