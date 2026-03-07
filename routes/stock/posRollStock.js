import express from "express";
import mongoose from "mongoose";
import PosRoll from "../../models/inventory/posRoll.js";
import PosRollStock from "../../models/inventory/PosRollStock.js";
import PosRollStockLog from "../../models/inventory/PosRollStockLog.js";
import Location from "../../models/system/location.js";

const router = express.Router();

/* RENDER */
router.get("/", async (req, res) => {
  try {
    const [paperCodes, paperTypes, colors, gsms, widths, mtrsList, coreIds] = await Promise.all([
      PosRoll.distinct("posPaperCode"),
      PosRoll.distinct("posPaperType"),
      PosRoll.distinct("posColor"),
      PosRoll.distinct("posGsm"),
      PosRoll.distinct("posWidth"),
      PosRoll.distinct("posMtrs"),
      PosRoll.distinct("posCoreId"),
    ]);

    const locations = await Location.distinct("locationName");

    res.render("stock/posRollStock", {
      title: "POS Roll Stock",
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
      paperCodes,
      paperTypes,
      colors,
      gsms,
      widths,
      mtrsList,
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
    const { posPaperCode, posPaperType, posColor, posGsm, posWidth, posMtrs, posCoreId } = req.query;

    const buildFilter = (excludeKey) => {
      const f = {};
      if (posPaperCode && excludeKey !== "posPaperCode") f.posPaperCode = posPaperCode;
      if (posPaperType && excludeKey !== "posPaperType") f.posPaperType = posPaperType;
      if (posColor && excludeKey !== "posColor") f.posColor = posColor;
      if (posGsm && excludeKey !== "posGsm") f.posGsm = Number(posGsm);
      if (posWidth && excludeKey !== "posWidth") {
        const numW = Number(posWidth);
        f.posWidth = !isNaN(numW) ? { $in: [posWidth, numW] } : posWidth;
      }
      if (posMtrs && excludeKey !== "posMtrs") f.posMtrs = Number(posMtrs);
      if (posCoreId && excludeKey !== "posCoreId") f.posCoreId = Number(posCoreId);
      return f;
    };

    const [paperCodes, paperTypes, colors, gsms, widths, mtrsList, coreIds] = await Promise.all([
      PosRoll.distinct("posPaperCode", buildFilter("posPaperCode")),
      PosRoll.distinct("posPaperType", buildFilter("posPaperType")),
      PosRoll.distinct("posColor", buildFilter("posColor")),
      PosRoll.distinct("posGsm", buildFilter("posGsm")),
      PosRoll.distinct("posWidth", buildFilter("posWidth")),
      PosRoll.distinct("posMtrs", buildFilter("posMtrs")),
      PosRoll.distinct("posCoreId", buildFilter("posCoreId")),
    ]);

    res.json({ paperCodes, paperTypes, colors, gsms, widths, mtrsList, coreIds });
  } catch (err) {
    console.error("FILTER ERROR:", err);
    res.status(500).json({});
  }
});

/* RESOLVE POS ROLL */
router.post("/resolve", async (req, res) => {
  try {
    const { paperCode, paperType, color, gsm, width, mtrs, coreId } = req.body;

    const posRoll = await PosRoll.findOne({
      posPaperCode: paperCode?.trim(),
      posPaperType: paperType?.trim(),
      posColor: color?.trim(),
      posGsm: Number(gsm),
      posWidth: !isNaN(Number(width)) ? { $in: [width, Number(width)] } : width,
      posMtrs: Number(mtrs),
      posCoreId: Number(coreId),
    }).lean();

    if (!posRoll) {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      posRollId: posRoll._id.toString(),
      PosProductId: posRoll.posProductId,
    });
  } catch (err) {
    console.error("Resolve error ❌", err);
    return res.json({ found: false });
  }
});

/* BALANCE */
router.get("/balance/:posRollId/:location", async (req, res) => {
  const { posRollId, location } = req.params;

  const bal = await PosRollStock.aggregate([
    { $match: { posRoll: new mongoose.Types.ObjectId(posRollId), location } },
    { $group: { _id: null, qty: { $sum: "$quantity" } } },
  ]);

  res.json({ stock: bal[0]?.qty || 0 });
});

/* CREATE (INWARD ONLY) */
router.post("/create", async (req, res) => {
  try {
    const { posRollId, location, quantity, remarks } = req.body;
    const qty = Number(quantity);

    // STRONG VALIDATION
    if (!posRollId || !location || qty <= 0) {
      return res.status(400).json({ success: false, message: "Invalid stock entry" });
    }

    const posRollObjectId = new mongoose.Types.ObjectId(posRollId);

    /* CURRENT STOCK */
    const bal = await PosRollStock.aggregate([
      { $match: { posRoll: posRollObjectId, location } },
      { $group: { _id: null, qty: { $sum: "$quantity" } } },
    ]);

    const openingStock = bal[0]?.qty || 0;
    const closingStock = openingStock + qty;

    /* INSERT STOCK */
    await PosRollStock.create({
      posRoll: posRollObjectId,
      location,
      quantity: qty,
      remarks,
    });

    /* LOG ENTRY */
    await PosRollStockLog.create({
      posRoll: posRollObjectId,
      location,
      openingStock,
      quantity: qty,
      closingStock,
      type: "INWARD",
      source: "MANUAL",
      remarks,
      createdBy: req.user?.username || "SYSTEM",
    });

    req.flash("notification", "POS Roll stock added successfully");
    res.redirect("/fairdesk/posrollstock");
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Failed to add POS Roll stock" });
  }
});

export default router;
