require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./database");
const items = require("../data/items.json");

function seedItems() {
  const insert = db.prepare(`
    INSERT INTO items (sku, name, category, price, unit, description)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(sku) DO UPDATE SET
      name=excluded.name, category=excluded.category,
      price=excluded.price, description=excluded.description
  `);
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row.sku, row.name, row.category, row.price, row.unit, row.description);
    }
  });
  insertMany(items);
  console.log(`Seeded ${items.length} catalog items.`);
}

function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@siteguard.de";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.ADMIN_NAME || "Site Admin";

  const existing = db.prepare("SELECT id FROM admins WHERE email = ?").get(email);
  if (existing) {
    console.log(`Admin account already exists: ${email}`);
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)"
  ).run(email, hash, name);
  console.log(`Created admin account -> email: ${email} / password: ${password}`);
  console.log("IMPORTANT: change this password after first login (or set ADMIN_EMAIL / ADMIN_PASSWORD in .env before seeding).");
}

seedItems();
seedAdmin();
