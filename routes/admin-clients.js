const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db/database");
const { REQUEST_TYPES, DOCUMENT_CATEGORIES, DOCUMENT_STATUSES } = require("../utils/constants");

const csvUpload = multer({ storage: multer.memoryStorage() });

const CLIENT_TYPES = ["Real Estate", "Construction", "Municipality", "Moving Company", "Other"];
const CLIENT_STATUSES = ["active", "inactive", "priority"];
const PAYMENT_STATUSES = ["normal", "overdue", "blocked"];
const CONTACT_ROLES = [
  "Main Contact",
  "Billing Contact",
  "Site Contact",
  "Technical Contact",
  "Emergency Contact",
  "Management Contact"
];
const LOCATION_TYPES = REQUEST_TYPES;

function displayClientId(id) {
  return `CL-${1000 + id}`;
}

function preferredContact(contacts, role) {
  return contacts.find((c) => c.role === role && c.is_preferred) || contacts.find((c) => c.role === role);
}

// ---------- List ----------
router.get("/", (req, res) => {
  const { q, status } = req.query;

  let sql = `
    SELECT c.*,
      SUM(CASE WHEN o.status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS active_orders,
      SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) AS completed_orders,
      MAX(o.created_at) AS last_activity
    FROM clients c
    LEFT JOIN orders o ON o.client_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += " AND c.client_status = ?";
    params.push(status);
  }
  if (q) {
    sql += " AND (c.company LIKE ? OR c.name LIKE ? OR c.email LIKE ? OR c.city LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  sql += " GROUP BY c.id ORDER BY c.created_at DESC";

  const clients = db.prepare(sql).all(...params);
  const clientIds = clients.map((c) => c.id);

  let mainContactByClient = {};
  if (clientIds.length) {
    const placeholders = clientIds.map(() => "?").join(",");
    const contacts = db
      .prepare(
        `SELECT * FROM client_contacts WHERE client_id IN (${placeholders}) AND role = 'Main Contact'`
      )
      .all(...clientIds);
    contacts.forEach((c) => {
      if (!mainContactByClient[c.client_id] || c.is_preferred) {
        mainContactByClient[c.client_id] = c;
      }
    });
  }

  res.render("admin/clients", {
    clients,
    mainContactByClient,
    filters: { q: q || "", status: status || "" },
    CLIENT_STATUSES,
    displayClientId
  });
});

// ---------- New client ----------
router.get("/new", (req, res) => {
  res.render("admin/client-new", { CLIENT_TYPES });
});

router.post("/", (req, res) => {
  const {
    company, name, client_type, email, phone,
    street, house_number, zip, city, country,
    contact_phone, contact_mobile, contact_email,
    notes
  } = req.body;

  try {
    const createClient = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO clients (name, company, email, phone, city, street, house_number, zip, country, client_type, source, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'email', ?)`
        )
        .run(
          name,
          company || null,
          email || null,
          phone || null,
          city || null,
          street || null,
          house_number || null,
          zip || null,
          country || "Germany",
          client_type || null,
          notes || null
        );
      const clientId = info.lastInsertRowid;

      db.prepare(
        `INSERT INTO client_contacts (client_id, name, role, phone, mobile, email, is_preferred)
         VALUES (?, ?, 'Main Contact', ?, ?, ?, 1)`
      ).run(clientId, name, contact_phone || phone || null, contact_mobile || null, contact_email || email || null);

      return clientId;
    });

    const clientId = createClient();
    res.redirect(`/admin/clients/${clientId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating client: " + err.message);
  }
});

// ---------- Import ----------
// NOTE: must be registered before GET "/:id" so "/import" isn't captured as an id.
router.get("/import", (req, res) => {
  res.render("admin/client-import", { result: null });
});

router.post("/import", csvUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const text = req.file.buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return res.render("admin/client-import", { result: { imported: 0, skipped: 0, total: 0 } });
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);

  let imported = 0;
  let skipped = 0;

  const insert = db.prepare(
    `INSERT INTO clients (name, company, email, phone, city, client_type, source) VALUES (?, ?, ?, ?, ?, ?, 'email')`
  );
  const runImport = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",").map((c) => c.trim());
      const name = col("name") >= 0 ? cells[col("name")] : null;
      const company = col("company") >= 0 ? cells[col("company")] : null;
      if (!name && !company) {
        skipped++;
        continue;
      }
      insert.run(
        name || company,
        company || null,
        col("email") >= 0 ? cells[col("email")] || null : null,
        col("phone") >= 0 ? cells[col("phone")] || null : null,
        col("city") >= 0 ? cells[col("city")] || null : null,
        col("client_type") >= 0 ? cells[col("client_type")] || null : null
      );
      imported++;
    }
  });
  runImport();

  res.render("admin/client-import", { result: { imported, skipped, total: lines.length - 1 } });
});

// ---------- Workspace ----------
router.get("/:id", (req, res) => {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
  if (!client) return res.status(404).send("Client not found");

  const contacts = db
    .prepare("SELECT * FROM client_contacts WHERE client_id = ? ORDER BY role, name")
    .all(client.id);
  const locations = db
    .prepare("SELECT * FROM client_locations WHERE client_id = ? ORDER BY created_at DESC")
    .all(client.id);
  const orders = db
    .prepare("SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC")
    .all(client.id);

  const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
  const completedOrders = orders.filter((o) => o.status === "delivered");
  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const lastOrder = orders[0];

  const clientRequests = db
    .prepare("SELECT * FROM requests WHERE client_id = ? ORDER BY created_at DESC")
    .all(client.id);
  const documents = db
    .prepare("SELECT * FROM documents WHERE entity_type = 'client' AND entity_id = ? ORDER BY created_at DESC")
    .all(client.id);

  const mapAlerts = locations
    .filter((l) => l.map_status === "needed")
    .map((l) => `Map needed for ${l.street}${l.house_number ? " " + l.house_number : ""}`);

  const history = [
    { date: client.created_at, text: `Client created` },
    ...contacts.map((c) => ({ date: c.created_at, text: `Contact "${c.name}" (${c.role}) added` })),
    ...locations.map((l) => ({ date: l.created_at, text: `Location "${l.location_name || l.street}" added` })),
    ...orders.map((o) => ({ date: o.created_at, text: `Auftrag ${o.order_number} created (${o.status})` }))
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  // NOTE: the render key must not be "client" — EJS's Express-compat shim
  // treats a data key literally named "client" as the client-side-compile
  // option, which silently breaks the include() helper.
  res.render("admin/client-workspace", {
    clientRow: client,
    contacts,
    locations,
    orders,
    activeOrders,
    completedOrders,
    totalSpent,
    lastOrder,
    mapAlerts,
    history,
    clientRequests,
    documents,
    DOCUMENT_CATEGORIES,
    DOCUMENT_STATUSES,
    tab: req.query.tab || "overview",
    CLIENT_TYPES,
    CLIENT_STATUSES,
    PAYMENT_STATUSES,
    CONTACT_ROLES,
    LOCATION_TYPES,
    displayClientId,
    preferredContact
  });
});

router.post("/:id", (req, res) => {
  const {
    company, name, client_type, client_status, payment_status,
    email, phone, street, house_number, zip, city, country,
    debitor_number, reference_number, vat_id, hrb_number,
    industry, company_size, preferred_language, internal_rating
  } = req.body;

  db.prepare(
    `UPDATE clients SET
      company = ?, name = ?, client_type = ?, client_status = ?, payment_status = ?,
      email = ?, phone = ?, street = ?, house_number = ?, zip = ?, city = ?, country = ?,
      debitor_number = ?, reference_number = ?, vat_id = ?, hrb_number = ?,
      industry = ?, company_size = ?, preferred_language = ?, internal_rating = ?
     WHERE id = ?`
  ).run(
    company || null, name, client_type || null, client_status || "active", payment_status || "normal",
    email || null, phone || null, street || null, house_number || null, zip || null, city || null, country || null,
    debitor_number || null, reference_number || null, vat_id || null, hrb_number || null,
    industry || null, company_size || null, preferred_language || null, internal_rating || null,
    req.params.id
  );

  res.redirect(`/admin/clients/${req.params.id}?tab=company-details`);
});

router.post("/:id/notes", (req, res) => {
  db.prepare("UPDATE clients SET notes = ? WHERE id = ?").run(req.body.notes || null, req.params.id);
  res.redirect(`/admin/clients/${req.params.id}?tab=notes`);
});

// ---------- Contacts ----------
router.post("/:id/contacts", (req, res) => {
  const { name, role, phone, mobile, email } = req.body;
  db.prepare(
    `INSERT INTO client_contacts (client_id, name, role, phone, mobile, email) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, name, role, phone || null, mobile || null, email || null);
  res.redirect(`/admin/clients/${req.params.id}?tab=contacts`);
});

router.post("/:id/contacts/:contactId", (req, res) => {
  const { name, role, phone, mobile, email } = req.body;
  db.prepare(
    `UPDATE client_contacts SET name = ?, role = ?, phone = ?, mobile = ?, email = ? WHERE id = ? AND client_id = ?`
  ).run(name, role, phone || null, mobile || null, email || null, req.params.contactId, req.params.id);
  res.redirect(`/admin/clients/${req.params.id}?tab=contacts`);
});

router.post("/:id/contacts/:contactId/delete", (req, res) => {
  db.prepare("DELETE FROM client_contacts WHERE id = ? AND client_id = ?").run(req.params.contactId, req.params.id);
  res.redirect(`/admin/clients/${req.params.id}?tab=contacts`);
});

router.post("/:id/contacts/:contactId/prefer", (req, res) => {
  const contact = db
    .prepare("SELECT * FROM client_contacts WHERE id = ? AND client_id = ?")
    .get(req.params.contactId, req.params.id);
  if (contact) {
    const setPreferred = db.transaction(() => {
      db.prepare("UPDATE client_contacts SET is_preferred = 0 WHERE client_id = ? AND role = ?").run(
        req.params.id,
        contact.role
      );
      db.prepare("UPDATE client_contacts SET is_preferred = 1 WHERE id = ?").run(req.params.contactId);
    });
    setPreferred();
  }
  res.redirect(`/admin/clients/${req.params.id}?tab=contacts`);
});

// ---------- Locations ----------
router.post("/:id/locations", (req, res) => {
  const {
    location_name, street, house_number, zip, city, location_type,
    side_of_street, opposite_side_required, length_meters, parking_spaces,
    access_notes, map_pin, map_status
  } = req.body;

  db.prepare(
    `INSERT INTO client_locations
      (client_id, location_name, street, house_number, zip, city, location_type,
       side_of_street, opposite_side_required, length_meters, parking_spaces,
       access_notes, map_pin, map_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.params.id, location_name || null, street, house_number || null, zip || null, city || null,
    location_type || null, side_of_street || null, opposite_side_required ? 1 : 0,
    length_meters ? parseFloat(length_meters) : null, parking_spaces ? parseInt(parking_spaces, 10) : null,
    access_notes || null, map_pin || null, map_status || "needed"
  );

  res.redirect(`/admin/clients/${req.params.id}?tab=locations`);
});

router.post("/:id/locations/:locId", (req, res) => {
  const {
    location_name, street, house_number, zip, city, location_type,
    side_of_street, opposite_side_required, length_meters, parking_spaces,
    access_notes, map_pin, map_status
  } = req.body;

  db.prepare(
    `UPDATE client_locations SET
      location_name = ?, street = ?, house_number = ?, zip = ?, city = ?, location_type = ?,
      side_of_street = ?, opposite_side_required = ?, length_meters = ?, parking_spaces = ?,
      access_notes = ?, map_pin = ?, map_status = ?
     WHERE id = ? AND client_id = ?`
  ).run(
    location_name || null, street, house_number || null, zip || null, city || null, location_type || null,
    side_of_street || null, opposite_side_required ? 1 : 0,
    length_meters ? parseFloat(length_meters) : null, parking_spaces ? parseInt(parking_spaces, 10) : null,
    access_notes || null, map_pin || null, map_status || "needed",
    req.params.locId, req.params.id
  );

  res.redirect(`/admin/clients/${req.params.id}?tab=locations`);
});

router.post("/:id/locations/:locId/delete", (req, res) => {
  db.prepare("DELETE FROM client_locations WHERE id = ? AND client_id = ?").run(req.params.locId, req.params.id);
  res.redirect(`/admin/clients/${req.params.id}?tab=locations`);
});

module.exports = router;
