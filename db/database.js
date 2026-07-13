const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.join(__dirname, "siteguard.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// Compatibility shim so the rest of the app can keep using the
// better-sqlite3-style db.transaction(fn) pattern.
db.transaction = function (fn) {
  return function (...args) {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
};

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  source TEXT DEFAULT 'website', -- 'website' or 'email' (added manually by admin)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  price REAL NOT NULL,
  unit TEXT DEFAULT 'piece',
  description TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  status TEXT DEFAULT 'pending', -- pending, confirmed, dispatched, delivered, cancelled
  source TEXT DEFAULT 'website', -- 'website' or 'email'
  site_address TEXT,
  needed_by TEXT,
  notes TEXT,
  total REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  item_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  line_total REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS client_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- Main Contact, Billing Contact, Site Contact, Technical Contact, Emergency Contact, Management Contact
  phone TEXT,
  mobile TEXT,
  email TEXT,
  is_preferred INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_name TEXT,
  street TEXT NOT NULL,
  house_number TEXT,
  zip TEXT,
  city TEXT,
  location_type TEXT,
  side_of_street TEXT,
  opposite_side_required INTEGER DEFAULT 0,
  length_meters REAL,
  parking_spaces INTEGER,
  access_notes TEXT,
  map_pin TEXT,
  map_status TEXT DEFAULT 'needed', -- 'needed' or 'available'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_locations_client ON client_locations(client_id);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  location_id INTEGER REFERENCES client_locations(id),
  status TEXT DEFAULT 'Request Draft',
  request_type TEXT,
  purpose TEXT,
  date_from TEXT,
  date_to TEXT,
  time_from TEXT,
  time_to TEXT,
  number_of_days INTEGER,
  urgency TEXT DEFAULT 'Standard',
  required_length_meters REAL,
  parking_spaces INTEGER,
  side TEXT DEFAULT 'one',
  special_instructions TEXT,
  kvr_required INTEGER DEFAULT 0,
  kvr_status TEXT DEFAULT 'Not Required',
  kvr_authority TEXT,
  kvr_permission_number TEXT,
  kvr_valid_from TEXT,
  kvr_valid_to TEXT,
  kvr_special_conditions TEXT,
  absicherung_required INTEGER DEFAULT 0,
  absicherung_type TEXT,
  half_side_closure INTEGER DEFAULT 0,
  full_closure INTEGER DEFAULT 0,
  pedestrian_path_affected INTEGER DEFAULT 0,
  cycle_lane_affected INTEGER DEFAULT 0,
  traffic_plan_required INTEGER DEFAULT 0,
  parked_vehicle_list_required INTEGER DEFAULT 0,
  safety_notes TEXT,
  map_fee_tier TEXT DEFAULT 'none',
  transport_zone TEXT DEFAULT 'within',
  subtotal_net REAL DEFAULT 0,
  vat_rate REAL DEFAULT 19,
  vat_amount REAL DEFAULT 0,
  total_gross REAL DEFAULT 0,
  order_id INTEGER REFERENCES orders(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT UNIQUE NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'pcs',
  available_stock INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS request_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT,
  planned_qty REAL NOT NULL,
  unit TEXT DEFAULT 'pcs',
  status TEXT DEFAULT 'Available',
  source TEXT DEFAULT 'manual', -- 'suggested' or 'manual'
  notes TEXT
);

CREATE TABLE IF NOT EXISTS request_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  price_item TEXT NOT NULL,
  calculation_type TEXT DEFAULT 'Fixed',
  qty REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  days REAL,
  net_total REAL NOT NULL,
  source TEXT DEFAULT 'manual', -- 'auto' or 'manual'
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, -- 'client' or 'request'
  entity_id INTEGER NOT NULL,
  category TEXT DEFAULT 'Other',
  original_name TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  uploaded_by TEXT,
  status TEXT DEFAULT 'Uploaded',
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_requests_client ON requests(client_id);
CREATE INDEX IF NOT EXISTS idx_request_inventory_request ON request_inventory(request_id);
CREATE INDEX IF NOT EXISTS idx_request_pricing_request ON request_pricing(request_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
`);

// ---------- Lightweight column migrations ----------
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we check PRAGMA table_info first.
// This runs on every boot but is cheap and keeps existing installs in sync.
function ensureColumn(table, column, definition) {
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

[
  ["client_type", "TEXT"],
  ["client_status", "TEXT DEFAULT 'active'"],
  ["payment_status", "TEXT DEFAULT 'normal'"],
  ["debitor_number", "TEXT"],
  ["reference_number", "TEXT"],
  ["vat_id", "TEXT"],
  ["hrb_number", "TEXT"],
  ["country", "TEXT DEFAULT 'Germany'"],
  ["street", "TEXT"],
  ["house_number", "TEXT"],
  ["zip", "TEXT"],
  ["industry", "TEXT"],
  ["company_size", "TEXT"],
  ["preferred_language", "TEXT"],
  ["internal_rating", "TEXT"]
].forEach(([column, definition]) => ensureColumn("clients", column, definition));

[
  ["request_id", "INTEGER REFERENCES requests(id)"],
  ["location_id", "INTEGER REFERENCES client_locations(id)"]
].forEach(([column, definition]) => ensureColumn("orders", column, definition));

// ---------- Inventory catalog seed ----------
// Materials used for Halteverbot/Absicherung planning (distinct from the public
// storefront `items` catalog). Seeded once, idempotently, on every boot.
const inventoryCatalogCount = db.prepare("SELECT COUNT(*) AS n FROM inventory_catalog").get().n;
if (inventoryCatalogCount === 0) {
  const insertCatalogItem = db.prepare(
    `INSERT INTO inventory_catalog (item_name, category, unit, available_stock, notes) VALUES (?, ?, ?, ?, ?)`
  );
  const seedCatalog = db.transaction(() => {
    [
      ["Halteverbot signs", "Signs", "pcs", 286, "Standard"],
      ["Standsockel", "Base Plates", "pcs", 402, "2 per sign"],
      ["Rohrpfosten", "Poles", "pcs", 138, "Standard"],
      ["Schellen", "Clamps", "pcs", 690, "2 per sign"],
      ["Bakenleuchten", "Warning Lights", "pcs", 64, "If night setup"],
      ["Baken LED", "Baken", "pcs", 31, "For Absicherung"],
      ["Baken unbeleuchtet", "Baken", "pcs", 40, "For Absicherung"],
      ["Absperrschranken", "Barriers", "pcs", 94, "If closure"],
      ["Warning lights", "Warning Lights", "pcs", 50, "For Absicherung"],
      ["Z 123 Arbeitsstelle", "Traffic Signs", "pcs", 20, ""],
      ["Z 531-10 Einengungstafel", "Traffic Signs", "pcs", 10, ""],
      ["Cones", "Cones", "pcs", 120, ""],
      ["Zusatzzeichen date/time", "Signs", "pcs", 150, ""],
      ["Parked vehicle sheet", "Documents", "sheet", 100, "Required"]
    ].forEach(([item_name, category, unit, available_stock, notes]) =>
      insertCatalogItem.run(item_name, category, unit, available_stock, notes)
    );
  });
  seedCatalog();
}

module.exports = db;
