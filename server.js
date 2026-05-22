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
import stockViewRoutes from "./routes/stock/stockView.js";
import clientFormRoute from "./routes/users/clients.js";
import posRollBindingRoutes from "./routes/inventory/posRollBinding.js";
import tafetaBindingRoutes from "./routes/inventory/tafetaBinding.js";
import ttrBindingRoutes from "./routes/inventory/ttrBinding.js";
import vendorItemBindingRoutes from "./routes/inventory/vendorItemBinding.js";
import { configDotenv } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

import session from "express-session";
import flash from "connect-flash";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import csrf from "csurf";
import cookieParser from "cookie-parser";
import MongoSessionStore from "./utils/mongoSessionStore.js";
import { safeJson } from "./utils/security.js";

const app = express();
const port = 3000;

/* ENV + DB */
configDotenv({ quiet: true });
connectDB();

/* SECURITY MIDDLEWARE (HELMET) */
app.use(
  helmet({
    contentSecurityPolicy: false, // Temporarily disable to troubleshoot layout issues
    crossOriginEmbedderPolicy: false,
  }),
);

/* RATE LIMITING */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login requests per window
  message: "Too many login attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

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
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
// app.use(cookieParser()); // Redundant and can interfere with express-session

/* STATIC FILES */
app.use(express.static(path.join(dir_name, "public"), { maxAge: "1d" }));
app.use("/bootstrap", express.static(dir_name + "/node_modules/bootstrap/dist", { maxAge: "1d" }));
app.use("/images", express.static("images", { maxAge: "1d" }));

/* SESSION */
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes 

const sessionStore = new MongoSessionStore({
  ttlMs: SESSION_TTL_MS,
});

app.use(
  session({
    name: "fairdesk.sid",
    secret: process.env.SESSION_SECRET || "fd_k9#xP2$mR9Qz7wL5vN8uY3hB1jK4_production_fallback",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_MS, 
    },
  }),
);

/* CSRF PROTECTION SETUP */
const csrfProtection = csrf({ cookie: false });

/* FLASH */
app.use(flash());

/* GLOBAL LOCALS (EARLY) */
app.use((req, res, next) => {
  res.locals.notification = req.session.flash?.notification || [];
  res.locals.error = req.session.flash?.error || [];
  res.locals.authUser = req.session?.authUser || null;
  res.locals.sessionExpiresAt = req.session?.cookie?.expires ? new Date(req.session.cookie.expires).toISOString() : null;
  res.locals.safeJson = safeJson;

  next();
});

/* Favicon */
app.get("/favicon.ico", (req, res) => res.status(204).end());

/* Session check endpoint – used by client-side polling (exempt from CSRF) */
app.get("/check-session", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.session?.authUser) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false });
});

/* Apply CSRF protection to ALL routes EXCEPT login POST */
app.use((req, res, next) => {
  if (req.path === "/login" && req.method === "POST") {
    return next();
  }
  csrfProtection(req, res, next);
});
app.use((req, res, next) => {
  res.locals.csrfToken = typeof req.csrfToken === "function" ? req.csrfToken() : "";
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
    const remaining = req.session.cookie.maxAge;
    // LOOP BREAKER: If session is about to expire (less than 1 minute), 
    // force logout instead of redirecting back to dashboard.
    if (!remaining || remaining < 60000) {
       return res.redirect("/logout");
    }

    const role = req.session.authUser.role;
    if (role === "hr") return res.redirect("/fairdesk/employee/view");
    if (role === "sales") return res.redirect("/fairdesk/sales/order");
    return res.redirect("/fairdesk/master/view");
  }
  res.render("auth/login", { title: "Login", CSS: "login.css" });
});

const redirectByRole = (role) => {
  if (role === "hr") return "/fairdesk/employee/view";
  if (role === "sales") return "/fairdesk/sales/order";
  return "/fairdesk/master/view";
};

app.post("/login", loginLimiter, (req, res) => {
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
  return req.session.save((err) => {
    if (err) {
      console.error("Failed to persist session on login:", err);
      return res.status(500).render("auth/login", {
        title: "Login",
        CSS: "login.css",
        username,
        error: ["Unable to start session. Please try again."],
      });
    }

    return res.redirect(redirectByRole(role));
  });
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
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod"]), vendorItemBindingRoutes);
app.use("/fairdesk/tapestock", requireAuth, requireRole(["admin", "hod", "sales"]), tapeStockRoutes);
app.use("/fairdesk/posrollstock", requireAuth, requireRole(["admin", "hod", "sales"]), posRollStockRoutes);
app.use("/fairdesk/tafetastock", requireAuth, requireRole(["admin", "hod", "sales"]), tafetaStockRoutes);
app.use("/fairdesk/ttrstock", requireAuth, requireRole(["admin", "hod", "sales"]), ttrStockRoutes);
app.use("/fairdesk/stocks", requireAuth, requireRole(["admin", "hod", "sales"]), stockViewRoutes);
app.use("/fairdesk/client", requireAuth, requireRole(["admin", "hod", "sales"]), clientFormRoute);

/* 404 */
app.all("*", (req, res) => {
  res.status(404).send("404 - Page Not Found");
});

/* ERROR HANDLER */
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    console.warn(`[CSRF] Invalid token on ${req.method} ${req.originalUrl} from ${req.ip}`);
    return res.status(403).send("Form tampered or session expired. Please refresh.");
  }
  console.error("[Error Handler]", err);
  const status = err.statusCode || 500;
  const message = status === 500 && process.env.NODE_ENV === "production" ? "Something went wrong" : err.message;
  res.status(status).send(message);
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
