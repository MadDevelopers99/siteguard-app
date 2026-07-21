require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

const publicRoutes = require("./routes/public");
const priceCalculatorRoutes = require("./routes/price-calculator");
const adminRoutes = require("./routes/admin");
const mainAdminRoutes = require("./routes/main-admin");
const driverRoutes = require("./routes/driver");
const documentsRoutes = require("./routes/admin-documents");
const { requireAnyRole } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
  })
);

app.use("/", publicRoutes);
app.use("/price-calculator", priceCalculatorRoutes);
// Mounted before /admin so it's reachable from Main Admin and Driver sessions too,
// not just Office Admin (see routes/admin-documents.js for the role-aware redirects).
app.use("/admin/documents", requireAnyRole, documentsRoutes);
app.use("/admin", adminRoutes);
app.use("/main-admin", mainAdminRoutes);
app.use("/driver", driverRoutes);

app.use((req, res) => {
  res.status(404).send("Page not found");
});

app.listen(PORT, () => {
  console.log(`SiteGuard app running at http://localhost:${PORT}`);
  console.log(`Office Admin: http://localhost:${PORT}/admin/login`);
  console.log(`Main Admin: http://localhost:${PORT}/main-admin/login`);
  console.log(`Driver: http://localhost:${PORT}/driver/login`);
});
