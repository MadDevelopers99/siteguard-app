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
  entity_type TEXT NOT NULL, -- 'client', 'request', or 'order'
  entity_id INTEGER NOT NULL,
  category TEXT DEFAULT 'Other',
  original_name TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  uploaded_by TEXT,
  status TEXT DEFAULT 'Uploaded',
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'Available', -- Available, Assigned, On Work, Loading, Unloading, On Break, Sick Leave, Absent, Completed
  current_location TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_operational_planning (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  priority TEXT DEFAULT 'Normal',
  execution_date TEXT,
  setup_date TEXT,
  setup_time TEXT,
  removal_date TEXT,
  removal_time TEXT,
  expected_duration TEXT,
  drivers_needed INTEGER DEFAULT 1,
  vehicle_required TEXT,
  special_equipment TEXT,
  warehouse_prep_needed INTEGER DEFAULT 0,
  route_notes TEXT,
  internal_notes TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_driver_assignment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  primary_driver_id INTEGER REFERENCES drivers(id),
  second_driver_id INTEGER REFERENCES drivers(id),
  vehicle TEXT,
  loading_time TEXT,
  setup_time TEXT,
  removal_time TEXT,
  driver_instructions TEXT,
  driver_checklist TEXT,
  tablet_map_required INTEGER DEFAULT 1,
  documents_visible_to_driver INTEGER DEFAULT 1,
  driver_app_status TEXT DEFAULT 'Not Sent',
  current_location TEXT,
  issue_note TEXT,
  driver_notes TEXT,
  completion_time TEXT,
  completion_status TEXT DEFAULT 'Waiting for Driver Submission',
  signed_by_driver INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  map_status TEXT DEFAULT 'Map Needed',
  sign_points TEXT,
  lines TEXT,
  polygons TEXT,
  work_zone TEXT,
  street_side TEXT,
  setup_confirmed INTEGER DEFAULT 0,
  driver_field_markings TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_name TEXT NOT NULL,
  plate_number TEXT,
  vehicle_type TEXT,
  capacity TEXT,
  assigned_driver_id INTEGER REFERENCES drivers(id),
  fuel_type TEXT,
  insurance_expiry TEXT,
  tuv_expiry TEXT,
  service_date TEXT,
  status TEXT DEFAULT 'Available',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS driver_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  main_driver_id INTEGER NOT NULL REFERENCES drivers(id),
  bifahrer_id INTEGER REFERENCES drivers(id),
  second_bifahrer_id INTEGER REFERENCES drivers(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  date TEXT,
  time_from TEXT,
  time_to TEXT,
  status TEXT DEFAULT 'Planned',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS driver_vacations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL REFERENCES drivers(id),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  vacation_type TEXT DEFAULT 'Annual Leave',
  status TEXT DEFAULT 'Planned',
  replacement_needed INTEGER DEFAULT 0,
  replacement_driver_id INTEGER REFERENCES drivers(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS driver_absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL REFERENCES drivers(id),
  absence_type TEXT DEFAULT 'Sick Leave',
  date_from TEXT NOT NULL,
  date_to TEXT,
  full_day INTEGER DEFAULT 1,
  reason TEXT,
  document_required INTEGER DEFAULT 0,
  document_uploaded INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS driver_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  note_type TEXT DEFAULT 'General Note',
  note_text TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  is_private INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS driver_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  changed_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES drivers(id),
  issue_type TEXT DEFAULT 'Other',
  priority TEXT DEFAULT 'Normal',
  description TEXT,
  location TEXT,
  status TEXT DEFAULT 'Open', -- Open, Resolved
  driver_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_issues_order ON task_issues(order_id);

CREATE TABLE IF NOT EXISTS parked_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES drivers(id),
  plate_number TEXT,
  vehicle_color TEXT,
  vehicle_brand TEXT,
  vehicle_model TEXT,
  tyre_direction_hour TEXT,
  tyre_direction_angle REAL,
  manual_correction_required INTEGER DEFAULT 0,
  driver_note TEXT,
  status TEXT DEFAULT 'Draft', -- Draft, Saved, Submitted
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parked_vehicles_order ON parked_vehicles(order_id);

-- ---------- Main Inventory ----------

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory_catalog(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL, -- 'in', 'out', 'adjustment'
  quantity REAL NOT NULL,
  date TEXT DEFAULT (datetime('now')),
  source_type TEXT,
  source_reference TEXT,
  reason TEXT,
  storage_location TEXT,
  created_by TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS damaged_missing_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory_catalog(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'Damaged', -- Damaged, Missing, Lost, Broken, Stolen, Disposed
  quantity REAL NOT NULL,
  source TEXT,
  date TEXT DEFAULT (datetime('now')),
  reported_by TEXT,
  reason TEXT,
  repairable INTEGER DEFAULT 0,
  replacement_needed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Open',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_date TEXT DEFAULT (datetime('now')),
  storage_location TEXT,
  counted_by TEXT,
  approved_by TEXT,
  status TEXT DEFAULT 'In Progress', -- In Progress, Pending Approval, Approved, Closed
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_catalog(id),
  system_qty REAL,
  counted_qty REAL,
  difference REAL,
  action TEXT
);

-- ---------- Purchase & Sell-to-SG ----------

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  vat_id TEXT,
  payment_terms TEXT,
  category TEXT,
  notes TEXT,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  order_date TEXT DEFAULT (datetime('now')),
  expected_delivery_date TEXT,
  payment_terms TEXT,
  supplier_invoice_number TEXT,
  delivery_address TEXT,
  created_by TEXT,
  status TEXT DEFAULT 'Draft',
  net_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  gross_amount REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  supplier_article_no TEXT,
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL,
  net_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gr_number TEXT UNIQUE NOT NULL,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  received_date TEXT DEFAULT (datetime('now')),
  received_by TEXT,
  delivery_note_number TEXT,
  condition TEXT,
  storage_location TEXT,
  status TEXT DEFAULT 'Complete', -- Partial, Complete
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goods_receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id INTEGER REFERENCES purchase_order_items(id),
  item_name TEXT NOT NULL,
  ordered_qty REAL,
  received_qty REAL NOT NULL,
  difference REAL DEFAULT 0,
  condition TEXT DEFAULT 'Good'
);

CREATE TABLE IF NOT EXISTS wholesale_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT UNIQUE NOT NULL,
  po_id INTEGER REFERENCES purchase_orders(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  item_name TEXT NOT NULL,
  purchase_date TEXT DEFAULT (datetime('now')),
  purchased_qty REAL NOT NULL,
  available_qty REAL NOT NULL,
  purchase_unit_cost REAL DEFAULT 0,
  landed_cost REAL DEFAULT 0,
  internal_sg_sell_price REAL DEFAULT 0,
  storage_location TEXT,
  status TEXT DEFAULT 'Available',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS internal_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_number TEXT UNIQUE NOT NULL,
  sale_date TEXT DEFAULT (datetime('now')),
  selling_unit TEXT DEFAULT 'Purchase & Sell-to-SG',
  buying_unit_sg TEXT DEFAULT 'SG Main Stock',
  reference_number TEXT,
  net_amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  gross_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'Draft',
  created_by TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS internal_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  internal_sale_id INTEGER NOT NULL REFERENCES internal_sales(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES wholesale_batches(id),
  item_name TEXT NOT NULL,
  qty_sold REAL NOT NULL,
  internal_unit_price REAL NOT NULL,
  net_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS price_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_name TEXT NOT NULL,
  item_category TEXT,
  calculation_method TEXT DEFAULT 'Fixed markup %',
  markup_pct REAL,
  fixed_fee REAL,
  fixed_price REAL,
  minimum_price REAL,
  valid_from TEXT,
  valid_to TEXT,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_requests_client ON requests(client_id);
CREATE INDEX IF NOT EXISTS idx_request_inventory_request ON request_inventory(request_id);
CREATE INDEX IF NOT EXISTS idx_request_pricing_request ON request_pricing(request_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_driver_teams_main ON driver_teams(main_driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_vacations_driver ON driver_vacations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_absences_driver ON driver_absences(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_notes_driver ON driver_notes(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_history_driver ON driver_history(driver_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_damaged_missing_item ON damaged_missing_records(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(stock_count_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_gr ON goods_receipt_items(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_internal_sale_items_sale ON internal_sale_items(internal_sale_id);
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
  ["till_street", "TEXT"],
  ["till_house_number", "TEXT"]
].forEach(([column, definition]) => ensureColumn("client_locations", column, definition));

[
  ["request_id", "INTEGER REFERENCES requests(id)"],
  ["location_id", "INTEGER REFERENCES client_locations(id)"],
  ["main_admin_status", "TEXT DEFAULT 'Received from Office Admin'"],
  ["return_reason", "TEXT"],
  ["return_note", "TEXT"],
  ["payment_status", "TEXT DEFAULT 'Unpaid'"]
].forEach(([column, definition]) => ensureColumn("orders", column, definition));

[["role", "TEXT DEFAULT 'office_admin'"]].forEach(([column, definition]) =>
  ensureColumn("admins", column, definition)
);

[
  ["first_name", "TEXT"],
  ["last_name", "TEXT"],
  ["address", "TEXT"],
  ["city", "TEXT"],
  ["postal_code", "TEXT"],
  ["emergency_contact_name", "TEXT"],
  ["emergency_contact_phone", "TEXT"],
  ["role", "TEXT DEFAULT 'Driver'"],
  ["employment_type", "TEXT DEFAULT 'Full-time'"],
  ["start_date", "TEXT"],
  ["work_area", "TEXT"],
  ["preferred_work_days", "TEXT"],
  ["can_drive_vehicle", "INTEGER DEFAULT 1"],
  ["can_work_as_bifahrer", "INTEGER DEFAULT 1"],
  ["can_lead_team", "INTEGER DEFAULT 0"],
  ["can_work_night_shift", "INTEGER DEFAULT 0"],
  ["can_work_weekend", "INTEGER DEFAULT 0"],
  ["availability_from", "TEXT"],
  ["availability_until", "TEXT"],
  ["assigned_vehicle_id", "INTEGER REFERENCES vehicles(id)"],
  ["is_active", "INTEGER DEFAULT 1"]
].forEach(([column, definition]) => ensureColumn("drivers", column, definition));

[
  ["article_number", "TEXT"],
  ["barcode", "TEXT"],
  ["subcategory", "TEXT"],
  ["description", "TEXT"],
  ["reserved_qty", "REAL DEFAULT 0"],
  ["damaged_qty", "REAL DEFAULT 0"],
  ["missing_qty", "REAL DEFAULT 0"],
  ["minimum_stock", "REAL DEFAULT 0"],
  ["maximum_stock", "REAL"],
  ["storage_location", "TEXT"],
  ["average_purchase_price", "REAL"],
  ["replacement_cost", "REAL"],
  ["usage_price", "REAL"],
  ["main_supplier_id", "INTEGER REFERENCES suppliers(id)"],
  ["status", "TEXT DEFAULT 'Available'"],
  ["is_active", "INTEGER DEFAULT 1"]
].forEach(([column, definition]) => ensureColumn("inventory_catalog", column, definition));

[
  ["main_admin_approved_qty", "REAL"],
  ["main_admin_status", "TEXT DEFAULT 'Pending Review'"],
  ["issued_qty", "REAL"],
  ["used_qty", "REAL"],
  ["returned_qty", "REAL"],
  ["damaged_qty", "REAL"],
  ["missing_qty", "REAL"],
  ["final_status", "TEXT"],
  ["loaded_qty", "REAL"],
  ["picked_qty", "REAL"]
].forEach(([column, definition]) => ensureColumn("request_inventory", column, definition));

[
  ["task_type", "TEXT DEFAULT 'Setup / Deployment'"],
  ["inventory_mode", "TEXT DEFAULT 'Loading Required'"],
  ["reject_reason", "TEXT"],
  ["stop_order", "INTEGER"],
  ["route_approved", "INTEGER DEFAULT 0"],
  ["work_started_at", "TEXT"],
  ["work_completed_at", "TEXT"]
].forEach(([column, definition]) => ensureColumn("order_driver_assignment", column, definition));

[["gps_location", "TEXT"]].forEach(([column, definition]) => ensureColumn("documents", column, definition));

// Raw OCR read of the rear-photo plate number, kept separately from
// plate_number so the edit page can tell "auto-detected, please verify"
// apart from a driver's own manual entry/correction.
[["plate_number_ocr_raw", "TEXT"]].forEach(([column, definition]) => ensureColumn("parked_vehicles", column, definition));

// ---------- Time Tracking portal (standalone, own accounts) ----------
// This is a fully separate portal (own login at /time/login, own account
// table) from the Admin/Main Admin/Driver systems — not gated by any of
// their sessions. Project is deliberately separate from requests/orders:
// it's an ongoing bucket under a Customer (clients) that time accumulates
// against over weeks, unlike the one-off single-visit Auftrag pipeline.
db.exec(`
CREATE TABLE IF NOT EXISTS time_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Active',
  budget_hours REAL,
  hourly_rate REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_user_id INTEGER NOT NULL REFERENCES time_users(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  service_id INTEGER REFERENCES services(id),
  description TEXT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_minutes INTEGER,
  is_manual INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(time_user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
`);

// ---------- Time Tracking: GIS / Ops extension ----------
// New tables are prefixed time_ (matching time_users/time_entries) to keep
// this domain explicitly decoupled from drivers/vehicles/orders. FKs only
// ever point at projects/time_users/services — never at drivers/admins/orders.
db.exec(`
CREATE TABLE IF NOT EXISTS time_geofences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_meters REAL DEFAULT 150,
  check_in_required INTEGER DEFAULT 0,
  arrival_behavior TEXT DEFAULT 'Notify only',
  departure_behavior TEXT DEFAULT 'Notify only',
  retention_days INTEGER DEFAULT 90,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  assigned_time_user_id INTEGER REFERENCES time_users(id),
  title TEXT NOT NULL,
  instructions TEXT,
  checklist TEXT,
  status TEXT DEFAULT 'Unassigned',
  scheduled_date TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  lat REAL,
  lng REAL,
  stop_order INTEGER,
  signature_data TEXT,
  completion_notes TEXT,
  completed_at TEXT,
  completed_by INTEGER REFERENCES time_users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_user_id INTEGER NOT NULL REFERENCES time_users(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_geofence_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geofence_id INTEGER NOT NULL REFERENCES time_geofences(id) ON DELETE CASCADE,
  time_user_id INTEGER NOT NULL REFERENCES time_users(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES time_jobs(id),
  event_type TEXT NOT NULL,
  lat REAL,
  lng REAL,
  accuracy REAL,
  occurred_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_user_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_user_id INTEGER NOT NULL REFERENCES time_users(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE(time_user_id, service_id)
);

CREATE TABLE IF NOT EXISTS time_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  asset_type TEXT,
  project_id INTEGER REFERENCES projects(id),
  serial_number TEXT,
  status TEXT DEFAULT 'Active',
  lat REAL,
  lng REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_asset_maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES time_assets(id) ON DELETE CASCADE,
  date TEXT DEFAULT (datetime('now')),
  description TEXT NOT NULL,
  performed_by TEXT,
  cost REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  config TEXT,
  status TEXT DEFAULT 'not_configured',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_day_off (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time_user_id INTEGER NOT NULL REFERENCES time_users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(time_user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_time_geofences_project ON time_geofences(project_id);
CREATE INDEX IF NOT EXISTS idx_time_jobs_project ON time_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_time_jobs_assigned ON time_jobs(assigned_time_user_id);
CREATE INDEX IF NOT EXISTS idx_time_jobs_date ON time_jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_time_locations_user ON time_locations(time_user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_time_geofence_events_geofence ON time_geofence_events(geofence_id);
CREATE INDEX IF NOT EXISTS idx_time_geofence_events_user ON time_geofence_events(time_user_id);
CREATE INDEX IF NOT EXISTS idx_time_assets_project ON time_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_time_day_off_user ON time_day_off(time_user_id, date);
`);

[["is_admin", "INTEGER DEFAULT 0"], ["phone", "TEXT"]].forEach(([column, definition]) =>
  ensureColumn("time_users", column, definition)
);

[
  ["job_id", "INTEGER REFERENCES time_jobs(id)"],
  ["status", "TEXT DEFAULT 'Approved'"],
  ["approved_by", "INTEGER REFERENCES time_users(id)"],
  ["approved_at", "TEXT"],
  ["check_in_lat", "REAL"],
  ["check_in_lng", "REAL"],
  ["check_in_accuracy", "REAL"],
  ["location_verified", "INTEGER DEFAULT 0"],
  ["client_ref", "TEXT"]
].forEach(([column, definition]) => ensureColumn("time_entries", column, definition));

[["lat", "REAL"], ["lng", "REAL"]].forEach(([column, definition]) => ensureColumn("clients", column, definition));

[["service_id", "INTEGER REFERENCES services(id)"]].forEach(([column, definition]) =>
  ensureColumn("time_jobs", column, definition)
);

// ---------- Time Tracking admin account seed ----------
const timeAdminCount = db.prepare("SELECT COUNT(*) AS n FROM time_users WHERE is_admin = 1").get().n;
if (timeAdminCount === 0) {
  const bcrypt = require("bcryptjs");
  const email = process.env.TIME_ADMIN_EMAIL || "timeadmin@siteguard.de";
  const password = process.env.TIME_ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.TIME_ADMIN_NAME || "Time Tracking Admin";
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO time_users (email, password_hash, name, is_admin) VALUES (?, ?, ?, 1)").run(email, hash, name);
  console.log(`Created Time Tracking admin account -> email: ${email} / password: ${password}`);
}

// ---------- Time Tracking integrations seed ----------
const timeIntegrationsCount = db.prepare("SELECT COUNT(*) AS n FROM time_integrations").get().n;
if (timeIntegrationsCount === 0) {
  const insertIntegration = db.prepare(
    "INSERT INTO time_integrations (provider_key, display_name) VALUES (?, ?)"
  );
  [
    ["clockodo", "Clockodo"],
    ["clockin", "clockin"],
    ["arcgis", "ArcGIS"],
    ["qgis_postgis", "QGIS / PostGIS"],
    ["xero_datev", "Xero / DATEV"],
    ["google_calendar", "Google Calendar"],
    ["slack_teams", "Slack / Teams"],
    ["zapier_make", "Zapier / Make"],
    ["rest_api", "REST API + Webhooks"]
  ].forEach(([key, name]) => insertIntegration.run(key, name));
}

// ---------- Main Admin account seed ----------
// Idempotent, same pattern as the inventory catalog seed below: creates a second
// admin role ("main_admin") on first boot if one doesn't already exist.
const mainAdminCount = db.prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'main_admin'").get().n;
if (mainAdminCount === 0) {
  const bcrypt = require("bcryptjs");
  const email = process.env.MAIN_ADMIN_EMAIL || "mainadmin@siteguard.de";
  const password = process.env.MAIN_ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.MAIN_ADMIN_NAME || "Main Admin";
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO admins (email, password_hash, name, role) VALUES (?, ?, ?, 'main_admin')").run(
    email,
    hash,
    name
  );
  console.log(`Created Main Admin account -> email: ${email} / password: ${password}`);
}

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
