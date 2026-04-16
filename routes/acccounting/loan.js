import express from "express";
import mongoose from "mongoose";
import Employee from "../../models/hr/employee_model.js";
import Loan from "../../models/accounting/Loan.js";
import LoanLog from "../../models/accounting/LoanLog.js";

const router = express.Router();

/* SHOW LOAN FORM */
router.get("/create", async (req, res) => {
  const employees = await Employee.find({ isActive: true });

  res.render("accounting/loan", {
    employees,
    CSS: false,
    JS: false,
    title: "Loan",
    navigator: "loan",
    notification: req.flash("notification"),
    error: req.flash("error"),
  });
});

/* ADD / RE-ISSUE LOAN */
router.post("/create", async (req, res) => {
  try {
    const { employeeId, loanAmount } = req.body;
    const amount = Number(loanAmount) || 0;

    // accept both names safely
    const newEmi = Number(req.body.emi) || Number(req.body.emiAmount) || 0;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "Please select an employee." });
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Loan amount must be greater than 0." });
    }

    if (newEmi <= 0) {
      return res.status(400).json({ success: false, message: "EMI amount must be greater than 0." });
    }

    const empObjectId = new mongoose.Types.ObjectId(employeeId);

    let loan = await Loan.findOne({ employee: empObjectId });

    /* FIRST TIME LOAN */
    if (!loan) {
      const newLoan = await Loan.create({
        employee: empObjectId,
        currentBalance: amount,
        emi: newEmi,
        status: "ACTIVE",
      });

      await LoanLog.create({
        employee: empObjectId,
        loan: newLoan._id,
        openingBalance: 0,
        amount: amount,
        closingBalance: amount,
        type: "CREDIT",
        source: "MANUAL",
      });

      req.flash("notification", "Loan issued successfully");
      return res.json({ success: true, redirect: "/fairdesk/loan/view" });
    }

    /* LOAN RE-ISSUE (TOP-UP / CONSOLIDATION) */

    const oldBalance = loan.currentBalance;

    /* 1. CLOSE OLD LOAN BALANCE */
    await LoanLog.create({
      employee: empObjectId,
      loan: loan._id,
      openingBalance: oldBalance,
      amount: oldBalance,
      closingBalance: 0,
      type: "DEBIT",
      source: "MANUAL",
    });

    /* 2. UPDATE LOAN MASTER (OVERRIDE EMI) */
    const consolidatedAmount = oldBalance + amount;

    loan.currentBalance = consolidatedAmount;
    loan.emi = newEmi; //  EMI OVERRIDDEN (NOT ADDED)
    loan.status = "ACTIVE";
    await loan.save();

    /* 3. LOG ONLY THE TOP-UP */
    await LoanLog.create({
      employee: empObjectId,
      loan: loan._id,
      openingBalance: oldBalance,
      amount: amount, // only top-up amount
      closingBalance: consolidatedAmount,
      type: "CREDIT",
      source: "MANUAL",
    });

    req.flash("notification", "Loan re-issued successfully");
    return res.json({ success: true, redirect: "/fairdesk/loan/view" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Failed to issue loan" });
  }
});

/* LOAN DISPLAY */
router.get("/view", async (req, res) => {
  const loans = await Loan.find().populate("employee", "empName empId").sort({ updatedAt: -1 }).lean();

  const jsonData = loans.map((l) => ({
    employeeId: l.employee?._id,
    employeeName: l.employee?.empName || "-",
    empId: l.employee?.empId || "-",
    currentBalance: l.currentBalance,
    emi: l.emi || 0,
    status: l.status,
    updatedAt: new Date(l.updatedAt).toLocaleDateString(),
  }));

  res.render("accounting/loanDisp", {
    jsonData,
    title: "Loan View",
    CSS: "tableDisp.css",
    JS: false,
    navigator: "loan",
  });
});

/* EMPLOYEE LOAN LOG HISTORY */
router.get("/employee/:employeeId/logs", async (req, res) => {
  const { employeeId } = req.params;

  const logs = await LoanLog.find({ employee: employeeId })
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
