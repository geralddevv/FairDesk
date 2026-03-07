import express from "express";
import mongoose from "mongoose";
import Tape from "../../models/inventory/tape.js";
import TapeStock from "../../models/inventory/TapeStock.js";
import TapeStockLog from "../../models/inventory/TapeStockLog.js";

const router = express.Router();

/* RENDER */
/* RENDER */
router.get("/", async (req, res) => {
  try {
    const [paperCodes, paperTypes, gsms, widths, mtrsList, coreIds, finishes] = await Promise.all([
      Tape.distinct("tapePaperCode"),
      Tape.distinct("tapePaperType"),
      Tape.distinct("tapeGsm"),
      Tape.distinct("tapeWidth"),
      Tape.distinct("tapeMtrs"),
      Tape.distinct("tapeCoreId"),
      Tape.distinct("tapeFinish"),
    ]);

    res.render("stock/tapeStock", {
      title: "Tape Stock",
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
      paperCodes,
      paperTypes,
      gsms,
      widths,
      mtrsList,
      coreIds, // though hardcoded in view, good to have
      finishes, // though hardcoded in view
    });
  } catch (err) {
    console.error(err);
    res.redirect("/fairdesk");
  }
});

/* FILTER SPECS */
router.get("/filter-specs", async (req, res) => {
  try {
    const { tapePaperCode, tapePaperType, tapeGsm, tapeWidth, tapeMtrs, tapeCoreId, tapeFinish } = req.query;

    // Helper to build filter excluding one key so user can change selection
    const buildFilter = (excludeKey) => {
      const f = {};
      if (tapePaperCode && excludeKey !== "tapePaperCode") f.tapePaperCode = tapePaperCode;
      if (tapePaperType && excludeKey !== "tapePaperType") f.tapePaperType = tapePaperType;
      if (tapeGsm && excludeKey !== "tapeGsm") f.tapeGsm = Number(tapeGsm);
      if (tapeWidth && excludeKey !== "tapeWidth") f.tapeWidth = Number(tapeWidth);
      if (tapeMtrs && excludeKey !== "tapeMtrs") f.tapeMtrs = Number(tapeMtrs);
      if (tapeCoreId && excludeKey !== "tapeCoreId") f.tapeCoreId = Number(tapeCoreId);
      if (tapeFinish && excludeKey !== "tapeFinish") f.tapeFinish = tapeFinish;
      return f;
    };

    const [paperCodes, paperTypes, gsms, widths, mtrsList, coreIds, finishes] = await Promise.all([
      Tape.distinct("tapePaperCode", buildFilter("tapePaperCode")),
      Tape.distinct("tapePaperType", buildFilter("tapePaperType")),
      Tape.distinct("tapeGsm", buildFilter("tapeGsm")),
      Tape.distinct("tapeWidth", buildFilter("tapeWidth")),
      Tape.distinct("tapeMtrs", buildFilter("tapeMtrs")),
      Tape.distinct("tapeCoreId", buildFilter("tapeCoreId")),
      Tape.distinct("tapeFinish", buildFilter("tapeFinish")),
    ]);

    res.json({ paperCodes, paperTypes, gsms, widths, mtrsList, coreIds, finishes });
  } catch (err) {
    console.error("FILTER ERROR:", err);
    res.status(500).json({});
  }
});

/* RESOLVE TAPE */
router.post("/resolve", async (req, res) => {
  try {
    const { paperCode, gsm, paperType, width, mtrs, coreId, finish } = req.body;

    const tape = await Tape.findOne({
      tapePaperCode: paperCode?.trim(),
      tapeGsm: Number(gsm),
      tapePaperType: paperType?.trim(),
      tapeWidth: Number(width),
      tapeMtrs: Number(mtrs),
      tapeCoreId: Number(coreId),
      tapeFinish: finish,
    }).lean();

    if (!tape) {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      tapeId: tape._id.toString(),
      TapeProductId: tape.tapeProductId,
    });
  } catch (err) {
    console.error("Resolve error ❌", err);
    return res.json({ found: false });
  }
});

/* BALANCE */
router.get("/balance/:tapeId/:location", async (req, res) => {
  const { tapeId, location } = req.params;

  const bal = await TapeStock.aggregate([
    { $match: { tape: new mongoose.Types.ObjectId(tapeId), location } },
    { $group: { _id: null, qty: { $sum: "$quantity" } } },
  ]);

  res.json({ stock: bal[0]?.qty || 0 });
});

/* CREATE (INWARD ONLY) */
router.post("/create", async (req, res) => {
  try {
    const { tapeId, tapeFinish, location, quantity, remarks } = req.body;
    const qty = Number(quantity);

    // STRONG VALIDATION
    if (!tapeId || !tapeFinish || !location || qty <= 0) {
      return res.status(400).json({ success: false, message: "Invalid stock entry" });
    }

    const tapeObjectId = new mongoose.Types.ObjectId(tapeId);

    /* CURRENT STOCK */
    const bal = await TapeStock.aggregate([
      { $match: { tape: tapeObjectId, location, tapeFinish } },
      { $group: { _id: null, qty: { $sum: "$quantity" } } },
    ]);

    const openingStock = bal[0]?.qty || 0;
    const closingStock = openingStock + qty;

    /* INSERT STOCK */
    await TapeStock.create({
      tape: tapeObjectId,
      tapeFinish, // REQUIRED FIELD FIXED
      location,
      quantity: qty,
      remarks,
    });

    /* LOG ENTRY */
    await TapeStockLog.create({
      tape: tapeObjectId,
      tapeFinish, // KEEP LOG CONSISTENT
      location,
      openingStock,
      quantity: qty,
      closingStock,
      type: "INWARD",
      source: "MANUAL",
      remarks,
      createdBy: req.user?.username || "SYSTEM",
    });

    req.flash("notification", "Tape stock added successfully");
    res.json({ success: true, redirect: "/fairdesk/tapestock" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Failed to add tape stock" });
  }
});

export default router;
