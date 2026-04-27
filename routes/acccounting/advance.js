import express from "express";
import mongoose from "mongoose";
import Employee from "../../models/hr/employee_model.js";
import Advance from "../../models/accounting/Advance.js";
import AdvanceLog from "../../models/accounting/AdvanceLog.js";

const router = express.Router();

function sortAdvanceLogs(logs) {
  return [...logs].sort((a, b) => {
    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a._id).localeCompare(String(b._id));
  });
}

async function recomputeAdvanceLogs(employeeId, advanceId, maxAllowedAdvance, { overrideId = null, overrideAmount = null, deleteId = null } = {}) {
  const logs = sortAdvanceLogs(await AdvanceLog.find({ employee: employeeId }).lean());
  const ops = [];
  let running = 0;

  for (const log of logs) {
    if (deleteId && String(log._id) === String(deleteId)) {
      continue;
    }

    const isOverride = overrideId && String(log._id) === String(overrideId);
    const amount = isOverride ? overrideAmount : log.amount;
    const openingBalance = running;
    const delta = log.type === "CREDIT" ? amount : -amount;
    const closingBalance = openingBalance + delta;

    if (closingBalance < 0) {
      throw new Error("This change would make the advance balance negative.");
    }

    if (closingBalance > maxAllowedAdvance) {
      throw new Error(`Advance limit exceeded. Max allowed is Rs.${maxAllowedAdvance}`);
    }

    const update = {};
    if (openingBalance !== log.openingBalance) update.openingBalance = openingBalance;
    if (closingBalance !== log.closingBalance) update.closingBalance = closingBalance;
    if (isOverride && amount !== log.amount) update.amount = amount;

    if (Object.keys(update).length) {
      ops.push({
        updateOne: {
          filter: { _id: log._id },
          update: { $set: update },
        },
      });
    }

    running = closingBalance;
  }

  if (deleteId) {
    ops.push({
      deleteOne: {
        filter: { _id: deleteId },
      },
    });
  }

  if (ops.length) {
    await AdvanceLog.bulkWrite(ops);
  }

  const advance = await Advance.findById(advanceId);
  if (!advance) {
    throw new Error("Advance record not found.");
  }

  advance.currentBalance = running;
  advance.status = running === 0 ? "CLOSED" : "ACTIVE";
  await advance.save();

  return {
    currentBalance: running,
    status: advance.status,
    updatedAt: advance.updatedAt,
  };
}

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
    res.json({ success: true, redirect: "/fairdesk/advance/view" });
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
    _id: l._id,
    employeeName: l.employee?.empName || "-",
    empId: l.employee?.empId || "-",

    openingBalance: l.openingBalance,
    amount: l.amount,
    closingBalance: l.closingBalance,

    type: l.type, // CREDIT / DEBIT
    source: l.source, // MANUAL / PAYROLL
    canEdit: l.source === "MANUAL" && l.type === "CREDIT",
    canDelete: l.source === "MANUAL" && l.type === "CREDIT",
    createdAt: l.createdAt,
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

router.patch("/logs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const amount = Number(req.body.amount) || 0;

    if (amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0." });
    }

    const log = await AdvanceLog.findById(id);
    if (!log) {
      return res.status(404).json({ message: "Advance log not found." });
    }

    if (log.source !== "MANUAL" || log.type !== "CREDIT") {
      return res.status(400).json({ message: "Only manual advance entries can be edited." });
    }

    const emp = await Employee.findById(log.employee);
    if (!emp) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const summary = await recomputeAdvanceLogs(
      log.employee,
      log.advance,
      emp.basicSalary * 1,
      { overrideId: log._id, overrideAmount: amount }
    );

    return res.json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || "Failed to update advance log." });
  }
});

router.delete("/logs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const log = await AdvanceLog.findById(id);

    if (!log) {
      return res.status(404).json({ message: "Advance log not found." });
    }

    if (log.source !== "MANUAL" || log.type !== "CREDIT") {
      return res.status(400).json({ message: "Only manual advance entries can be deleted." });
    }

    const emp = await Employee.findById(log.employee);
    if (!emp) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const summary = await recomputeAdvanceLogs(
      log.employee,
      log.advance,
      emp.basicSalary * 1,
      { deleteId: log._id }
    );

    return res.json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || "Failed to delete advance log." });
  }
});

export default router;
