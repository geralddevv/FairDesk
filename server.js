import express from "express";
import compression from "compression";
import ejsMate from "ejs-mate";
import connectDB from "./config/db.js";
import fairdeskRoute from "./routes/fairdesk_route.js";
import payrollRoute from "./routes/acccounting/payroll.js";
import loanRoute from "./routes/acccounting/loan.js";
import advanceRoute from "./routes/acccounting/advance.js";
import employeeRoute from "./routes/hr/employee.js";
import pettycashRoute from "./routes/acccounting/pettycash.js";
import tapeBindingRoutes from "./routes/inventory/tapeBinding.js";
import tapeStockRoutes from "./routes/stock/tapeStock.js";
import posRollStockRoutes from "./routes/stock/posRollStock.js";
import tafetaStockRoutes from "./routes/stock/tafetaStock.js";
import ttrStockRoutes from "./routes/stock/ttrStock.js";
import clientFormRoute from "./routes/users/clients.js";
import posRollBindingRoutes from "./routes/inventory/posRollBinding.js";
import tafetaBindingRoutes from "./routes/inventory/tafetaBinding.js";
import ttrBindingRoutes from "./routes/inventory/ttrBinding.js";
import { configDotenv } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

import session from "express-session";
import flash from "connect-flash";
import MongoSessionStore from "./utils/mongoSessionStore.js";

const app = express();
const port = 3000;

/* ENV + DB */
configDotenv({ quiet: true });
connectDB();

/* PATH SETUP */
const file_name = fileURLToPath(import.meta.url);
const dir_name = path.dirname(file_name);

/* VIEW ENGINE */
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(dir_name, "views"));

/* GZIP COMPRESSION */
app.use(compression());

/* BODY PARSERS */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* STATIC (1-day browser cache) */
app.use(express.static(path.join(dir_name, "public"), { maxAge: "1d" }));
app.use("/bootstrap", express.static(dir_name + "/node_modules/bootstrap/dist", { maxAge: "1d" }));

app.use("/images", express.static("images", { maxAge: "1d" }));

/* SESSION (THIS IS THE KEY) */
const sessionStore = new MongoSessionStore({
  ttlMs: 1000 * 60 * 60 * 4,
});

app.use(
  session({
    name: "fairdesk.sid",
    secret: "fairdesk-secret-key",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: false, // localhost
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 4, // 4 hours
    },
  }),
);

/* FLASH */
app.use(flash());

/* GLOBAL LOCALS */
app.use((req, res, next) => {
  res.locals.notification = req.session.flash?.notification || [];
  res.locals.error = req.session.flash?.error || [];
  res.locals.authUser = req.session?.authUser || null;
  next();
});

/* ROUTES */
app.get("/", (req, res) => {
  if (req.session?.authUser) {
    const role = req.session.authUser.role;
    if (role === "hr") return res.redirect("/fairdesk/employee/view");
    if (role === "sales") return res.redirect("/fairdesk/sales/order");
    return res.redirect("/fairdesk/master/view");
  }
  res.render("auth/login", { title: "Login", CSS: "login.css" });
});

app.get("/login", (req, res) => {
  if (req.session?.authUser) {
    const role = req.session.authUser.role;
    if (role === "hr") return res.redirect("/fairdesk/employee/view");
    if (role === "sales") return res.redirect("/fairdesk/sales/order");
    return res.redirect("/fairdesk/master/view");
  }
  res.render("auth/login", { title: "Login", CSS: "login.css" });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;
  const hrUser = process.env.HR_USER;
  const hrPass = process.env.HR_PASS;
  const hodUser = process.env.HOD_USER;
  const hodPass = process.env.HOD_PASS;
  const salesUser = process.env.SALES_USER;
  const salesPass = process.env.SALES_PASS;

  if (!username || !password) {
    return res.status(400).render("auth/login", {
      title: "Login",
      CSS: "login.css",
      username,
      password,
      error: ["Please enter your credentials."],
    });
  }

  const isAdmin = adminUser && adminPass && username === adminUser && password === adminPass;
  const isHr = hrUser && hrPass && username === hrUser && password === hrPass;
  const isHod = hodUser && hodPass && username === hodUser && password === hodPass;
  const isSales = salesUser && salesPass && username === salesUser && password === salesPass;

  if (!isAdmin && !isHr && !isHod && !isSales) {
    return res.status(401).render("auth/login", {
      title: "Login",
      CSS: "login.css",
      username,
      password,
      error: ["Invalid username or password."],
    });
  }

  const role = isAdmin ? "admin" : isHr ? "hr" : isHod ? "hod" : "sales";
  req.session.authUser = { username, role };
  if (role === "hr") return res.redirect("/fairdesk/employee/view");
  if (role === "sales") return res.redirect("/fairdesk/sales/order");
  return res.redirect("/fairdesk/master/view");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("fairdesk.sid");
    res.redirect("/login");
  });
});

const requireAuth = (req, res, next) => {
  if (req.session?.authUser) return next();
  return res.redirect("/login");
};

const requireRole = (roles) => (req, res, next) => {
  const role = req.session?.authUser?.role;
  if (roles.includes(role)) return next();
  return res.redirect("/login");
};

app.use("/fairdesk/payroll", requireAuth, requireRole(["admin", "hr"]), payrollRoute);
app.use("/fairdesk/loan", requireAuth, requireRole(["admin", "hr"]), loanRoute);
app.use("/fairdesk/advance", requireAuth, requireRole(["admin", "hr"]), advanceRoute);
app.use("/fairdesk/employee", requireAuth, requireRole(["admin", "hr"]), employeeRoute);
app.use("/fairdesk/pettycash", requireAuth, requireRole(["admin", "hr"]), pettycashRoute);

app.use("/fairdesk", requireAuth, requireRole(["admin", "hod", "sales"]), fairdeskRoute);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod"]), tapeBindingRoutes);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod"]), posRollBindingRoutes);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod"]), tafetaBindingRoutes);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod"]), ttrBindingRoutes);
app.use("/fairdesk/tapestock", requireAuth, requireRole(["admin", "hod", "sales"]), tapeStockRoutes);
app.use("/fairdesk/posrollstock", requireAuth, requireRole(["admin", "hod", "sales"]), posRollStockRoutes);
app.use("/fairdesk/tafetastock", requireAuth, requireRole(["admin", "hod", "sales"]), tafetaStockRoutes);
app.use("/fairdesk/ttrstock", requireAuth, requireRole(["admin", "hod", "sales"]), ttrStockRoutes);
app.use("/fairdesk/client", requireAuth, requireRole(["admin", "hod", "sales"]), clientFormRoute);

/* 404 */
app.all("*", (req, res) => {
  res.status(404).send("404 - Page Not Found");
});

/* ERROR HANDLER */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).send(err.message || "Something went wrong");
});

/* Get dynamic IP address */
const networkInterfaces = os.networkInterfaces();
const ip =
  Object.values(networkInterfaces)
    .flat()
    .find((info) => info.family === "IPv4" && !info.internal)?.address || "localhost";

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://${ip}:${port}`);
});
