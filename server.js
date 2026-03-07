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

import session from "express-session";
import flash from "connect-flash";

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
app.use(
  session({
    name: "fairdesk.sid",
    secret: "fairdesk-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // localhost
      sameSite: "lax",
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  }),
);

/* FLASH */
app.use(flash());

/* GLOBAL LOCALS */
app.use((req, res, next) => {
  res.locals.notification = req.session.flash?.notification || [];
  res.locals.error = req.session.flash?.error || [];
  next();
});

/* ROUTES */
app.use("/fairdesk", fairdeskRoute);
app.use("/fairdesk/payroll", payrollRoute);
app.use("/fairdesk/loan", loanRoute);
app.use("/fairdesk/advance", advanceRoute);
app.use("/fairdesk/employee", employeeRoute);
app.use("/fairdesk/pettycash", pettycashRoute);
app.use("/fairdesk", tapeBindingRoutes);
app.use("/fairdesk", posRollBindingRoutes);
app.use("/fairdesk", tafetaBindingRoutes);
app.use("/fairdesk", ttrBindingRoutes);
app.use("/fairdesk/tapestock", tapeStockRoutes);
app.use("/fairdesk/posrollstock", posRollStockRoutes);
app.use("/fairdesk/tafetastock", tafetaStockRoutes);
app.use("/fairdesk/ttrstock", ttrStockRoutes);
app.use("/fairdesk/client", clientFormRoute);

/* 404 */
app.all("*", (req, res) => {
  res.status(404).send("404 - Page Not Found");
});

/* ERROR HANDLER */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).send(err.message || "Something went wrong");
});

/* 192.168.10.170/ */
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://192.168.10.178:${port}`);
});
