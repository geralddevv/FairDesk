import express from "express";
import Ttr from "../../models/inventory/ttr.js";
import TtrBinding from "../../models/inventory/ttrBinding.js";
import TtrStock from "../../models/inventory/TtrStock.js";
import Client from "../../models/users/client.js";
import Username from "../../models/users/username.js";

const router = express.Router();

/* GET : Load TTR Binding Form */
router.get("/form/ttr-binding", async (req, res) => {
  try {
    const [clients, types, colors, materialCodes, widths, mtrsList, inkFaces, coreIds, coreLengths, notches, windings] =
      await Promise.all([
        Client.distinct("clientName"),
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

    res.render("inventory/ttrBinding.ejs", {
      title: "Client TTR",
      clients,
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
    });
  } catch (err) {
    console.error(err);
    req.flash("notification", "Failed to load TTR Binding");
    res.redirect("back");
  }
});

/* POST : Save TTR Binding */
router.post("/form/ttr-binding", async (req, res) => {
  try {
    const { userId, ttrId } = req.body;

    // Validate user exists
    const user = await Username.findById(userId);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid user selected" });
    }

    // Check for duplicate binding
    const existingBinding = await TtrBinding.exists({
      userId,
      ttrId,
    });
    if (existingBinding) {
      return res.status(400).json({ success: false, message: "This TTR binding already exists for this user." });
    }

    // Create TTR binding
    const ttrBinding = await TtrBinding.create({
      ...req.body,
      ttrRatePerRoll: Number(req.body.ttrRatePerRoll),
      ttrSaleCost: Number(req.body.ttrSaleCost),
      ttrMinQty: Number(req.body.ttrMinQty),
      ttrOdrQty: Number(req.body.ttrOdrQty),
      userId,
      ttrId,
    });

    // Attach to user
    user.ttr.push(ttrBinding._id);
    await user.save();

    req.flash("notification", "TTR binding created successfully!");
    res.json({ success: true, redirect: "/fairdesk/client/details/" + userId });
  } catch (err) {
    console.error("TTR BINDING ERROR:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

/* GET : Fetch Users by Client (AJAX) */
router.get("/form/ttr-binding/client/:name", async (req, res) => {
  try {
    const clientData = await Client.findOne({ clientName: req.params.name }).populate("users");
    res.status(200).json(clientData);
  } catch (err) {
    console.error(err);
    res.status(500).json(null);
  }
});

/* GET : Filter TTR Specs (cascading smart form) */
router.get("/form/ttr-binding/filter-specs", async (req, res) => {
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

    const flex = (val) => {
      if (!val && val !== 0) return val;
      const arr = [val];
      if (typeof val === "string") {
        const t = val.trim();
        if (t !== val) arr.push(t);
        const n = Number(t);
        if (t !== "" && !isNaN(n)) arr.push(n);
      } else {
        arr.push(String(val));
      }
      return { $in: arr };
    };

    const buildFilter = (excludeKey) => {
      const f = {};
      if (ttrType && excludeKey !== "ttrType") f.ttrType = flex(ttrType);
      if (ttrColor && excludeKey !== "ttrColor") f.ttrColor = flex(ttrColor);
      if (ttrMaterialCode && excludeKey !== "ttrMaterialCode") f.ttrMaterialCode = flex(ttrMaterialCode);
      if (ttrWidth && excludeKey !== "ttrWidth") f.ttrWidth = flex(ttrWidth);
      if (ttrMtrs && excludeKey !== "ttrMtrs") f.ttrMtrs = flex(ttrMtrs);
      if (ttrInkFace && excludeKey !== "ttrInkFace") f.ttrInkFace = flex(ttrInkFace);
      if (ttrCoreId && excludeKey !== "ttrCoreId") f.ttrCoreId = flex(ttrCoreId);
      if (ttrCoreLength && excludeKey !== "ttrCoreLength") f.ttrCoreLength = flex(ttrCoreLength);
      if (ttrNotch && excludeKey !== "ttrNotch") f.ttrNotch = flex(ttrNotch);
      if (ttrWinding && excludeKey !== "ttrWinding") f.ttrWinding = flex(ttrWinding);
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
    console.error("FILTER SPECS ERROR:", err);
    res.status(500).json(null);
  }
});

/* GET : Resolve TTR from Specifications */
router.get("/form/ttr-binding/resolve-ttr", async (req, res) => {
  console.log("Resolve TTR query:", req.query);
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

    if (
      !ttrType ||
      !ttrColor ||
      !ttrMaterialCode ||
      !ttrWidth ||
      !ttrMtrs ||
      !ttrInkFace ||
      !ttrCoreId ||
      !ttrCoreLength ||
      !ttrNotch ||
      !ttrWinding
    ) {
      return res.status(400).json(null);
    }

    const flex = (val) => {
      if (!val && val !== 0) return val;
      const arr = [val];
      if (typeof val === "string") {
        const t = val.trim();
        if (t !== val) arr.push(t);
        const n = Number(t);
        if (t !== "" && !isNaN(n)) arr.push(n);
      } else {
        arr.push(String(val));
      }
      return { $in: arr };
    };

    const ttr = await Ttr.findOne({
      ttrType: flex(ttrType),
      ttrColor: flex(ttrColor),
      ttrMaterialCode: flex(ttrMaterialCode),
      ttrWidth: flex(ttrWidth),
      ttrMtrs: flex(ttrMtrs),
      ttrInkFace: flex(ttrInkFace),
      ttrCoreId: flex(ttrCoreId),
      ttrCoreLength: flex(ttrCoreLength),
      ttrNotch: flex(ttrNotch),
      ttrWinding: flex(ttrWinding),
    }).lean();

    if (!ttr) {
      return res.status(404).json(null);
    }

    res.status(200).json({
      ttrId: ttr._id,
      ttrMaterialCode: ttr.ttrMaterialCode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(null);
  }
});

/* GET : Display bound TTRs */
router.get("/ttr/view/:id", async (req, res) => {
  try {
    const user = await Username.findById(req.params.id)
      .populate({
        path: "ttr",
        populate: [
          { path: "ttrId", model: "Ttr" },
          { path: "userId", model: "Username" },
        ],
      })
      .lean();

    if (!user) {
      req.flash("notification", "User not found");
      return res.redirect("back");
    }

    const ttrDataRaw = user.ttr || [];
    const ttrIds = ttrDataRaw.map((binding) => binding.ttrId?._id).filter(Boolean);

    const stockMap = {};
    if (ttrIds.length) {
      const stockAgg = await TtrStock.aggregate([
        { $match: { ttr: { $in: ttrIds } } },
        { $group: { _id: "$ttr", total: { $sum: "$quantity" } } },
      ]);
      stockAgg.forEach((row) => {
        stockMap[row._id.toString()] = row.total;
      });
    }

    const ttrData = ttrDataRaw.map((binding) => {
      const tid = binding.ttrId?._id?.toString();
      return {
        ...binding,
        stock: stockMap[tid] || 0,
        // Flatten TTR master fields
        productId: binding.ttrId?.ttrProductId || "",
        ttrType: binding.ttrId?.ttrType || "",
        ttrColor: binding.ttrId?.ttrColor || "",
        ttrMaterialCode: binding.ttrId?.ttrMaterialCode || "",
        ttrWidth: binding.ttrId?.ttrWidth || "",
        ttrMtrs: binding.ttrId?.ttrMtrs || "",
        ttrInkFace: binding.ttrId?.ttrInkFace || "",
        ttrCoreId: binding.ttrId?.ttrCoreId || "",
        ttrCoreLength: binding.ttrId?.ttrCoreLength || "",
        ttrNotch: binding.ttrId?.ttrNotch || "",
        ttrWinding: binding.ttrId?.ttrWinding || "",
        // Flatten user fields
        clientName: binding.userId?.clientName || "",
        userName: binding.userId?.userName || "",
        userContact: binding.userId?.userContact || "",
        location: binding.userId?.userLocation || "",
      };
    });

    res.render("inventory/ttrDisp.ejs", {
      jsonData: ttrData,
      CSS: "tableDisp.css",
      JS: false,
      title: "TTR Display",
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("TTR VIEW ERROR:", err);
    res.redirect("back");
  }
});

/* GET : Load TTR Binding Edit Form */
router.get("/ttr-binding/edit/:id", async (req, res) => {
  try {
    const binding = await TtrBinding.findById(req.params.id).populate("ttrId").populate("userId");

    if (!binding) {
      req.flash("notification", "TTR binding not found");
      return res.redirect("back");
    }

    res.render("inventory/ttrBindingEdit.ejs", {
      title: "Edit TTR Binding",
      binding,
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("EDIT BINDING GET ERROR:", err);
    req.flash("notification", "Failed to load TTR Binding Edit");
    res.redirect("back");
  }
});

/* POST : Update TTR Binding */
router.post("/ttr-binding/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      ttrClientMaterialCode,
      clientTtrType,
      ttrMtrsDel,
      ttrRatePerRoll,
      ttrSaleCost,
      ttrMinQty,
      ttrOdrQty,
      ttrOdrFreq,
      ttrCreditTerm,
      status,
    } = req.body;

    const binding = await TtrBinding.findById(id);
    if (!binding) {
      req.flash("notification", "Binding not found");
      return res.redirect("back");
    }

    binding.ttrClientMaterialCode = ttrClientMaterialCode;
    binding.clientTtrType = clientTtrType;
    binding.ttrMtrsDel = ttrMtrsDel;
    binding.ttrRatePerRoll = Number(ttrRatePerRoll);
    binding.ttrSaleCost = Number(ttrSaleCost);
    binding.ttrMinQty = Number(ttrMinQty);
    binding.ttrOdrQty = Number(ttrOdrQty);
    binding.ttrOdrFreq = ttrOdrFreq;
    binding.ttrCreditTerm = ttrCreditTerm;

    if (status) {
      binding.status = status;
    }

    await binding.save();

    req.flash("notification", "TTR binding updated successfully!");
    res.redirect("/fairdesk/ttr/view/" + binding.userId);
  } catch (err) {
    console.error("EDIT BINDING POST ERROR:", err);
    if (err.code === 11000) {
      req.flash("notification", "A TTR binding with this exact configuration already exists.");
    } else {
      req.flash("notification", "Failed to update TTR Binding");
    }
    res.redirect("back");
  }
});

export default router;
