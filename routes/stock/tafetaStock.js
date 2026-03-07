import express from "express";
import mongoose from "mongoose";
import Tafeta from "../../models/inventory/tafeta.js";
import TafetaStock from "../../models/inventory/TafetaStock.js";
import TafetaStockLog from "../../models/inventory/TafetaStockLog.js";
import Location from "../../models/system/location.js";

const router = express.Router();

/* RENDER */
router.get("/", async (req, res) => {
  try {
    const [materialCodes, materialTypes, colors, gsms, widths, mtrsList, coreLens, notches, coreIds] =
      await Promise.all([
        Tafeta.distinct("tafetaMaterialCode"),
        Tafeta.distinct("tafetaMaterialType"),
        Tafeta.distinct("tafetaColor"),
        Tafeta.distinct("tafetaGsm"),
        Tafeta.distinct("tafetaWidth"),
        Tafeta.distinct("tafetaMtrs"),
        Tafeta.distinct("tafetaCoreLen"),
        Tafeta.distinct("tafetaNotch"),
        Tafeta.distinct("tafetaCoreId"),
      ]);

    const locations = await Location.distinct("locationName");

    res.render("stock/tafetaStock", {
      title: "Tafeta Stock",
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
      materialCodes,
      materialTypes,
      colors,
      gsms,
      widths,
      mtrsList,
      coreLens,
      notches,
      coreIds,
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
      tafetaMaterialCode,
      tafetaMaterialType,
      tafetaColor,
      tafetaGsm,
      tafetaWidth,
      tafetaMtrs,
      tafetaCoreLen,
      tafetaNotch,
      tafetaCoreId,
    } = req.query;

    const buildFilter = (excludeKey) => {
      const f = {};
      if (tafetaMaterialCode && excludeKey !== "tafetaMaterialCode") f.tafetaMaterialCode = tafetaMaterialCode;
      if (tafetaMaterialType && excludeKey !== "tafetaMaterialType") f.tafetaMaterialType = tafetaMaterialType;
      if (tafetaColor && excludeKey !== "tafetaColor") f.tafetaColor = tafetaColor;
      if (tafetaGsm && excludeKey !== "tafetaGsm") f.tafetaGsm = tafetaGsm;
      if (tafetaWidth && excludeKey !== "tafetaWidth") f.tafetaWidth = tafetaWidth;
      if (tafetaMtrs && excludeKey !== "tafetaMtrs") f.tafetaMtrs = tafetaMtrs;
      if (tafetaCoreLen && excludeKey !== "tafetaCoreLen") f.tafetaCoreLen = tafetaCoreLen;
      if (tafetaNotch && excludeKey !== "tafetaNotch") f.tafetaNotch = tafetaNotch;
      if (tafetaCoreId && excludeKey !== "tafetaCoreId") f.tafetaCoreId = tafetaCoreId;
      return f;
    };

    const [materialCodes, materialTypes, colors, gsms, widths, mtrsList, coreLens, notches, coreIds] =
      await Promise.all([
        Tafeta.distinct("tafetaMaterialCode", buildFilter("tafetaMaterialCode")),
        Tafeta.distinct("tafetaMaterialType", buildFilter("tafetaMaterialType")),
        Tafeta.distinct("tafetaColor", buildFilter("tafetaColor")),
        Tafeta.distinct("tafetaGsm", buildFilter("tafetaGsm")),
        Tafeta.distinct("tafetaWidth", buildFilter("tafetaWidth")),
        Tafeta.distinct("tafetaMtrs", buildFilter("tafetaMtrs")),
        Tafeta.distinct("tafetaCoreLen", buildFilter("tafetaCoreLen")),
        Tafeta.distinct("tafetaNotch", buildFilter("tafetaNotch")),
        Tafeta.distinct("tafetaCoreId", buildFilter("tafetaCoreId")),
      ]);

    res.json({ materialCodes, materialTypes, colors, gsms, widths, mtrsList, coreLens, notches, coreIds });
  } catch (err) {
    console.error("FILTER ERROR:", err);
    res.status(500).json({});
  }
});

/* RESOLVE TAFETA */
router.post("/resolve", async (req, res) => {
  try {
    const { materialCode, materialType, color, gsm, width, mtrs, coreLen, notch, coreId } = req.body;

    const tafeta = await Tafeta.findOne({
      tafetaMaterialCode: materialCode?.trim(),
      tafetaMaterialType: materialType?.trim(),
      tafetaColor: color?.trim(),
      tafetaGsm: gsm?.toString().trim(),
      tafetaWidth: width?.toString().trim(),
      tafetaMtrs: mtrs?.toString().trim(),
      tafetaCoreLen: coreLen?.toString().trim(),
      tafetaNotch: notch?.toString().trim(),
      tafetaCoreId: coreId?.toString().trim(),
    }).lean();

    if (!tafeta) {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      tafetaId: tafeta._id.toString(),
      TafetaProductId: tafeta.tafetaProductId,
    });
  } catch (err) {
    console.error("Resolve error ❌", err);
    return res.json({ found: false });
  }
});

/* BALANCE */
router.get("/balance/:tafetaId/:location", async (req, res) => {
  const { tafetaId, location } = req.params;

  const bal = await TafetaStock.aggregate([
    { $match: { tafeta: new mongoose.Types.ObjectId(tafetaId), location } },
    { $group: { _id: null, qty: { $sum: "$quantity" } } },
  ]);

  res.json({ stock: bal[0]?.qty || 0 });
});

/* CREATE (INWARD ONLY) */
router.post("/create", async (req, res) => {
  try {
    const { tafetaId, location, quantity, remarks } = req.body;
    const qty = Number(quantity);

    // STRONG VALIDATION
    if (!tafetaId || !location || qty <= 0) {
      return res.status(400).json({ success: false, message: "Invalid stock entry" });
    }

    const tafetaObjectId = new mongoose.Types.ObjectId(tafetaId);

    /* CURRENT STOCK */
    const bal = await TafetaStock.aggregate([
      { $match: { tafeta: tafetaObjectId, location } },
      { $group: { _id: null, qty: { $sum: "$quantity" } } },
    ]);

    const openingStock = bal[0]?.qty || 0;
    const closingStock = openingStock + qty;

    /* INSERT STOCK */
    await TafetaStock.create({
      tafeta: tafetaObjectId,
      location,
      quantity: qty,
      remarks,
    });

    /* LOG ENTRY */
    await TafetaStockLog.create({
      tafeta: tafetaObjectId,
      location,
      openingStock,
      quantity: qty,
      closingStock,
      type: "INWARD",
      source: "MANUAL",
      remarks,
      createdBy: req.user?.username || "SYSTEM",
    });

    req.flash("notification", "Tafeta stock added successfully");
    res.redirect("/fairdesk/tafetastock");
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Failed to add Tafeta stock" });
  }
});

export default router;
