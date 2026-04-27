import express from "express";
import mongoose from "mongoose";
import Employee from "../../models/hr/employee_model.js";
import Advance from "../../models/accounting/Advance.js";
import AdvanceLog from "../../models/accounting/AdvanceLog.js";

const router = express.Router();

/* SHOW ADVANCE FORM */
router.get("/create", async (req, res) => {
  const employees = await Employee.find({ isActive: true });

  res.render("accounting/advance", {
    employees,
    CSS: false,
    JS: false,
    title: "Advance",
    navigator: "advance",
    notification: req.flash("notification"),
    error: req.flash("error"),
  });
});

/* ADD / UPDATE ADVANCE (WITH 100% RULE + LOGS) */
router.post("/create", async (req, res) => {
  try {
    const { employeeId, advanceAmount } = req.body;
    const amount = Number(advanceAmount) || 0;

    if (!employeeId || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid advance amount" });
    }

    const empObjectId = new mongoose.Types.ObjectId(employeeId);

    /* FETCH EMPLOYEE */
    const emp = await Employee.findById(empObjectId);
    if (!emp) {
      return res.status(400).json({ success: false, message: "Employee not found" });
    }

    /* 100% ADVANCE LIMIT */
    const maxAllowedAdvance = emp.basicSalary * 1;

    /* FETCH EXISTING ADVANCE */
    let advance = await Advance.findOne({ employee: empObjectId });
    const currentBalance = advance?.currentBalance || 0;

    /* LIMIT CHECK */
    if (currentBalance + amount > maxAllowedAdvance) {
      return res
        .status(400)
        .json({ success: false, message: `Advance limit exceeded. Max allowed is ₹${maxAllowedAdvance}` });
    }

    /* CREATE NEW ADVANCE */
    if (!advance) {
      const newAdvance = await Advance.create({
        employee: empObjectId,
        currentBalance: amount,
        status: "ACTIVE",
      });

      await AdvanceLog.create({
        employee: empObjectId,
        advance: newAdvance._id,
        openingBalance: 0,
        amount,
        closingBalance: amount,
        type: "CREDIT",
        source: "MANUAL",
      });
    } else {
    /* UPDATE EXISTING ADVANCE */
      const openingBalance = advance.currentBalance;
      const closingBalance = openingBalance + amount;

      advance.currentBalance = closingBalance;
      advance.status = "ACTIVE";
      await advance.save();

      await AdvanceLog.create({
        employee: empObjectId,
        advance: advance._id,
        openingBalance,
        amount,
        closingBalance,
        type: "CREDIT",
        source: "MANUAL",
      });
    }

    req.flash("notification", "Advance saved successfully");
    res.json({ success: true, redirect: "/fairdesk/advance/create" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Failed to save advance" });
  }
});

/* ADVANCE DISPLAY */
router.get("/view", async (req, res) => {
  const advances = await Advance.find().populate("employee", "empName empId").sort({ updatedAt: -1 }).lean();

  const jsonData = advances.map((a) => ({
    employeeId: a.employee?._id,
    employeeName: a.employee?.empName || "-",
    empId: a.employee?.empId || "-",
    currentBalance: a.currentBalance,
    status: a.status,
    updatedAt: new Date(a.updatedAt).toLocaleDateString(),
  }));

  res.render("accounting/advanceDisp", {
    jsonData,
    title: "Advance View",
    CSS: "tableDisp.css",
    JS: false,
    navigator: "advance",
  });
});

/* EMPLOYEE ADVANCE LOG HISTORY */
router.get("/employee/:employeeId/logs", async (req, res) => {
  const { employeeId } = req.params;

  const logs = await AdvanceLog.find({ employee: employeeId })
    .populate("employee", "empName empId")
    .sort({ createdAt: -1 })
    .lean();

  if (!logs.length) {
    return res.json({ history: [] });
  }

  const formatted = logs.map((l) => ({
    employeeName: l.employee?.empName || "-",
    empId: l.employee?.empId || "-",

    openingBalance: l.openingBalance,
    amount: l.amount,
    closingBalance: l.closingBalance,

    type: l.type, // CREDIT / DEBIT
    source: l.source, // MANUAL / PAYROLL
    date: new Date(l.createdAt).toLocaleDateString(),
  }));

  const latest = logs[0];

  res.json({
    summary: {
      currentBalance: latest.closingBalance,
      status: latest.closingBalance === 0 ? "CLOSED" : "ACTIVE",
    },
    history: formatted,
  });
});

export default router;
