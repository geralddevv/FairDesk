import express from "express";
import Employee from "../../models/hr/employee_model.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

/* ================= MULTER STORAGE (MULTIPLE FILE TYPES) ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "empPhoto") {
      cb(null, "images/empimg");
    } else if (file.fieldname === "empAadhaarImg") {
      cb(null, "images/aadhaar");
    } else if (file.fieldname === "empPanImg") {
      cb(null, "images/pan");
    } else {
      cb(new Error("Invalid upload field"));
    }
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

/* ================= CREATE EMPLOYEE FORM ================= */
router.get("/create", async (req, res) => {
  const employeeCount = (await Employee.countDocuments()) + 1;

  res.render("hr/employee.ejs", {
    title: "Employee Details",
    CSS: false,
    JS: false,
    employeeCount,
    employee: null,
    notification: req.flash("notification"),
  });
});

/* ================= EMPLOYEE LIST ================= */
router.get("/view", async (req, res) => {
  const jsonData = await Employee.find();

  res.render("hr/employeeDisp.ejs", {
    jsonData,
    title: "Employee View",
    CSS: "tableDisp.css",
    JS: false,
    notification: req.flash("notification"),
  });
});

/* ================= CREATE EMPLOYEE ================= */
router.post(
  "/form",
  upload.fields([
    { name: "empPhoto", maxCount: 1 },
    { name: "empAadhaarImg", maxCount: 1 },
    { name: "empPanImg", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const employeeData = {
        ...req.body,
        empPhoto: req.files?.empPhoto?.[0]?.filename || null,
        empAadhaarImg: req.files?.empAadhaarImg?.[0]?.filename || null,
        empPanImg: req.files?.empPanImg?.[0]?.filename || null,
      };

      await Employee.create(employeeData);

      req.flash("notification", "Employee created successfully!");
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        res.json({ success: true, redirect: "/fairdesk/employee/create" });
      } else {
        res.redirect("/fairdesk/employee/create");
      }
    } catch (err) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

/* ================= EMPLOYEE PROFILE VIEW ================= */
router.get("/profile/:id", async (req, res) => {
  const employee = await Employee.findById(req.params.id).lean();
  if (!employee) return res.status(404).send("Employee not found");

  res.render("hr/employeeView.ejs", { employee });
});

/* ================= FETCH EMPLOYEE JSON ================= */
router.get("/:id", async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id).lean();
    if (!emp) return res.status(404).json(null);
    res.json(emp);
  } catch {
    res.status(500).json(null);
  }
});

/* ================= EDIT FORM ================= */
router.get("/edit/:id", async (req, res) => {
  const employee = await Employee.findById(req.params.id).lean();
  if (!employee) return res.redirect("back");

  res.render("hr/employee.ejs", {
    title: "Edit Employee",
    CSS: false,
    JS: false,
    employee,
    employeeCount: null,
  });
});

/* ================= UPDATE EMPLOYEE ================= */
router.post(
  "/edit/:id",
  upload.fields([
    { name: "empPhoto", maxCount: 1 },
    { name: "empAadhaarImg", maxCount: 1 },
    { name: "empPanImg", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const emp = await Employee.findById(req.params.id);
      if (!emp) return res.status(400).json({ success: false, message: "Employee not found" });

      const replaceFile = (field, folder) => {
        if (req.files?.[field]) {
          if (emp[field]) {
            const oldPath = `images/${folder}/${emp[field]}`;
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          emp[field] = req.files[field][0].filename;
        }
      };

      replaceFile("empPhoto", "empimg");
      replaceFile("empAadhaarImg", "aadhaar");
      replaceFile("empPanImg", "pan");

      Object.assign(emp, req.body);
      await emp.save();

      req.flash("notification", "Employee updated successfully!");
      const redirectUrl = "/fairdesk/employee/view";
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        res.json({ success: true, redirect: redirectUrl });
      } else {
        res.redirect(redirectUrl);
      }
    } catch (err) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  },
);

export default router;
