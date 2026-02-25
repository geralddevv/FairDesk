import express from "express";
import Tape from "../../models/inventory/tape.js";
import TapeBinding from "../../models/inventory/tapeBinding.js";
import TapeStock from "../../models/inventory/TapeStock.js";
import Client from "../../models/users/client.js";
import Username from "../../models/users/username.js";

const router = express.Router();

/* GET : Load Tape Binding Form */
router.get("/form/tape-binding", async (req, res) => {
  try {
    const [clients, paperCodes, paperTypes, gsms, widths, mtrsList, coreIds, finishes] = await Promise.all([
      Client.distinct("clientName"),
      Tape.distinct("tapePaperCode"),
      Tape.distinct("tapePaperType"),
      Tape.distinct("tapeGsm"),
      Tape.distinct("tapeWidth"),
      Tape.distinct("tapeMtrs"),
      Tape.distinct("tapeCoreId"),
      Tape.distinct("tapeFinish"),
    ]);

    // console.log(paperCodes, paperTypes, gsms, widths, mtrsList);

    res.render("inventory/tapeBinding.ejs", {
      title: "Client Tape",
      clients,
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
      paperCodes,
      paperTypes,
      gsms,
      widths,
      mtrsList,
      coreIds,
      finishes,
    });
  } catch (err) {
    console.error(err);
    req.flash("notification", "Failed to load Tape Binding");
    res.redirect("back");
  }
});

/* POST : Save Tape Binding */
router.post("/form/tape-binding", async (req, res) => {
  try {
    const { userId, tapeId } = req.body;

    // Validate user exists
    const user = await Username.findById(userId);
    if (!user) {
      req.flash("notification", "Invalid user selected");
      return res.redirect("back");
    }

    // Check for duplicate binding (same user, same tape, same client paper code, AND ALL OTHER SPECS)
    const existingBinding = await TapeBinding.exists({
      userId,
      tapeId,
      tapeClientPaperCode: req.body.tapeClientPaperCode,
      clientTapeGsm: Number(req.body.clientTapeGsm),
      tapeRatePerRoll: Number(req.body.tapeRatePerRoll),
      tapeSaleCost: Number(req.body.tapeSaleCost),
      tapeMinQty: Number(req.body.tapeMinQty),
      tapeOdrQty: Number(req.body.tapeOdrQty),
      tapeOdrFreq: req.body.tapeOdrFreq,
      tapeCreditTerm: req.body.tapeCreditTerm,
      // tapeMtrsDel is typically 0 on create, but if they pass it, we should check it to be "exact" match as requested
      tapeMtrsDel: Number(req.body.tapeMtrsDel || 0),
    });
    if (existingBinding) {
      req.flash("notification", "This exacta tape binding configuration already exists for this user.");
      return res.redirect("back");
    }

    // Create tape binding with user reference
    const tapeBinding = await TapeBinding.create({
      ...req.body,
      clientTapeGsm: Number(req.body.clientTapeGsm),
      tapeRatePerRoll: Number(req.body.tapeRatePerRoll),
      tapeSaleCost: Number(req.body.tapeSaleCost),
      tapeMinQty: Number(req.body.tapeMinQty),
      tapeOdrQty: Number(req.body.tapeOdrQty),
      tapeMtrsDel: Number(req.body.tapeMtrsDel || 0),
      userId, // persisted safely
      tapeId,
    });

    // Attach tapeBinding to user (like label/ttr)
    user.tape.push(tapeBinding._id);
    await user.save();

    req.flash("notification", "Tape binding created successfully!");
    res.redirect("/fairdesk/client/details/" + userId);
  } catch (err) {
    console.error("TAPE BINDING ERROR:", err);
    req.flash("notification", err.message);
    res.redirect("back");
  }
});

/* GET : Fetch Users by Client (AJAX) */
router.get("/form/tape-binding/client/:name", async (req, res) => {
  try {
    const clientData = await Client.findOne({ clientName: req.params.name }).populate("users");

    res.status(200).json(clientData);
  } catch (err) {
    console.error(err);
    res.status(500).json(null);
  }
});

/* GET : Filter Tape Specs (cascading smart form) */
router.get("/form/tape-binding/filter-specs", async (req, res) => {
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
    console.error("FILTER SPECS ERROR:", err);
    res.status(500).json(null);
  }
});

/* GET : Resolve Tape from Specifications */
router.get("/form/tape-binding/resolve-tape", async (req, res) => {
  console.log("Resolve query:", req.query);
  try {
    const { tapePaperCode, tapePaperType, tapeGsm, tapeWidth, tapeMtrs, tapeCoreId, tapeFinish } = req.query;

    if (!tapePaperCode || !tapePaperType || !tapeGsm || !tapeWidth || !tapeMtrs || !tapeCoreId || !tapeFinish) {
      return res.status(400).json(null);
    }

    const tape = await Tape.findOne({
      tapePaperCode,
      tapePaperType,
      tapeGsm: Number(tapeGsm),
      tapeWidth: Number(tapeWidth),
      tapeMtrs: Number(tapeMtrs),
      tapeCoreId: Number(tapeCoreId),
      tapeFinish: tapeFinish,
    }).lean();

    if (!tape) {
      return res.status(404).json(null);
    }

    res.status(200).json({
      tapeId: tape._id,
      tapeProductId: tape.tapeProductId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(null);
  }
});

/* GET : Display Bound Tapes */
router.get("/tape/view/:id", async (req, res) => {
  try {
    const user = await Username.findById(req.params.id)
      .populate({
        path: "tape",
        populate: [
          { path: "tapeId", model: "Tape" }, // Tape Master
          { path: "userId", model: "Username" }, // User ref
        ],
      })
      .lean();

    if (!user) {
      req.flash("notification", "User not found");
      return res.redirect("back");
    }

    // Fetch stock for all bound tapes in one aggregation to avoid N+1 queries
    const tapeData = user.tape || [];
    const tapeIds = tapeData.map((binding) => binding.tapeId?._id).filter(Boolean);

    const stockMap = {};
    if (tapeIds.length) {
      const stockAgg = await TapeStock.aggregate([
        { $match: { tape: { $in: tapeIds } } },
        { $group: { _id: "$tape", total: { $sum: "$quantity" } } },
      ]);
      stockAgg.forEach((row) => {
        stockMap[row._id.toString()] = row.total;
      });
    }

    tapeData.forEach((binding) => {
      const tid = binding.tapeId?._id?.toString();
      binding.stock = stockMap[tid] || 0;
    });

    res.render("inventory/tapeDisp.ejs", {
      jsonData: tapeData,
      CSS: "tableDisp.css",
      JS: false,
      title: "Tape Display",
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("TAPE VIEW ERROR:", err);
    res.redirect("back");
  }
});

export default router;
