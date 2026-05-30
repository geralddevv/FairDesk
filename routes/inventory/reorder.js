import express from "express";
import Tape from "../../models/inventory/tape.js";
import PosRoll from "../../models/inventory/posRoll.js";
import Tafeta from "../../models/inventory/tafeta.js";
import Ttr from "../../models/inventory/ttr.js";
import TapeStock from "../../models/inventory/TapeStock.js";
import PosRollStock from "../../models/inventory/PosRollStock.js";
import TafetaStock from "../../models/inventory/TafetaStock.js";
import TtrStock from "../../models/inventory/TtrStock.js";
import TapeSalesOrder from "../../models/inventory/TapeSalesOrder.js";
import VendorTapeBinding from "../../models/inventory/vendorTapeBinding.js";
import VendorPosRollBinding from "../../models/inventory/vendorPosRollBinding.js";
import VendorTafetaBinding from "../../models/inventory/vendorTafetaBinding.js";
import VendorTtrBinding from "../../models/inventory/vendorTtrBinding.js";
import VendorUser from "../../models/users/vendorUser.js";
import PurchaseOrder from "../../models/inventory/PurchaseOrder.js";

const router = express.Router();

async function getReorderData() {
  const types = [
    { model: Tape, stockModel: TapeStock, stockRef: "tape", minQtyField: "tapeMinQty", typeKey: "Tape", label: "Tape" },
    { model: PosRoll, stockModel: PosRollStock, stockRef: "posRoll", minQtyField: "posMinQty", typeKey: "PosRoll", label: "POS Roll" },
    { model: Tafeta, stockModel: TafetaStock, stockRef: "tafeta", minQtyField: "tafetaMinQty", typeKey: "Tafeta", label: "Tafeta" },
    { model: Ttr, stockModel: TtrStock, stockRef: "ttr", minQtyField: "ttrMinQty", typeKey: "Ttr", label: "TTR" },
  ];

  const results = [];

  for (const t of types) {
    const items = await t.model.find().lean();
    const itemIds = items.map(i => i._id);

    // Aggregate Stock
    const stockAgg = await t.stockModel.aggregate([
      { $match: { [t.stockRef]: { $in: itemIds } } },
      { $group: { _id: `$${t.stockRef}`, total: { $sum: "$quantity" } } }
    ]);
    const stockMap = {};
    stockAgg.forEach(s => stockMap[s._id.toString()] = s.total);

    // Aggregate Booked (Pending Sales Orders)
    const salesAgg = await TapeSalesOrder.aggregate([
      { $match: { tapeId: { $in: itemIds }, status: { $in: ["PENDING", "CONFIRMED"] }, onModel: t.typeKey } },
      { $project: { tapeId: 1, balance: { $subtract: ["$quantity", "$dispatchedQuantity"] } } },
      { $group: { _id: "$tapeId", totalBooked: { $sum: "$balance" } } }
    ]);
    const bookedMap = {};
    salesAgg.forEach(s => bookedMap[s._id.toString()] = s.totalBooked);

    items.forEach(item => {
      const stock = stockMap[item._id.toString()] || 0;
      const booked = bookedMap[item._id.toString()] || 0;
      const minQty = item[t.minQtyField] || 0;
      const effectiveStock = stock - booked;

      if (effectiveStock < minQty) {
        results.push({
          _id: item._id,
          type: t.label,
          typeKey: t.typeKey,
          productId: item.tapeProductId || item.posProductId || item.tafetaProductId || item.ttrProductId || "N/A",
          name: getItemName(item, t.typeKey),
          stock,
          booked,
          effectiveStock,
          minQty,
          shortage: minQty - effectiveStock
        });
      }
    });
  }

  return results;
}

function getItemName(item, type) {
  if (type === "Tape") return `${item.tapePaperCode || ""} ${item.tapeGsm || ""}gsm`.trim() || item.tapeProductId;
  if (type === "PosRoll") return `${item.posPaperCode || ""} ${item.posGsm || ""}gsm`.trim() || item.posProductId;
  if (type === "Tafeta") return `${item.tafetaMaterialCode || ""} ${item.tafetaGsm || ""}gsm`.trim() || item.tafetaProductId;
  if (type === "Ttr") return `${item.ttrType || ""} ${item.ttrWidth || ""}x${item.ttrMtrs || ""}`.trim() || item.ttrProductId;
  return "N/A";
}

router.get("/reorder", async (req, res) => {
  try {
    const items = await getReorderData();
    res.render("inventory/reorder.ejs", {
      title: "Reorder List",
      items,
      notification: req.flash("notification"),
      CSS: "tableDisp.css",
      JS: false
    });
  } catch (err) {
    console.error("REORDER ROUTE ERROR:", err);
    res.status(500).send("Internal Server Error");
  }
});


router.get("/reorder/api/vendors/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;
    let bindingModel;
    let refField;

    if (type === "Tape") {
        bindingModel = VendorTapeBinding;
        refField = "tapeId";
    } else if (type === "PosRoll") {
        bindingModel = VendorPosRollBinding;
        refField = "posRollId";
    } else if (type === "Tafeta") {
        bindingModel = VendorTafetaBinding;
        refField = "tafetaId";
    } else if (type === "Ttr") {
        bindingModel = VendorTtrBinding;
        refField = "ttrId";
    }

    if (!bindingModel) return res.status(400).json([]);

    const bindings = await bindingModel.find({ [refField]: id })
      .populate("vendorUserId", "vendorName userName userContact userLocation")
      .lean();

    res.json(bindings);
  } catch (err) {
    console.error("API VENDORS ERROR:", err);
    res.status(500).json([]);
  }
});

router.get("/reorder/select-vendor/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;
    let model, bindingModel, refField;

    const normalizedType = type.toLowerCase();
    if (normalizedType === "tape") {
      model = Tape;
      bindingModel = VendorTapeBinding;
      refField = "tapeId";
    } else if (normalizedType === "pos-roll" || normalizedType === "posroll") {
      model = PosRoll;
      bindingModel = VendorPosRollBinding;
      refField = "posRollId";
    } else if (normalizedType === "tafeta") {
      model = Tafeta;
      bindingModel = VendorTafetaBinding;
      refField = "tafetaId";
    } else if (normalizedType === "ttr") {
      model = Ttr;
      bindingModel = VendorTtrBinding;
      refField = "ttrId";
    }

    if (!model) return res.status(404).send("Item Type Not Found");

    const [item, bindings] = await Promise.all([
      model.findById(id).lean(),
      bindingModel.find({ [refField]: id }).populate("vendorUserId").lean()
    ]);

    if (!item) return res.status(404).send("Item Not Found");

    // Fetch all coordinators for the vendors found in bindings
    const vendorIds = [...new Set(bindings.map(b => b.vendorUserId?.vendorId).filter(Boolean))];
    const allCoordinators = await VendorUser.find({ vendorId: { $in: vendorIds } }).lean();

    res.render("inventory/selectVendor.ejs", {
      title: "Create Purchase Order",
      item,
      itemName: getItemName(item, normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1).replace("-", "")),
      type: normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1).replace("-", ""),
      bindings,
      allCoordinators,
      shortage: req.query.shortage || 0,
      notification: req.flash("notification"),
      CSS: false,
      JS: false
    });
  } catch (err) {
    console.error("SELECT VENDOR ROUTE ERROR:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/reorder/create-po", async (req, res) => {
  try {
    const { itemId, itemType, vendorUserId, userLocation, quantity, poNumber, estimatedDate, remarks } = req.body;

    let bindingModel, refField, onBindingModel;
    if (itemType === "Tape") {
      bindingModel = VendorTapeBinding;
      refField = "tapeId";
      onBindingModel = "VendorTapeBinding";
    } else if (itemType === "PosRoll") {
      bindingModel = VendorPosRollBinding;
      refField = "posRollId";
      onBindingModel = "VendorPosRollBinding";
    } else if (itemType === "Tafeta") {
      bindingModel = VendorTafetaBinding;
      refField = "tafetaId";
      onBindingModel = "VendorTafetaBinding";
    } else if (itemType === "Ttr") {
      bindingModel = VendorTtrBinding;
      refField = "ttrId";
      onBindingModel = "VendorTtrBinding";
    }

    const binding = await bindingModel.findOne({ [refField]: itemId, vendorUserId });
    if (!binding) {
      req.flash("notification", { type: "error", message: "Vendor binding not found." });
      return res.redirect("back");
    }

    await PurchaseOrder.create({
      onBindingModel,
      vendorBinding: binding._id,
      vendorUserId,
      onModel: itemType,
      itemId,
      userLocation,
      quantity,
      poNumber,
      estimatedDate,
      remarks,
      createdBy: req.session?.authUser?.username || "SYSTEM"
    });

    req.flash("notification", { type: "success", message: "Purchase Order created successfully." });
    res.redirect("/fairdesk/purchase/pending");
  } catch (err) {
    console.error("CREATE PO ERROR:", err);
    req.flash("notification", { type: "error", message: "Error creating Purchase Order." });
    res.redirect("back");
  }
});

export default router;
