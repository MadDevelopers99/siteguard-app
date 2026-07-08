# SiteGuard — Construction Site Barrier & Signage Ordering App

A complete ordering system for a construction-site barrier/signage company:

- **Public website** — clients browse the 100+ item catalog (barriers, fencing,
  signboards, lighting, etc.), add items to an order, and submit it with their
  contact details.
- **Admin panel** — login-protected. Shows every order (from the website *and*
  orders received by email that staff enter manually) in one Excel-like table,
  with client info, status, filtering, search, and a one-click **CSV export**
  that opens directly in Excel.
- **Manual order entry** — when an order arrives by email, the admin can
  register the client (or pick an existing one) and add their order by hand,
  choosing items from the same catalog.

## 1. Requirements

- **Node.js 22.5 or newer** (this app uses Node's built-in SQLite module,
  `node:sqlite`, so there's nothing to compile and no Python/Visual Studio
  build tools needed — just a recent Node version). Check yours with
  `node --version`.
- No external database server needed — it uses SQLite (a single file:
  `db/siteguard.db`), so there is nothing extra to install or configure.
- You'll see a one-line `ExperimentalWarning: SQLite is an experimental
  feature` when the app starts — that's expected and harmless, it's just
  Node telling you this built-in module is relatively new.

## 2. Setup (first time)

```bash
npm install
cp .env.example .env      # then edit .env — see below
npm run seed               # creates the catalog + your first admin login
npm start
```

Open:
- Public site: **http://localhost:3000**
- Admin login: **http://localhost:3000/admin/login**

### Configure your admin login before seeding

Edit `.env` and set:
```
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=a-strong-password
ADMIN_NAME=Your Name
SESSION_SECRET=a-long-random-string
```
Then run `npm run seed`. If you don't set these, it creates a default account
(`admin@siteguard.de` / `ChangeMe123!`) — **change it** by editing the
`admins` table or re-seeding with a new `.env` before going live.

Running `npm run seed` again later is safe — it won't duplicate the admin
account, and it will refresh the catalog if you edit
`data/generate-items.js`.

## 3. Editing the catalog (your 100+ items)

The catalog lives in `data/generate-items.js`, grouped by category
(Mobile Fencing & Barriers, Traffic & Road Barriers, Warning & Regulatory
Signboards, Lighting & Signals, etc.). To add, remove, or reprice items:

1. Edit the arrays in `data/generate-items.js` (`[name, price]` pairs).
2. Run `node data/generate-items.js` to rebuild `data/items.json`.
3. Run `npm run seed` to load the changes into the database.

## 4. How the two order paths work

- **Website order** → a client fills the cart + their details → an order is
  created automatically, the client is registered (or matched by email if
  they've ordered before), and it appears on the admin dashboard tagged
  **"website"**, status **pending**.
- **Email order** → staff go to **Admin → "+ New Order (Email)"**, either pick
  the existing client or register a new one, add the items from the same
  catalog, and save. It appears on the dashboard tagged **"email"**.

Every order — regardless of source — shows up in the same admin table with
full client info (name, company, email, phone, city), status, and total,
just like an Excel sheet. Use **Export to Excel (CSV)** any time to download
the current filtered view as a spreadsheet.

## 5. Order statuses

`pending → confirmed → dispatched → delivered` (or `cancelled`). Change the
status from an order's detail page.

## 6. Deploying it for real use

This app is a normal Node.js/Express app, so it deploys anywhere that runs
Node (Railway, Render, a VPS, etc.):

1. Copy the whole project folder to your server.
2. Set real values in `.env` (`SESSION_SECRET`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`).
3. `npm install --omit=dev && npm run seed && npm start`
4. Put it behind a domain + HTTPS (e.g. via Nginx or the hosting platform's
   built-in TLS) — this is important since login credentials are sent over
   the connection.
5. **Back up `db/siteguard.db` regularly** — it's the entire database (a
   single file makes this easy: just copy it).

For a small team, one server + this SQLite file is plenty. If you later have
many admins working simultaneously at high volume, migrating to Postgres is
a future option, but isn't necessary to launch.

## 7. Project structure

```
server.js                 App entry point
db/database.js            Schema + connection
db/seed.js                 Seeds catalog + admin account
data/generate-items.js     Source list for the 100+ catalog items
routes/public.js           Catalog page + order submission
routes/admin.js             Login, dashboard, manual order entry, clients
middleware/auth.js         Protects /admin routes
views/                      EJS templates (public site + admin panel)
public/                    CSS + client-side JS
```
