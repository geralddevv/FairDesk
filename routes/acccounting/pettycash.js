import express from "express";
import PettyCash from "../../models/accounting/PettyCash.js";
import PettyCashLog from "../../models/accounting/PettyCashLog.js";

const router = express.Router();

/* READ ONLY (NO SIDE EFFECTS) */
async function findPettyCash(location) {
  return await PettyCash.findOne({ location });
}

/* CREATE ONLY WHEN TXN IS VALID */
async function getOrCreatePettyCash(location) {
  let petty = await PettyCash.findOne({ location });

  if (!petty) {
    petty = await PettyCash.create({
      location,
      currentBalance: 0,
    });
  }

  return petty;
}

/* SHOW ENTRY FORM */
router.get("/create", async (req, res) => {
  res.render("accounting/pettycash", {
    title: "Petty Cash",
    navigator: "pettycash",
    CSS: false,
    JS: false,
    notification: req.flash("notification"),
    error: req.flash("error"),
  });
});

/* ADD TRANSACTION */
router.post("/create", async (req, res) => {
  try {
    const { location, from, to, amount, type, reason } = req.body;
    const txnAmount = Number(amount) || 0;

    /* BASIC VALIDATION */
    if (!location || txnAmount <= 0 || !type || (type === "PAID" && !to) || (type === "RECEIVED" && !from)) {
      return res.status(400).json({ success: false, message: "Invalid petty cash entry" });
    }

    /* UI → INTERNAL TYPE MAP */
    const internalType = type === "RECEIVED" ? "INWARD" : "OUTWARD";

    /* READ FIRST — NO CREATE, NO UPDATE */
    const existingPetty = await findPettyCash(location);
    const openingBalance = existingPetty?.currentBalance ?? 0;

    /* HARD STOP — ETHICAL GUARD */
    if (internalType === "OUTWARD" && txnAmount > openingBalance) {
      return res.status(400).json({ success: false, message: "Insufficient petty cash balance" });
    }

    /* NOW IT IS SAFE TO CREATE / UPDATE */
    const petty = await getOrCreatePettyCash(location);

    /* CALCULATE CLOSING BALANCE */
    const closingBalance = internalType === "INWARD" ? openingBalance + txnAmount : openingBalance - txnAmount;

    /* FINAL SAFETY ASSERTION */
    if (closingBalance < 0) {
      throw new Error("Invariant violation: negative petty cash balance");
    }

    /* UPDATE MASTER */
    petty.currentBalance = closingBalance;
    await petty.save();

    /* CREATE LOG (SUCCESS ONLY) */
    await PettyCashLog.create({
      location,

      from: internalType === "OUTWARD" ? "-" : (from && from.trim()) || "-",

      to: internalType === "INWARD" ? "-" : (to && to.trim()) || "-",

      openingBalance,
      amount: txnAmount,
      closingBalance,
      type: internalType,
      reason,
    });

    req.flash("notification", "Petty cash updated successfully");
    return res.json({ success: true, redirect: "/fairdesk/pettycash/create" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Petty cash transaction failed" });
  }
});

/* SNAPSHOT (ALL LOCATIONS) */
router.get("/view", async (req, res) => {
  try {
    const pettyList = await PettyCash.find().lean();

    const snapshot = pettyList.map((p) => ({
      location: p.location,
      balance: p.currentBalance,
      status: p.currentBalance > 0 ? "ACTIVE" : "EMPTY",
      updatedAt: p.updatedAt,
    }));

    res.render("accounting/pettycashDisp", {
      jsonData: snapshot,
      title: "Petty Cash View",
      navigator: "pettycash",
      CSS: "tableDisp.css",
      JS: false,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load petty cash");
    res.redirect("back");
  }
});

/* LOCATION-WISE LOGS */
router.get("/logs/:location", async (req, res) => {
  try {
    const { location } = req.params;

    const logs = await PettyCashLog.find({ location }).sort({ createdAt: -1 }).lean();

    res.json({ history: logs });
  } catch (err) {
    res.status(500).json({ history: [] });
  }
});

/* LOCATION BALANCE (READ ONLY) */
router.get("/balance/:location", async (req, res) => {
  const { location } = req.params;

  const petty = await findPettyCash(location);

  res.json({
    balance: petty?.currentBalance ?? 0,
  });
});

export default router;
