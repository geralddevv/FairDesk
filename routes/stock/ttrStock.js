import express from "express";
import mongoose from "mongoose";
import Ttr from "../../models/inventory/ttr.js";
import TtrStock from "../../models/inventory/TtrStock.js";
import TtrStockLog from "../../models/inventory/TtrStockLog.js";
import Location from "../../models/system/location.js";

const router = express.Router();

/* RENDER */
router.get("/", async (req, res) => {
  try {
    const [types, colors, materialCodes, widths, mtrsList, inkFaces, coreIds, coreLengths, notches, windings] =
      await Promise.all([
        Ttr.distinct("ttrType"),
        Ttr.distinct("ttrColor"),
        Ttr.distinct("ttrMaterialCode"),
        Ttr.distinct("ttrWidth"),
        Ttr.distinct("ttrMtrs"),
        Ttr.distinct("ttrInkFace"),
        Ttr.distinct("ttrCoreId"),
        Ttr.distinct("ttrCoreLength"),
        Ttr.distinct("ttrNotch"),
        Ttr.distinct("ttrWinding"),
      ]);

    const locations = await Location.distinct("locationName");

    res.render("stock/ttrStock.ejs", {
      title: "TTR Stock",
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
      types,
      colors,
      materialCodes,
      widths,
      mtrsList,
      inkFaces,
      coreIds,
      coreLengths,
      notches,
      windings,
      locations,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/fairdesk");
  }
});

/* FILTER SPECS */
router.get("/filter-specs", async (req, res) => {
  try {
    const {
      ttrType,
      ttrColor,
      ttrMaterialCode,
      ttrWidth,
      ttrMtrs,
      ttrInkFace,
      ttrCoreId,
      ttrCoreLength,
      ttrNotch,
      ttrWinding,
    } = req.query;

    const buildFilter = (excludeKey) => {
      const f = {};
      if (ttrType && excludeKey !== "ttrType") f.ttrType = ttrType;
      if (ttrColor && excludeKey !== "ttrColor") f.ttrColor = ttrColor;
      if (ttrMaterialCode && excludeKey !== "ttrMaterialCode") f.ttrMaterialCode = ttrMaterialCode;
      if (ttrWidth && excludeKey !== "ttrWidth") f.ttrWidth = Number(ttrWidth);
      if (ttrMtrs && excludeKey !== "ttrMtrs") f.ttrMtrs = Number(ttrMtrs);
      if (ttrInkFace && excludeKey !== "ttrInkFace") f.ttrInkFace = ttrInkFace;
      if (ttrCoreId && excludeKey !== "ttrCoreId") f.ttrCoreId = ttrCoreId;
      if (ttrCoreLength && excludeKey !== "ttrCoreLength") f.ttrCoreLength = Number(ttrCoreLength);
      if (ttrNotch && excludeKey !== "ttrNotch") f.ttrNotch = ttrNotch;
      if (ttrWinding && excludeKey !== "ttrWinding") f.ttrWinding = ttrWinding;
      return f;
    };

    const [types, colors, materialCodes, widths, mtrsList, inkFaces, coreIds, coreLengths, notches, windings] =
      await Promise.all([
        Ttr.distinct("ttrType", buildFilter("ttrType")),
        Ttr.distinct("ttrColor", buildFilter("ttrColor")),
        Ttr.distinct("ttrMaterialCode", buildFilter("ttrMaterialCode")),
        Ttr.distinct("ttrWidth", buildFilter("ttrWidth")),
        Ttr.distinct("ttrMtrs", buildFilter("ttrMtrs")),
        Ttr.distinct("ttrInkFace", buildFilter("ttrInkFace")),
        Ttr.distinct("ttrCoreId", buildFilter("ttrCoreId")),
        Ttr.distinct("ttrCoreLength", buildFilter("ttrCoreLength")),
        Ttr.distinct("ttrNotch", buildFilter("ttrNotch")),
        Ttr.distinct("ttrWinding", buildFilter("ttrWinding")),
      ]);

    res.json({
      types,
      colors,
      materialCodes,
      widths,
      mtrsList,
      inkFaces,
      coreIds,
      coreLengths,
      notches,
      windings,
    });
  } catch (err) {
    console.error("FILTER ERROR:", err);
    res.status(500).json({});
  }
});

/* RESOLVE TTR */
router.post("/resolve", async (req, res) => {
  try {
    const { type, color, materialCode, width, mtrs, inkFace, coreId, coreLength, notch, winding } = req.body;

    const ttr = await Ttr.findOne({
      ttrType: type?.trim(),
      ttrColor: color?.trim(),
      ttrMaterialCode: materialCode?.trim(),
      ttrWidth: width ? Number(width) : undefined,
      ttrMtrs: mtrs ? Number(mtrs) : undefined,
      ttrInkFace: inkFace?.trim(),
      ttrCoreId: coreId?.trim(),
      ttrCoreLength: coreLength ? Number(coreLength) : undefined,
      ttrNotch: notch?.trim(),
      ttrWinding: winding?.trim(),
    }).lean();

    if (!ttr) {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      ttrId: ttr._id.toString(),
      TtrProductId: ttr.ttrMaterialCode,
    });
  } catch (err) {
    console.error("Resolve error ❌", err);
    return res.json({ found: false });
  }
});

/* BALANCE */
router.get("/balance/:ttrId/:location", async (req, res) => {
  try {
    const { ttrId, location } = req.params;

    const bal = await TtrStock.aggregate([
      { $match: { ttr: new mongoose.Types.ObjectId(ttrId), location } },
      { $group: { _id: null, qty: { $sum: "$quantity" } } },
    ]);

    res.json({ stock: bal[0]?.qty || 0 });
  } catch (err) {
    console.error("Balance error", err);
    res.json({ stock: 0 });
  }
});

/* CREATE (INWARD ONLY) */
router.post("/create", async (req, res) => {
  try {
    const { ttrId, location, quantity, remarks } = req.body;
    const qty = Number(quantity);

    // STRONG VALIDATION
    if (!ttrId || !location || qty <= 0) {
      return res.status(400).json({ success: false, message: "Invalid stock entry" });
    }

    const ttrObjectId = new mongoose.Types.ObjectId(ttrId);

    /* CURRENT STOCK */
    const bal = await TtrStock.aggregate([
      { $match: { ttr: ttrObjectId, location } },
      { $group: { _id: null, qty: { $sum: "$quantity" } } },
    ]);

    const openingStock = bal[0]?.qty || 0;
    const closingStock = openingStock + qty;

    /* INSERT STOCK */
    await TtrStock.create({
      ttr: ttrObjectId,
      location,
      quantity: qty,
      remarks,
    });

    /* LOG ENTRY */
    await TtrStockLog.create({
      ttr: ttrObjectId,
      location,
      openingStock,
      quantity: qty,
      closingStock,
      type: "INWARD",
      source: "MANUAL",
      remarks,
      createdBy: req.user?.username || "SYSTEM",
    });

    req.flash("notification", "TTR stock added successfully");
    res.redirect("/fairdesk/ttrstock");
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Failed to add TTR stock" });
  }
});

export default router;
