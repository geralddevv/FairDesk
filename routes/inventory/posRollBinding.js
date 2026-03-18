import express from "express";
import PosRoll from "../../models/inventory/posRoll.js";
import PosRollBinding from "../../models/inventory/posRollBinding.js";
import PosRollStock from "../../models/inventory/PosRollStock.js";
import Client from "../../models/users/client.js";
import Username from "../../models/users/username.js";

const router = express.Router();

/* GET : Load POS Roll Binding Form */
router.get("/form/pos-roll-binding", async (req, res) => {
  try {
    const [clients, paperCodes, paperTypes, gsms, widths, mtrsList, coreIds, colors] = await Promise.all([
      Client.distinct("clientName"),
      PosRoll.distinct("posPaperCode"),
      PosRoll.distinct("posPaperType"),
      PosRoll.distinct("posGsm"),
      PosRoll.distinct("posWidth"),
      PosRoll.distinct("posMtrs"),
      PosRoll.distinct("posCoreId"),
      PosRoll.distinct("posColor"),
    ]);

    res.render("inventory/posRollBinding.ejs", {
      title: "Client POS Roll",
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
      colors,
    });
  } catch (err) {
    console.error(err);
    req.flash("notification", "Failed to load POS Roll Binding");
    res.redirect("back");
  }
});

/* POST : Save POS Roll Binding */
router.post("/form/pos-roll-binding", async (req, res) => {
  try {
    const { userId, posRollId } = req.body;

    // Validate user exists
    const user = await Username.findById(userId);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid user selected" });
    }

    // Check for duplicate binding
    const existingBinding = await PosRollBinding.exists({
      userId,
      posRollId,
      posClientPaperCode: req.body.posClientPaperCode,
      clientPosGsm: Number(req.body.clientPosGsm),
      posRatePerRoll: Number(req.body.posRatePerRoll),
      posSaleCost: Number(req.body.posSaleCost),
      posMinQty: Number(req.body.posMinQty),
      posOdrQty: Number(req.body.posOdrQty),
      posOdrFreq: req.body.posOdrFreq,
      posCreditTerm: req.body.posCreditTerm,
      posMtrsDel: Number(req.body.posMtrsDel || 0),
    });
    if (existingBinding) {
      return res
        .status(400)
        .json({ success: false, message: "This exact POS Roll binding configuration already exists for this user." });
    }

    // Create POS Roll binding
    const posRollBinding = await PosRollBinding.create({
      ...req.body,
      clientPosGsm: Number(req.body.clientPosGsm),
      posRatePerRoll: Number(req.body.posRatePerRoll),
      posSaleCost: Number(req.body.posSaleCost),
      posMinQty: Number(req.body.posMinQty),
      posOdrQty: Number(req.body.posOdrQty),
      posMtrsDel: Number(req.body.posMtrsDel || 0),
      userId,
      posRollId,
    });

    // Attach to user
    user.posRoll.push(posRollBinding._id);
    await user.save();

    req.flash("notification", "POS Roll binding created successfully!");
    res.json({ success: true, redirect: "/fairdesk/client/details/" + userId });
  } catch (err) {
    console.error("POS ROLL BINDING ERROR:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

/* GET : Fetch Users by Client (AJAX) */
router.get("/form/pos-roll-binding/client/:name", async (req, res) => {
  try {
    const clientData = await Client.findOne({ clientName: req.params.name }).populate("users");
    res.status(200).json(clientData);
  } catch (err) {
    console.error(err);
    res.status(500).json(null);
  }
});

/* GET : Filter POS Roll Specs (cascading smart form) */
router.get("/form/pos-roll-binding/filter-specs", async (req, res) => {
  try {
    const { posPaperCode, posPaperType, posGsm, posWidth, posMtrs, posCoreId, posColor } = req.query;

    const flex = (val) => {
      if (!val) return val;
      if (typeof val !== "string") val = String(val);
      const strVal = val.trim();
      const numVal = Number(strVal);
      if (strVal === "" || isNaN(numVal)) {
        return strVal;
      }
      return { $in: [numVal, strVal] };
    };

    const buildFilter = (excludeKey) => {
      const f = {};
      if (posPaperCode && excludeKey !== "posPaperCode") f.posPaperCode = flex(posPaperCode);
      if (posPaperType && excludeKey !== "posPaperType") f.posPaperType = flex(posPaperType);
      if (posGsm && excludeKey !== "posGsm") f.posGsm = flex(posGsm);
      if (posWidth && excludeKey !== "posWidth") f.posWidth = flex(posWidth);
      if (posMtrs && excludeKey !== "posMtrs") f.posMtrs = flex(posMtrs);
      if (posCoreId && excludeKey !== "posCoreId") f.posCoreId = flex(posCoreId);
      if (posColor && excludeKey !== "posColor") f.posColor = flex(posColor);
      return f;
    };

    const [paperCodes, paperTypes, gsms, widths, mtrsList, coreIds, colors] = await Promise.all([
      PosRoll.distinct("posPaperCode", buildFilter("posPaperCode")),
      PosRoll.distinct("posPaperType", buildFilter("posPaperType")),
      PosRoll.distinct("posGsm", buildFilter("posGsm")),
      PosRoll.distinct("posWidth", buildFilter("posWidth")),
      PosRoll.distinct("posMtrs", buildFilter("posMtrs")),
      PosRoll.distinct("posCoreId", buildFilter("posCoreId")),
      PosRoll.distinct("posColor", buildFilter("posColor")),
    ]);

    res.json({ paperCodes, paperTypes, gsms, widths, mtrsList, coreIds, colors });
  } catch (err) {
    console.error("FILTER SPECS ERROR:", err);
    res.status(500).json(null);
  }
});

/* GET : Resolve POS Roll from Specifications */
router.get("/form/pos-roll-binding/resolve-pos-roll", async (req, res) => {
  console.log("Resolve POS Roll query:", req.query);
  try {
    const { posPaperCode, posPaperType, posGsm, posWidth, posMtrs, posCoreId, posColor } = req.query;

    if (!posPaperCode || !posPaperType || !posGsm || !posWidth || !posMtrs || !posCoreId || !posColor) {
      return res.status(400).json(null);
    }

    const flex = (val) => {
      if (!val) return val;
      if (typeof val !== "string") val = String(val);
      const strVal = val.trim();
      const numVal = Number(strVal);
      if (strVal === "" || isNaN(numVal)) {
        return strVal;
      }
      return { $in: [numVal, strVal] };
    };

    const posRoll = await PosRoll.findOne({
      posPaperCode: flex(posPaperCode),
      posPaperType: flex(posPaperType),
      posGsm: flex(posGsm),
      posWidth: flex(posWidth),
      posMtrs: flex(posMtrs),
      posCoreId: flex(posCoreId),
      posColor: flex(posColor),
    }).lean();

    if (!posRoll) {
      return res.status(404).json(null);
    }

    res.status(200).json({
      posRollId: posRoll._id,
      posProductId: posRoll.posProductId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(null);
  }
});

/* GET : Display bound POS Rolls */
router.get("/pos-roll/view/:id", async (req, res) => {
  try {
    const user = await Username.findById(req.params.id)
      .populate({
        path: "posRoll",
        populate: [
          { path: "posRollId", model: "PosRoll" }, // POS Roll master
          { path: "userId", model: "Username" }, // User ref
        ],
      })
      .lean();

    if (!user) {
      req.flash("notification", "User not found");
      return res.redirect("back");
    }

    const posRollData = user.posRoll || [];

    // Fetch stock for all bound POS Rolls
    const posRollIds = posRollData.map((binding) => binding.posRollId?._id).filter(Boolean);
    const stockMap = {};
    if (posRollIds.length) {
      const stockAgg = await PosRollStock.aggregate([
        { $match: { posRoll: { $in: posRollIds } } },
        { $group: { _id: "$posRoll", total: { $sum: "$quantity" } } },
      ]);
      stockAgg.forEach((row) => {
        stockMap[row._id.toString()] = row.total;
      });
    }
    posRollData.forEach((binding) => {
      const pid = binding.posRollId?._id?.toString();
      binding.stock = stockMap[pid] || 0;
    });

    res.render("inventory/posRollDisp.ejs", {
      jsonData: posRollData,
      CSS: "tableDisp.css",
      JS: false,
      title: "POS Roll Display",
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("POS ROLL VIEW ERROR:", err);
    res.redirect("back");
  }
});

/* GET : Load POS Roll Binding Edit Form */
router.get("/pos-roll-binding/edit/:id", async (req, res) => {
  try {
    const binding = await PosRollBinding.findById(req.params.id).populate("posRollId").populate("userId");

    if (!binding) {
      req.flash("notification", "POS Roll binding not found");
      return res.redirect("back");
    }

    res.render("inventory/posRollBindingEdit.ejs", {
      title: "Edit POS Roll Binding",
      binding,
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("EDIT BINDING GET ERROR:", err);
    req.flash("notification", "Failed to load POS Roll Binding Edit");
    res.redirect("back");
  }
});

/* POST : Update POS Roll Binding */
router.post("/pos-roll-binding/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      posClientPaperCode,
      clientPosGsm,
      posMtrsDel,
      posRatePerRoll,
      posSaleCost,
      posMinQty,
      posOdrQty,
      posOdrFreq,
      posCreditTerm,
      status,
    } = req.body;

    const binding = await PosRollBinding.findById(id);
    if (!binding) {
      req.flash("notification", "Binding not found");
      return res.redirect("back");
    }

    binding.posClientPaperCode = posClientPaperCode;
    binding.clientPosGsm = Number(clientPosGsm);
    binding.posMtrsDel = Number(posMtrsDel);
    binding.posRatePerRoll = Number(posRatePerRoll);
    binding.posSaleCost = Number(posSaleCost);
    binding.posMinQty = Number(posMinQty);
    binding.posOdrQty = Number(posOdrQty);
    binding.posOdrFreq = posOdrFreq;
    binding.posCreditTerm = posCreditTerm;

    if (status) {
      binding.status = status;
    }

    await binding.save();

    req.flash("notification", "POS Roll binding updated successfully!");
    res.redirect("/fairdesk/pos-roll/view/" + binding.userId);
  } catch (err) {
    console.error("EDIT BINDING POST ERROR:", err);
    if (err.code === 11000) {
      req.flash("notification", "A POS Roll binding with this exact configuration already exists.");
    } else {
      req.flash("notification", "Failed to update POS Roll Binding");
    }
    res.redirect("back");
  }
});

export default router;
