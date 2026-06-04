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
import reorderRoutes from "./routes/inventory/reorder.js";
import { configDotenv } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";
import fs from "fs";
import sharp from "sharp";
import Employee from "./models/hr/employee_model.js";


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
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
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

/* Image Thumbnail Route (Compression) */
app.get("/images/thumb/:folder/:filename", async (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(dir_name, "images", folder, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  try {
    const data = await sharp(filePath)
      .resize(100, 100, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400"); // 1 day cache
    res.send(data);
  } catch (err) {
    console.error("Image processing error:", err);
    res.sendFile(filePath); // Fallback to original
  }
});

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

const getSessionExpiresAt = (req) => {
  const maxAge = Number(req.session?.cookie?.maxAge ?? req.session?.cookie?.originalMaxAge);
  if (Number.isFinite(maxAge) && maxAge > 0) {
    return new Date(Date.now() + maxAge).toISOString();
  }

  const expires = req.session?.cookie?.expires;
  if (expires) {
    const expiresDate = new Date(expires);
    if (!Number.isNaN(expiresDate.getTime())) {
      return expiresDate.toISOString();
    }
  }

  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
};

/* CSRF PROTECTION SETUP */
const csrfProtection = csrf({ cookie: false });

/* FLASH */
app.use(flash());

/* AUTH SESSION EXPIRY HELPERS */
app.use((req, res, next) => {
  if (req.session?.authUser) {
    const sessionExpiresAt = getSessionExpiresAt(req);
    res.locals.sessionExpiresAt = sessionExpiresAt;
    res.setHeader("X-Session-Expires-At", sessionExpiresAt);
  }

  next();
});

/* GLOBAL LOCALS (EARLY) */
app.use((req, res, next) => {
  res.locals.notification = req.session.flash?.notification || [];
  res.locals.error = req.session.flash?.error || [];
  res.locals.authUser = req.session?.authUser || null;
  res.locals.sessionExpiresAt = res.locals.sessionExpiresAt || null;
  res.locals.safeJson = safeJson;

  next();
});

/* Favicon */
app.get("/favicon.ico", (req, res) => res.status(204).end());

/* Session check endpoint – used by client-side polling (exempt from CSRF) */
app.get("/check-session", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.session?.authUser) {
    req.session.touch();
    const expiresAt = getSessionExpiresAt(req);
    res.setHeader("X-Session-Expires-At", expiresAt);
    return res.json({ authenticated: true, expiresAt });
  }
  return res.status(401).json({ authenticated: false });
});

/* Apply CSRF protection to ALL routes EXCEPT login POST */
app.use((req, res, next) => {
  const isLoginPath = req.path.toLowerCase().replace(/\/$/, "") === "/login";
  if (isLoginPath && req.method === "POST") {
    return next();
  }
  csrfProtection(req, res, next);
});
app.use((req, res, next) => {
  res.locals.csrfToken = typeof req.csrfToken === "function" ? req.csrfToken() : "";
  next();
});


/* ROUTES */
const redirectByRole = (role) => {
  if (["admin", "hod", "sales", "hr", "employee"].includes(role)) {
    return "/fairdesk/welcome";
  }
  return "/login";
};

app.get("/", (req, res) => {
  if (req.session?.authUser) {
    return res.redirect(redirectByRole(req.session.authUser.role));
  }
  res.render("auth/login", { title: "Login", CSS: "login.css" });
});

app.get("/login", (req, res) => {
  if (req.session?.authUser) {
    return res.redirect(redirectByRole(req.session.authUser.role));
  }
  res.render("auth/login", { title: "Login", CSS: "login.css" });
});

app.post("/login", loginLimiter, async (req, res) => {
  const { profileCode, username, password } = req.body;
  const loginCode = String(profileCode || username || "").trim();
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;
  const hrUser = process.env.HR_USER;
  const hrPass = process.env.HR_PASS;
  const hodUser = process.env.HOD_USER;
  const hodPass = process.env.HOD_PASS;
  const salesUser = process.env.SALES_USER;
  const salesPass = process.env.SALES_PASS;

  if (!loginCode || !password) {
    return res.status(400).render("auth/login", {
      title: "Login",
      CSS: "login.css",
      profileCode: loginCode,
      password,
      error: ["Please enter your credentials."],
    });
  }

  const isAdmin = adminUser && adminPass && loginCode === adminUser && password === adminPass;
  const isHr = hrUser && hrPass && loginCode === hrUser && password === hrPass;
  const isHod = hodUser && hodPass && loginCode === hodUser && password === hodPass;
  const isSales = salesUser && salesPass && loginCode === salesUser && password === salesPass;

  const processLogin = async (authUser) => {
    req.session.authUser = authUser;
    return req.session.save((err) => {
      if (err) {
        console.error("Failed to persist session on login:", err);
        return res.status(500).render("auth/login", {
          title: "Login",
          CSS: "login.css",
          profileCode: loginCode,
          error: ["Unable to start session. Please try again."],
        });
      }
      return res.redirect(redirectByRole(authUser.role));
    });
  };

  if (isAdmin || isHr || isHod || isSales) {
    const role = isAdmin ? "admin" : isHr ? "hr" : isHod ? "hod" : "sales";
    // Super admins get all permissions for now
    const permissions = { sales: true, inventory: true, hr: true, accounting: true, master: true };
    return processLogin({ username: loginCode, role, permissions, profileCode: loginCode, empName: loginCode });
  }

  const trimmedUser = loginCode;
  const trimmedPass = String(password || "").trim();

  // Fallback to database check
  try {
    const employee = await Employee.findOne({
      empProfileCode: { $regex: new RegExp(`^${trimmedUser}$`, "i") },
      password: trimmedPass,
      isActive: true
    });

    console.log(`[DEBUG] Database login attempt for profile code: "${trimmedUser}". Found: ${employee ? employee.empName : "NULL"}`);

    if (employee) {
      if (employee.role === "none") {
        return res.status(403).render("auth/login", {
          title: "Login",
          CSS: "login.css",
          profileCode: loginCode,
          error: ["Your account is disabled. Please contact admin."],
        });
      }
      return processLogin({ 
        username: employee.empName,
        empName: employee.empName,
        profileCode: employee.empProfileCode,
        role: employee.role || "employee", 
        permissions: employee.permissions,
        empId: employee.empId,
        empPhoto: employee.empPhoto
      });
    }
  } catch (err) {
    console.error("Login database error:", err);
  }

  return res.status(401).render("auth/login", {
    title: "Login",
    CSS: "login.css",
    profileCode: loginCode,
    password,
    error: ["Invalid username or password."],
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("fairdesk.sid");
    res.redirect("/login");
  });
});
const requireAuth = (req, res, next) => {
  if (req.session?.authUser) {
    if (req.session.authUser.role === "none") {
      return res.status(403).render("auth/login", {
        title: "Login",
        CSS: "login.css",
        username: "",
        password: "",
        error: ["Your account is disabled. Please contact admin."],
      });
    }
    return next();
  }
  return res.redirect("/login?reason=session-ended");
};

const hasRoleAccess = (authUser, roleName) => {
  if (!authUser) return false;
  const role = String(authUser.role || "").toLowerCase();
  const permissions = authUser.permissions || {};

  if (roleName === "admin") return role === "admin";
  if (roleName === "hod") return role === "hod";
  if (roleName === "hr") return role === "hr" || Boolean(permissions.hr);
  if (roleName === "sales") return role === "sales" || Boolean(permissions.sales);
  if (roleName === "master") return Boolean(permissions.master);
  if (roleName === "inventory") return Boolean(permissions.inventory);

  return role === roleName;
};

const requireRole = (roles) => (req, res, next) => {
  const authUser = req.session?.authUser;
  if (authUser && roles.some((roleName) => hasRoleAccess(authUser, roleName))) return next();
  
  if (authUser) {
    return res.status(403).send("Forbidden: You do not have permission to access this resource.");
  }
  return res.redirect("/login?reason=session-ended");
};

app.use("/fairdesk/payroll", requireAuth, requireRole(["admin", "hr"]), payrollRoute);

/* PROFILE / ACCOUNT SECURITY - Accessible to all roles */
app.post("/fairdesk/profile/password", requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const authUser = req.session.authUser;

    if (!authUser || !authUser.empId) {
      return res.status(403).json({ success: false, message: "System accounts (managed via configuration) cannot change password via profile modal." });
    }

    const employee = await Employee.findOne({ empId: authUser.empId });
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee record not found." });
    }

    if (employee.password !== oldPassword) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    employee.password = newPassword;
    await employee.save();

    res.json({ success: true, message: "Password updated successfully!" });
  } catch (err) {
    console.error("PASSWORD CHANGE ERROR:", err);
    res.status(500).json({ success: false, message: "Server error during password update." });
  }
});

app.use("/fairdesk/loan", requireAuth, requireRole(["admin", "hr"]), loanRoute);
app.use("/fairdesk/advance", requireAuth, requireRole(["admin", "hr"]), advanceRoute);
app.use("/fairdesk/employee", requireAuth, requireRole(["admin", "hr", "sales"]), employeeRoute);
app.use("/fairdesk/pettycash", requireAuth, requireRole(["admin", "hr", "sales"]), pettycashRoute);



app.use("/fairdesk/client", requireAuth, requireRole(["admin", "hod", "sales", "master"]), clientFormRoute);



app.use("/fairdesk", requireAuth, requireRole(["admin", "hod", "sales", "hr"]), fairdeskRoute);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod", "sales"]), tapeBindingRoutes);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod", "sales"]), posRollBindingRoutes);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod", "sales"]), tafetaBindingRoutes);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod", "sales"]), ttrBindingRoutes);
app.use("/fairdesk", requireAuth, requireRole(["admin", "hod", "sales"]), vendorItemBindingRoutes);
app.use("/fairdesk/tapestock", requireAuth, requireRole(["admin", "hod", "sales"]), tapeStockRoutes);
app.use("/fairdesk/posrollstock", requireAuth, requireRole(["admin", "hod", "sales"]), posRollStockRoutes);
app.use("/fairdesk/tafetastock", requireAuth, requireRole(["admin", "hod", "sales"]), tafetaStockRoutes);
app.use("/fairdesk/ttrstock", requireAuth, requireRole(["admin", "hod", "sales"]), ttrStockRoutes);
app.use("/fairdesk/stocks", requireAuth, requireRole(["admin", "hod", "sales"]), stockViewRoutes);
app.use("/fairdesk/inventory", requireAuth, requireRole(["admin", "hod", "sales"]), reorderRoutes);


/* 404 */
app.all("*", (req, res) => {
  res.status(404).send("404 - Page Not Found");
});

/* ERROR HANDLER */
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    console.warn(`[CSRF] Invalid token on ${req.method} ${req.originalUrl} from ${req.ip}`);
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(403).json({ success: false, message: "Your session ended. Please sign in again." });
    }
    return res.redirect("/login?reason=session-ended");
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
