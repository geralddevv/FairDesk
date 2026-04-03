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

async function recomputeLogsAndBalance(location, { overrideId = null, overrideDoc = null, deleteId = null } = {}) {
  const logs = await PettyCashLog.find({ location }).sort({ createdAt: 1, _id: 1 });

  let running = 0;
  const ops = [];

  for (const log of logs) {
    if (deleteId && log._id.equals(deleteId)) {
      continue;
    }

    const isOverride = overrideId && log._id.equals(overrideId);
    const effective = isOverride ? { ...log.toObject(), ...overrideDoc } : log;

    const openingBalance = running;
    const delta = effective.type === "INWARD" ? effective.amount : -effective.amount;
    const closingBalance = openingBalance + delta;

    if (closingBalance < 0) {
      throw new Error("Insufficient petty cash balance after update");
    }

    const update = {};
    if (openingBalance !== log.openingBalance) update.openingBalance = openingBalance;
    if (closingBalance !== log.closingBalance) update.closingBalance = closingBalance;

    if (isOverride) {
      if (effective.amount !== log.amount) update.amount = effective.amount;
      if (effective.type !== log.type) update.type = effective.type;
      if (effective.from !== log.from) update.from = effective.from;
      if (effective.to !== log.to) update.to = effective.to;
      if ((effective.reason || "") !== (log.reason || "")) update.reason = effective.reason || "";
    }

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
    ops.push({ deleteOne: { filter: { _id: deleteId } } });
  }

  if (ops.length) {
    await PettyCashLog.bulkWrite(ops);
  }

  const petty = await getOrCreatePettyCash(location);
  petty.currentBalance = running;
  await petty.save();

  return running;
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
      req.flash("error", "Invalid petty cash entry");
      return res.redirect("back");
    }

    /* UI → INTERNAL TYPE MAP */
    const internalType = type === "RECEIVED" ? "INWARD" : "OUTWARD";

    /* READ FIRST — NO CREATE, NO UPDATE */
    const existingPetty = await findPettyCash(location);
    const openingBalance = existingPetty?.currentBalance ?? 0;

    /* HARD STOP — ETHICAL GUARD */
    if (internalType === "OUTWARD" && txnAmount > openingBalance) {
      req.flash("error", "Insufficient petty cash balance");
      return res.redirect("back");
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
    return res.redirect("/fairdesk/pettycash/view");
  } catch (err) {
    console.error(err);
    req.flash("error", "Petty cash transaction failed");
    return res.redirect("back");
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
      notification: req.flash("notification"),
      error: req.flash("error"),
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

/* EDIT LOG */
router.patch("/logs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const log = await PettyCashLog.findById(id);

    if (!log) {
      return res.status(404).json({ message: "Log not found" });
    }

    const { amount, type, from, to, reason } = req.body;
    const txnAmount = Number(amount) || 0;

    if (!["INWARD", "OUTWARD"].includes(type) || txnAmount <= 0) {
      return res.status(400).json({ message: "Invalid log update" });
    }

    if (type === "INWARD" && (!from || !from.trim())) {
      return res.status(400).json({ message: "From is required" });
    }

    if (type === "OUTWARD" && (!to || !to.trim())) {
      return res.status(400).json({ message: "To is required" });
    }

    const overrideDoc = {
      amount: txnAmount,
      type,
      from: type === "INWARD" ? from.trim() : "-",
      to: type === "OUTWARD" ? to.trim() : "-",
      reason: (reason || "").trim(),
    };

    const balance = await recomputeLogsAndBalance(log.location, {
      overrideId: log._id,
      overrideDoc,
    });

    return res.json({ ok: true, balance });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || "Failed to update log" });
  }
});

/* DELETE LOG */
router.delete("/logs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const log = await PettyCashLog.findById(id);

    if (!log) {
      return res.status(404).json({ message: "Log not found" });
    }

    const balance = await recomputeLogsAndBalance(log.location, {
      deleteId: log._id,
    });

    return res.json({ ok: true, balance });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || "Failed to delete log" });
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
