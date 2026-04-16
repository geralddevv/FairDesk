import express from "express";
import Tape from "../../models/inventory/tape.js";
import PosRoll from "../../models/inventory/posRoll.js";
import Tafeta from "../../models/inventory/tafeta.js";
import Vendor from "../../models/users/vendor.js";
import VendorUser from "../../models/users/vendorUser.js";
import VendorTapeBinding from "../../models/inventory/vendorTapeBinding.js";
import VendorPosRollBinding from "../../models/inventory/vendorPosRollBinding.js";
import VendorTafetaBinding from "../../models/inventory/vendorTafetaBinding.js";

const router = express.Router();

const ITEM_CONFIGS = {
  tape: {
    key: "tape",
    title: "FS Tape",
    heading: "FS Tape",
    template: "inventory/tapeVendorBinding.ejs",
    redirectTo: "/fairdesk/vendor/coordinator/view",
    bindingModel: VendorTapeBinding,
    bindingField: "tapeId",
    vendorArrayField: "tape",
    masterModel: Tape,
    displayValueKey: "tapePaperCode",
    widthField: "tapeWidth",
    mtrsField: "tapeMtrs",
    rateField: "tapeRatePerRoll",
    saleCostField: "tapeSaleCost",
    minQtyField: "tapeMinQty",
    odrQtyField: "tapeOdrQty",
    specFields: [
      { id: "tape-paper-code", name: "tapePaperCode", label: "Paper Code" },
      { id: "tape-paper-type", name: "tapePaperType", label: "Paper Type", type: "select" },
      { id: "tape-gsm", name: "tapeGsm", label: "GSM" },
      { id: "tape-width", name: "tapeWidth", label: "Width" },
      { id: "tape-mtrs", name: "tapeMtrs", label: "Meters" },
      { id: "tape-core-id", name: "tapeCoreId", label: "Core ID", type: "select" },
      { id: "tape-finish", name: "tapeFinish", label: "Finish", type: "select" },
    ],
    overrideFields: [
      { id: "vendor-tape-paper-code", name: "vendorTapePaperCode", label: "FS Paper Code", type: "text" },
      { id: "vendor-tape-gsm", name: "vendorTapeGsm", label: "FS GSM", type: "number" },
      { id: "tape-mtrs-del-input", name: "tapeMtrsDel", label: "MTRS Delivered", type: "number" },
      { id: "tape-rate-per-roll", name: "tapeRatePerRoll", label: "Rate Per Roll", type: "number" },
      { id: "tape-sale-cost", name: "tapeSaleCost", label: "Sales sq mtrs Cost", type: "number", readonly: true },
      { id: "tape-min-qty", name: "tapeMinQty", label: "Minimum Order QTY", type: "number" },
      { id: "tape-odr-qty", name: "tapeOdrQty", label: "Order QTY", type: "number" },
      { id: "tape-odr-freq", name: "tapeOdrFreq", label: "Repeat Order Freq", type: "text" },
      { id: "tape-credit-term", name: "tapeCreditTerm", label: "CR", type: "text" },
    ],
  },
  pos: {
    key: "pos",
    title: "FS POS Roll",
    heading: "FS POS Roll",
    template: "inventory/posRollVendorBinding.ejs",
    redirectTo: "/fairdesk/vendor/coordinator/view",
    bindingModel: VendorPosRollBinding,
    bindingField: "posRollId",
    vendorArrayField: "posRoll",
    masterModel: PosRoll,
    displayValueKey: "posPaperCode",
    widthField: "posWidth",
    mtrsField: "posMtrs",
    rateField: "posRatePerRoll",
    saleCostField: "posSaleCost",
    minQtyField: "posMinQty",
    odrQtyField: "posOdrQty",
    specFields: [
      { id: "pos-paper-code", name: "posPaperCode", label: "Paper Code" },
      { id: "pos-paper-type", name: "posPaperType", label: "Paper Type" },
      { id: "pos-gsm", name: "posGsm", label: "GSM" },
      { id: "pos-width", name: "posWidth", label: "Width" },
      { id: "pos-mtrs", name: "posMtrs", label: "Meters" },
      { id: "pos-core-id", name: "posCoreId", label: "Core ID", type: "select" },
      { id: "pos-color", name: "posColor", label: "Color", type: "select" },
    ],
    overrideFields: [
      { id: "vendor-pos-paper-code", name: "vendorPosPaperCode", label: "FS Paper Code", type: "text" },
      { id: "vendor-pos-gsm", name: "vendorPosGsm", label: "FS GSM", type: "number" },
      { id: "pos-mtrs-del-input", name: "posMtrsDel", label: "MTRS Delivered", type: "number" },
      { id: "pos-rate-per-roll", name: "posRatePerRoll", label: "Rate Per Roll", type: "number" },
      { id: "pos-sale-cost", name: "posSaleCost", label: "Sales sq mtrs Cost", type: "number", readonly: true },
      { id: "pos-min-qty", name: "posMinQty", label: "Minimum Order QTY", type: "number" },
      { id: "pos-odr-qty", name: "posOdrQty", label: "Order QTY", type: "number" },
      { id: "pos-odr-freq", name: "posOdrFreq", label: "Repeat Order Freq", type: "text" },
      { id: "pos-credit-term", name: "posCreditTerm", label: "CR", type: "text" },
    ],
  },
  tafeta: {
    key: "tafeta",
    title: "FS Tafeta",
    heading: "FS Tafeta",
    template: "inventory/tafetaVendorBinding.ejs",
    redirectTo: "/fairdesk/vendor/coordinator/view",
    bindingModel: VendorTafetaBinding,
    bindingField: "tafetaId",
    vendorArrayField: "tafeta",
    masterModel: Tafeta,
    displayValueKey: "tafetaMaterialCode",
    widthField: "tafetaWidth",
    mtrsField: "tafetaMtrs",
    rateField: "tafetaRatePerRoll",
    saleCostField: "tafetaSaleCost",
    minQtyField: "tafetaMinQty",
    odrQtyField: "tafetaOdrQty",
    specFields: [
      { id: "tafeta-material-code", name: "tafetaMaterialCode", label: "Material Code" },
      { id: "tafeta-material-type", name: "tafetaMaterialType", label: "Material Type", type: "select" },
      { id: "tafeta-color", name: "tafetaColor", label: "Color" },
      { id: "tafeta-gsm", name: "tafetaGsm", label: "GSM" },
      { id: "tafeta-width", name: "tafetaWidth", label: "Width" },
      { id: "tafeta-mtrs", name: "tafetaMtrs", label: "Meters" },
      { id: "tafeta-core-len", name: "tafetaCoreLen", label: "Core Len" },
      { id: "tafeta-notch", name: "tafetaNotch", label: "Notch", type: "select" },
      { id: "tafeta-core-id", name: "tafetaCoreId", label: "Core ID", type: "select" },
    ],
    overrideFields: [
      { id: "vendor-tafeta-material-code", name: "vendorTafetaMaterialCode", label: "FS Material Code", type: "text" },
      { id: "vendor-tafeta-gsm", name: "vendorTafetaGsm", label: "FS GSM", type: "text" },
      { id: "tafeta-mtrs-del-input", name: "tafetaMtrsDel", label: "MTRS Delivered", type: "text" },
      { id: "tafeta-rate-per-roll", name: "tafetaRatePerRoll", label: "Rate Per Roll", type: "number" },
      { id: "tafeta-sale-cost", name: "tafetaSaleCost", label: "Sales sq mtrs Cost", type: "number", readonly: true },
      { id: "tafeta-min-qty", name: "tafetaMinQty", label: "Minimum Order QTY", type: "number" },
      { id: "tafeta-odr-qty", name: "tafetaOdrQty", label: "Order QTY", type: "number" },
      { id: "tafeta-odr-freq", name: "tafetaOdrFreq", label: "Repeat Order Freq", type: "text" },
      { id: "tafeta-credit-term", name: "tafetaCreditTerm", label: "CR", type: "text" },
    ],
  },
};

function getConfig(kind) {
  return ITEM_CONFIGS[String(kind || "").toLowerCase()] || null;
}

function flex(value) {
  if (!value && value !== 0) return value;
  const arr = [value];
  if (typeof value === "string") {
    const t = value.trim();
    if (t !== value) arr.push(t);
    const n = Number(t);
    if (t !== "" && !Number.isNaN(n)) arr.push(n);
  } else {
    arr.push(String(value));
  }
  return { $in: arr };
}

function buildFilter(query, excludeKey) {
  const f = {};
  Object.entries(query).forEach(([key, value]) => {
    if (!value || excludeKey === key) return;
    f[key] = flex(value);
  });
  return f;
}

async function renderBindingForm(req, res, kind) {
  const config = getConfig(kind);
  if (!config) return res.status(404).send("Vendor binding type not found");

  const distinctPromises = config.specFields.map((field) => config.masterModel.distinct(field.name));
  const specValues = await Promise.all(distinctPromises);
  const specOptions = {};
  config.specFields.forEach((field, index) => {
    specOptions[field.name] = specValues[index];
  });

  const vendors = await Vendor.distinct("vendorName");
  const template = config.template || "inventory/vendorItemBinding.ejs";
  res.render(template, {
    title: config.title,
    pageConfig: config,
    specOptions,
    vendors,
    CSS: false,
    JS: false,
    notification: req.flash("notification"),
  });
}

async function saveBinding(req, res, kind) {
  try {
    const config = getConfig(kind);
    if (!config) return res.status(404).json({ success: false, message: "Invalid vendor binding type" });

    const { vendorUserId } = req.body;
    const masterId = req.body[config.bindingField];

    const vendorUser = await VendorUser.findById(vendorUserId);
    if (!vendorUser) {
      return res.status(400).json({ success: false, message: "Invalid vendor user selected" });
    }

    const existingBinding = await config.bindingModel.exists({
      vendorUserId,
      [config.bindingField]: masterId,
    });

    if (existingBinding) {
      return res.status(400).json({ success: false, message: "This vendor binding already exists for this user." });
    }

    const createData = {
      ...req.body,
      vendorUserId,
      [config.bindingField]: masterId,
    };

    if (config.bindingField === "tapeId") {
      createData.vendorTapeGsm = Number(req.body.vendorTapeGsm);
      createData.tapeMtrsDel = Number(req.body.tapeMtrsDel || 0);
      createData.tapeRatePerRoll = Number(req.body.tapeRatePerRoll);
      createData.tapeSaleCost = Number(req.body.tapeSaleCost);
      createData.tapeMinQty = Number(req.body.tapeMinQty);
      createData.tapeOdrQty = Number(req.body.tapeOdrQty);
    }
    if (config.bindingField === "posRollId") {
      createData.vendorPosGsm = Number(req.body.vendorPosGsm);
      createData.posMtrsDel = Number(req.body.posMtrsDel || 0);
      createData.posRatePerRoll = Number(req.body.posRatePerRoll);
      createData.posSaleCost = Number(req.body.posSaleCost);
      createData.posMinQty = Number(req.body.posMinQty);
      createData.posOdrQty = Number(req.body.posOdrQty);
    }
    if (config.bindingField === "tafetaId") {
      createData.tafetaRatePerRoll = Number(req.body.tafetaRatePerRoll);
      createData.tafetaSaleCost = Number(req.body.tafetaSaleCost);
      createData.tafetaMinQty = Number(req.body.tafetaMinQty);
      createData.tafetaOdrQty = Number(req.body.tafetaOdrQty);
    }

    const binding = await config.bindingModel.create(createData);
    vendorUser[config.vendorArrayField].push(binding._id);
    await vendorUser.save();

    req.flash("notification", `${config.title} binding created successfully!`);
    res.json({ success: true, redirect: config.redirectTo });
  } catch (err) {
    console.error("VENDOR ITEM BINDING ERROR:", err);
    res.status(400).json({ success: false, message: err.message });
  }
}

async function fetchVendorByName(req, res) {
  try {
    const vendorData = await Vendor.findOne({ vendorName: req.params.name }).populate("users").lean();
    res.status(200).json(vendorData);
  } catch (err) {
    console.error("VENDOR FETCH ERROR:", err);
    res.status(500).json(null);
  }
}

async function filterSpecs(req, res, kind) {
  try {
    const config = getConfig(kind);
    if (!config) return res.status(404).json(null);
    const query = {};
    config.specFields.forEach((field) => {
      if (req.query[field.name]) query[field.name] = req.query[field.name];
    });

    const distinctPromises = config.specFields.map((field) =>
      config.masterModel.distinct(field.name, buildFilter(query, field.name)),
    );
    const specValues = await Promise.all(distinctPromises);
    const out = {};
    config.specFields.forEach((field, index) => {
      out[field.name] = specValues[index];
    });
    res.json(out);
  } catch (err) {
    console.error("VENDOR FILTER ERROR:", err);
    res.status(500).json(null);
  }
}

async function resolveMaster(req, res, kind) {
  try {
    const config = getConfig(kind);
    if (!config) return res.status(404).json(null);

    const query = {};
    config.specFields.forEach((field) => {
      const value = req.query[field.name];
      if (!value) return;
      query[field.name] = flex(value);
    });

    if (config.specFields.some((field) => !req.query[field.name])) {
      return res.status(400).json(null);
    }

    const master = await config.masterModel.findOne(query).lean();
    if (!master) return res.status(404).json(null);

    res.json({
      itemId: master._id,
      displayValue: master[config.displayValueKey] || master._id,
    });
  } catch (err) {
    console.error("VENDOR RESOLVE ERROR:", err);
    res.status(500).json(null);
  }
}

router.get("/form/vendor-item-binding/:kind", async (req, res) => renderBindingForm(req, res, req.params.kind));
router.post("/form/vendor-item-binding/:kind", async (req, res) => saveBinding(req, res, req.params.kind));
router.get("/form/vendor-item-binding/:kind/vendor/:name", fetchVendorByName);
router.get("/form/vendor-item-binding/:kind/filter-specs", async (req, res) => filterSpecs(req, res, req.params.kind));
router.get("/form/vendor-item-binding/:kind/resolve", async (req, res) => resolveMaster(req, res, req.params.kind));

export default router;
