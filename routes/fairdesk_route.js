import express, { json } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
// import asyncHandler from "express-async-handler";
import Client from "../models/users/client.js";
import Username from "../models/users/username.js";
import Vendor from "../models/users/vendor.js";
import VendorUser from "../models/users/vendorUser.js";
import Employee from "../models/hr/employee_model.js";
import Label from "../models/inventory/labels.js";
import Ttr from "../models/inventory/ttr.js";
import Tape from "../models/inventory/tape.js";
import TapeBinding from "../models/inventory/tapeBinding.js";
import TapeSalesOrder from "../models/inventory/TapeSalesOrder.js";
import SystemId from "../models/system/systemId.js";
import Carelead from "../models/carelead.js";
import Calculator from "../models/utilities/calculator.js";
import Block from "../models/utilities/block_model.js";
import Die from "../models/utilities/die_model.js";
import TapeStock from "../models/inventory/TapeStock.js";
import TapeStockLog from "../models/inventory/TapeStockLog.js";
import SalesOrderLog from "../models/inventory/SalesOrderLog.js";
import PosRoll from "../models/inventory/posRoll.js";
import Tafeta from "../models/inventory/tafeta.js";
import PosRollBinding from "../models/inventory/posRollBinding.js";
import TafetaBinding from "../models/inventory/tafetaBinding.js";
import PosRollStock from "../models/inventory/PosRollStock.js";
import TafetaStock from "../models/inventory/TafetaStock.js";
import TtrBinding from "../models/inventory/ttrBinding.js";
import TtrStock from "../models/inventory/TtrStock.js";
import PosRollStockLog from "../models/inventory/PosRollStockLog.js";
import TafetaStockLog from "../models/inventory/TafetaStockLog.js";
import TtrStockLog from "../models/inventory/TtrStockLog.js";
import Location from "../models/system/location.js";
import Counter from "../models/system/counter.js";
import Sample from "../models/inventory/sample.js";
const router = express.Router();

function hashSignature(rawSignature) {
  return `sha256:${crypto.createHash("sha256").update(String(rawSignature ?? "")).digest("hex")}`;
}

function duplicateMasterMessage(item, productId) {
  return `${item} already exist with id: ${productId || "unknown"}`;
}

function canonicalizeLocationName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^[.,]+|[.,]+$/g, "");
}

router.use((req, res, next) => {
  const role = req.session?.authUser?.role;
  if (!role) return res.redirect("/login");

  if (role === "admin" || role === "hod") return next();

  if (role === "sales") {
    const path = req.path || "";
    if (path.startsWith("/sales/")) return next();
    if (req.method !== "GET") return res.redirect("/login");

    const allowedViewRoutes = [
      /^\/master\/view$/,
      /^\/client\/details\/[^/]+$/,
      /^\/tape\/view$/,
      /^\/tape\/profile\/[^/]+$/,
      /^\/pos-roll\/view$/,
      /^\/pos-roll\/profile\/[^/]+$/,
      /^\/tafeta\/view$/,
      /^\/tafeta\/profile\/[^/]+$/,
      /^\/ttr\/view$/,
      /^\/ttr\/profile\/[^/]+$/,
    ];

    if (allowedViewRoutes.some((re) => re.test(path))) return next();
    return res.redirect("/login");
  }

  return res.redirect("/login");
});

// ----------------------------------RateCalculator---------------------------------->
// Route for rate calculator.

router.get("/form/ratecalculator", async (req, res) => {
  let clients = await Username.distinct("clientName");
  res.render("utilities/rateCalculator.ejs", { clients });
});

// Route to handle rate calculator form submission
router.post("/form/ratecalculator", async (req, res) => {
  let formData = req.body;

  await Order.create(formData);
  res.send("Order created successfully!");
});

// ----------------------------------Client---------------------------------->
// route for client form.
router.get("/form/client", async (req, res) => {
  const getNextClientIdPreview = async () => {
    const counterDoc = await Counter.findOne({ key: "clientId" }).select("seq").lean();
    let nextSeq = Number(counterDoc?.seq || 0) + 1;

    // Skip any legacy collisions so preview stays aligned with generator behavior.
    while (await Client.exists({ clientId: `FS | CLIENT | ${nextSeq}` })) {
      nextSeq += 1;
    }
    return `FS | CLIENT | ${nextSeq}`;
  };

  let clients = await Client.distinct("clientName");
  const employees = await Employee.find({}, "empName").sort({ empName: 1 }).lean();
  let userCount = await Username.countDocuments();
  const previewClientId = await getNextClientIdPreview();
  res.render("users/clientForm.ejs", {
    JS: "clientForm.js",
    CSS: "tabOpt.css",
    title: "Client Form",
    userCount,
    previewClientId,
    clients,
    employees,
    notification: req.flash("notification"),
  });
});

function normalizeClientPart(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function duplicateClientMessage(clientId) {
  return `client already exist: "${clientId || "unknown"}"`;
}

function duplicateUserMessage(userName, clientName) {
  return `"${userName || "unknown"}" already exist for this "${clientName || "unknown"}"`;
}

function buildClientSignature(source) {
  return [
    normalizeClientPart(source.clientName),
    normalizeClientPart(source.clientType),
    normalizeClientPart(source.clientStatus),
    normalizeClientPart(source.hoLocation),
    normalizeClientPart(source.accountHead),
    normalizeClientPart(source.clientGst),
    normalizeClientPart(source.clientMsme),
    normalizeClientPart(source.clientGumasta),
    normalizeClientPart(source.clientPan),
  ].join("||");
}

function normalizeUserPart(value) {
  return String(value ?? "").trim();
}

function normalizeUserName(value) {
  return normalizeUserPart(value).toUpperCase();
}

function normalizeUserEmail(value) {
  return normalizeUserPart(value).toLowerCase();
}

function normalizeUserContact(value) {
  return normalizeUserPart(value).replace(/\D/g, "");
}

function buildUserSignature(source, clientId) {
  return [
    normalizeClientPart(clientId),
    normalizeUserName(source.userName),
    normalizeUserEmail(source.userEmail),
    normalizeUserContact(source.userContact),
  ].join("||");
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Route to handle CLIENT form submission
router.post("/form/client", async (req, res) => {
  try {
    const generateClientId = async () => {
      const maxAttempts = 10000;
      for (let i = 0; i < maxAttempts; i++) {
        const counter = await Counter.findOneAndUpdate(
          { key: "clientId" },
          { $inc: { seq: 1 } },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        ).lean();

        const candidateId = `FS | CLIENT | ${counter.seq}`;
        const exists = await Client.exists({ clientId: candidateId });
        if (!exists) return candidateId;
      }
      throw new Error("Unable to generate unique client id");
    };

    const clientName = String(req.body.clientName || "").trim();
    const clientType = String(req.body.clientType || "").trim();
    const clientStatus = String(req.body.clientStatus || "").trim();
    const hoLocation = String(req.body.hoLocation || "").trim();
    const accountHead = String(req.body.accountHead || "").trim();
    const clientGst = String(req.body.clientGst || "").trim();
    const clientMsme = String(req.body.clientMsme || "").trim();
    const clientGumasta = String(req.body.clientGumasta || "").trim();
    const clientPan = String(req.body.clientPan || "").trim();
    const clientSignature = hashSignature(buildClientSignature(req.body));

    // Prevent duplicates only when the full logical client entity matches.
    // clientId is auto-generated, so it is intentionally excluded from this match.
    const existingSameEntity = await Client.findOne({
      $or: [
        { clientSignature },
        {
          clientName: new RegExp(`^${escapeRegexLiteral(clientName)}$`, "i"),
          clientType: new RegExp(`^${escapeRegexLiteral(clientType)}$`, "i"),
          clientStatus: new RegExp(`^${escapeRegexLiteral(clientStatus)}$`, "i"),
          hoLocation: new RegExp(`^${escapeRegexLiteral(hoLocation)}$`, "i"),
          accountHead: new RegExp(`^${escapeRegexLiteral(accountHead)}$`, "i"),
          clientGst: new RegExp(`^${escapeRegexLiteral(clientGst)}$`, "i"),
          clientMsme: new RegExp(`^${escapeRegexLiteral(clientMsme)}$`, "i"),
          clientGumasta: new RegExp(`^${escapeRegexLiteral(clientGumasta)}$`, "i"),
          clientPan: new RegExp(`^${escapeRegexLiteral(clientPan)}$`, "i"),
        },
      ],
    })
      .select("clientId")
      .lean();

    if (existingSameEntity) {
      return res.status(400).json({
        success: false,
        message: duplicateClientMessage(existingSameEntity.clientId),
      });
    }

    const formData = {
      clientId: await generateClientId(),
      clientName,
      clientType,
      clientStatus,
      hoLocation,
      accountHead,
      clientGst,
      clientMsme,
      clientGumasta,
      clientPan,
      clientSignature,
    };

    await Client.create(formData);
    req.flash("notification", "Client created successfully!");
    res.json({ success: true, redirect: "/fairdesk/client/view" });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const existingClient = await Client.findOne({ clientSignature })
        .select("clientId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateClientMessage(existingClient?.clientId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get("/form/client/:name", async (req, res) => {
  let clientData = await Client.findOne({ clientName: req.params.name });
  let clientName = clientData;
  res.status(200).json(clientName);
});

// ----------------------------------Username---------------------------------->
// Route to handle USER form submission
router.post("/form/user", async (req, res) => {
  try {
    const { objectId } = req.body;
    let client = null;
    if (objectId) {
      client = await Client.findOne({ _id: objectId });
    }
    if (!client) {
      const clientIdFallback = String(req.body.clientId || "").trim();
      const clientNameFallback = String(req.body.clientName || "").trim();
      if (clientIdFallback) {
        client = await Client.findOne({ clientId: clientIdFallback });
      }
      if (!client && clientNameFallback) {
        client = await Client.findOne({ clientName: new RegExp(`^${escapeRegexLiteral(clientNameFallback)}$`, "i") });
      }
    }
    if (!client) {
      return res.status(400).json({ success: false, message: "Invalid client selected" });
    }

    const clientId = String(client.clientId || "").trim();
    const userName = String(req.body.userName || "").trim();
    const userContact = String(req.body.userContact || "").trim();
    const userEmail = String(req.body.userEmail || "")
      .trim()
      .toLowerCase();
    const userSignature = hashSignature(buildUserSignature(req.body, clientId));

    // Prevent duplicates only on full identity tuple within the same client.
    const duplicateUser = await Username.findOne({
      $or: [
        { userSignature },
        {
          clientId,
          userName: new RegExp(`^${escapeRegexLiteral(userName)}$`, "i"),
          userEmail: new RegExp(`^${escapeRegexLiteral(userEmail)}$`, "i"),
          userContact: new RegExp(`^${escapeRegexLiteral(userContact)}$`, "i"),
        },
      ],
    })
      .select("userName clientName")
      .lean();

    if (duplicateUser) {
      return res.status(400).json({
        success: false,
        message: duplicateUserMessage(duplicateUser.userName, duplicateUser.clientName || client.clientName),
      });
    }

    const newUser = await Username.create({
      ...req.body,
      clientId,
      clientName: client.clientName,
      clientType: client.clientType,
      hoLocation: client.hoLocation,
      accountHead: client.accountHead,
      userName,
      userContact,
      userEmail,
      userSignature,
    });

    client.users.push(newUser);
    await client.save();

    req.flash("notification", "User created successfully!");
    res.json({ success: true, redirect: "/fairdesk/master/view" });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const clientId = String(req.body.clientId || "").trim();
      const userName = String(req.body.userName || "").trim();
      const userEmail = String(req.body.userEmail || "")
        .trim()
        .toLowerCase();
      const userContact = String(req.body.userContact || "").trim();
      const fallbackUserSignature = hashSignature(buildUserSignature(req.body, clientId));
      const existingUser = await Username.findOne({
        $or: [
          { userSignature: fallbackUserSignature },
          {
            clientId,
            userName: new RegExp(`^${escapeRegexLiteral(userName)}$`, "i"),
            userEmail: new RegExp(`^${escapeRegexLiteral(userEmail)}$`, "i"),
            userContact: new RegExp(`^${escapeRegexLiteral(userContact)}$`, "i"),
          },
        ],
      })
        .select("userName clientName")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateUserMessage(existingUser?.userName || userName, existingUser?.clientName),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------Labels---------------------------------->
// route for datasheet form.
router.get("/form/labels", async (req, res) => {
  let clients = await Client.distinct("clientName");
  let labelsCount = (await Label.countDocuments()) + 1;
  console.log(clients);

  res.render("inventory/labels.ejs", {
    title: "Labels",
    JS: "labels.js",
    CSS: false,
    clients,
    labelsCount,
    notification: req.flash("notification"),
  });
});

// Route to handle datasheet form submission.
router.post("/form/labels", async (req, res) => {
  try {
    let { userObjId } = req.body;
    let savedLabel = await Label.create(req.body);
    let user = await Username.findOne({ _id: userObjId });
    user.label.push(savedLabel);
    await user.save();

    req.flash("notification", "Label created successfully!");
    res.json({ success: true, redirect: "/fairdesk/form/labels" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get("/form/labels/:name", async (req, res) => {
  let clientData = await Client.findOne({ clientName: req.params.name }).populate("users");
  let clientName = clientData;
  console.log(clientName.users);
  console.log(clientName);
  res.status(200).json(clientName);
});

// ----------------------------------Samples---------------------------------->
// Helper: build the counter key and format the sample code
function getMaterialAbbreviation(material) {
  const mat = String(material || "UNKNOWN").trim().toUpperCase();
  if (mat === "FACE PAPER") return "FP";
  if (mat === "ADHESIVE") return "ADH";
  if (mat === "RELEASE PAPER") return "RP";
  if (mat === "SL (PAPER)") return "SL";
  if (mat === "POS ROLL") return "POS";
  return mat.replace(/\s+/g, "-");
}

function formatSampleCode(material, category, seq) {
  const mat = getMaterialAbbreviation(material);
  const cat = category === "client" ? "CSMP" : "VSMP";
  return `FS | ${mat} | ${cat} | ${String(seq).padStart(6, "0")}`;
}

function sampleCounterKey(material, category) {
  const mat = getMaterialAbbreviation(material);
  const cat = category === "client" ? "CSMP" : "VSMP";
  return `sampleCode_${mat}_${cat}`;
}

// GET: preview next sample code (called by client-side JS on radio change)
router.get("/form/samples/next-code", async (req, res) => {
  try {
    const material = String(req.query.material || "").trim();
    const category = String(req.query.category || "vendor").trim().toLowerCase();
    if (!material) return res.json({ code: "" });

    const key = sampleCounterKey(material, category);
    const counterDoc = await Counter.findOne({ key }).select("seq").lean();
    let nextSeq = Number(counterDoc?.seq || 0) + 1;

    while (await Sample.exists({ sampleCode: formatSampleCode(material, category, nextSeq) })) {
      nextSeq += 1;
    }

    return res.json({ code: formatSampleCode(material, category, nextSeq) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ code: "" });
  }
});

router.get("/form/samples", async (req, res) => {
  res.render("inventory/samples.ejs", {
    title: "Samples",
    CSS: false,
    JS: false,
    notification: req.flash("notification"),
  });
});

router.post("/form/samples", async (req, res) => {
  try {
    const activeTab = String(req.body.sampleCategory || "").trim().toLowerCase() === "client" ? "client" : "vendor";

    const material = String(req.body.sampleMaterial || "").trim();
    const key = sampleCounterKey(material, activeTab);

    const generateSampleCode = async () => {
      const maxAttempts = 10000;
      for (let i = 0; i < maxAttempts; i++) {
        const counter = await Counter.findOneAndUpdate(
          { key },
          { $inc: { seq: 1 } },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        ).lean();

        const candidateCode = formatSampleCode(material, activeTab, counter.seq);
        const exists = await Sample.exists({ sampleCode: candidateCode });
        if (!exists) return candidateCode;
      }
      throw new Error("Unable to generate unique sample code");
    };

    const sampleCode = material ? await generateSampleCode() : String(req.body.sampleCode || "").trim();

    await Sample.create({ ...req.body, sampleCode, sampleCategory: activeTab, sampleMaterial: material });

    req.flash("notification", `${activeTab === "client" ? "Client" : "Vendor"} sample submitted successfully!`);
    res.json({ success: true, redirect: `/fairdesk/form/samples?tab=${activeTab}` });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------CareLead---------------------------------->
// route for carelead form.
router.get("/form/carelead", (req, res) => {
  res.render("careLead.ejs");
});

// Route to handle carelead form submission.
router.post("/form/carelead", async (req, res) => {
  let formData = req.body;

  await Carelead.create(formData);
  res.send("care lead created successfully!");
});

// ----------------------------------CareCallReport---------------------------------->
// route for carecallreport form.
router.get("/form/carecallreport", (req, res) => {
  res.render("careCallReport.ejs");
});

// Route to handle carecallreport form submission.
router.post("/form/carecallreport", async (req, res) => {
  let formData = req.body;

  await Carelead.create(formData);
  res.send("care call report created successfully!");
});

// ----------------------------------SystemId---------------------------------->
// route for systemid form.
router.get("/form/systemid", async (req, res) => {
  let systemIdCount = await SystemId.countDocuments();
  res.render("systemId.ejs", { systemIdCount });
  res.render("systemId.ejs");
});

// Route to handle systemid form submission.
router.post("/form/systemid", async (req, res) => {
  let formData = req.body;

  await SystemId.create(formData);
  res.send("care call report created successfully!");
});

// ----------------------------------WorkshopReport---------------------------------->
// route for careworkshopreport form.
router.get("/form/careworkshopreport", (req, res) => {
  res.render("careWokshopReport.ejs");
});

// Route to handle careworkshopreport form submission.
router.post("/form/careworkshopreport", async (req, res) => {
  let formData = req.body;

  await Carelead.create(formData);
  res.send("care call report created successfully!");
});

// ----------------------------------CareQuote---------------------------------->
// route for carequote form.
router.get("/form/carequote", (req, res) => {
  res.render("careQuote.ejs");
});

// Route to handle carequote form submission.
router.post("/form/carequote", async (req, res) => {
  let formData = req.body;

  await Carelead.create(formData);
  res.send("care quote created successfully!");
});

// ----------------------------------TTR---------------------------------->
function normalizeTtrPart(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildTtrSignature(source) {
  return [
    normalizeTtrPart(source.ttrType),
    normalizeTtrPart(source.ttrColor),
    normalizeTtrPart(source.ttrMaterialCode),
    normalizeTtrPart(source.ttrWidth),
    normalizeTtrPart(source.ttrMtrs),
    normalizeTtrPart(source.ttrInkFace),
    normalizeTtrPart(source.ttrCoreId),
    normalizeTtrPart(source.ttrCoreLength),
    normalizeTtrPart(source.ttrNotch),
    normalizeTtrPart(source.ttrWinding),
    normalizeTtrPart(source.ttrMinQty),
  ].join("||");
}

const DEFAULT_TTR_SPECS = {
  ttrWidth: 0,
  ttrMtrs: 0,
  ttrInkFace: "IN",
  ttrCoreId: "1",
  ttrCoreLength: 0,
  ttrNotch: "NO",
  ttrWinding: "NORMAL",
  ttrMinQty: 1,
};

const DEFAULT_VENDOR_TTR_OVERRIDES = {
  ttrMtrsDel: "0",
  ttrRatePerRoll: 0,
  ttrSaleCost: 0,
  ttrMinQty: 1,
  ttrOdrQty: 1,
  ttrOdrFreq: "N/A",
  ttrCreditTerm: "N/A",
  vendorTapePaperCode: "N/A",
  vendorTapeGsm: 0,
  tapeMtrsDel: 0,
  tapeRatePerRoll: 0,
  tapeSaleCost: 0,
  tapeMinQty: 1,
  tapeOdrQty: 1,
  tapeOdrFreq: "N/A",
  tapeCreditTerm: "N/A",
};

const trimOr = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  const out = String(value).trim();
  return out === "" ? fallback : out;
};

const numOr = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function flexTtrValue(val) {
  if (val === undefined || val === null) return val;
  const arr = [val];
  if (typeof val === "string") {
    const t = val.trim();
    if (t !== val) arr.push(t);
    const n = Number(t);
    if (t !== "" && !Number.isNaN(n)) arr.push(n);
  } else {
    arr.push(String(val));
  }
  return { $in: arr };
}

// GET: TTR Master form
router.get("/form/ttr", async (req, res) => {
  const formatTtrProductId = (n) => `FS | TTR | ${String(n).padStart(6, "0")}`;
  const parseTtrSeq = (productId) => {
    const match = String(productId || "").match(/(\d{6})$/);
    return match ? Number(match[1]) : 0;
  };
  const getNextTtrProductIdPreview = async () => {
    const latestTtr = await Ttr.findOne().sort({ ttrProductId: -1 }).select("ttrProductId").lean();
    let nextSeq = parseTtrSeq(latestTtr?.ttrProductId) + 1;

    while (await Ttr.exists({ ttrProductId: formatTtrProductId(nextSeq) })) {
      nextSeq += 1;
    }
    return formatTtrProductId(nextSeq);
  };

  const previewTtrProductId = await getNextTtrProductIdPreview();

  res.render("inventory/ttr.ejs", {
    JS: false,
    CSS: false,
    title: "TTR",
    previewTtrProductId,
    notification: req.flash("notification"),
  });
});

// GET: Check if TTR already exists (used by client-side precheck)
router.get("/form/ttr/exists", async (req, res) => {
  try {
    const normalized = {
      ...DEFAULT_TTR_SPECS,
      ...req.query,
      ttrType: trimOr(req.query.ttrType),
      ttrColor: trimOr(req.query.ttrColor, "BLACK"),
      ttrMaterialCode: trimOr(req.query.ttrMaterialCode),
      ttrMinQty: numOr(req.query.ttrMinQty, DEFAULT_TTR_SPECS.ttrMinQty),
    };

    if ([normalized.ttrType, normalized.ttrColor, normalized.ttrMaterialCode, req.query.ttrMinQty].some((v) => trimOr(v) === "")) {
      return res.json({ exists: false });
    }

    const signatureSource = { ...DEFAULT_TTR_SPECS, ...normalized };
    if (buildTtrSignature(signatureSource).split("||").some((part) => part === "")) {
      return res.json({ exists: false });
    }

    const ttrSignature = hashSignature(buildTtrSignature(signatureSource));
    const legacyMatch = {
      ttrType: flexTtrValue(normalized.ttrType),
      ttrColor: flexTtrValue(normalized.ttrColor),
      ttrMaterialCode: flexTtrValue(normalized.ttrMaterialCode),
      ttrWidth: flexTtrValue(signatureSource.ttrWidth),
      ttrMtrs: numOr(signatureSource.ttrMtrs),
      ttrInkFace: flexTtrValue(signatureSource.ttrInkFace),
      ttrCoreId: flexTtrValue(signatureSource.ttrCoreId),
      ttrCoreLength: numOr(signatureSource.ttrCoreLength),
      ttrNotch: flexTtrValue(signatureSource.ttrNotch),
      ttrWinding: flexTtrValue(signatureSource.ttrWinding),
      ttrMinQty: numOr(signatureSource.ttrMinQty),
    };

    const existingTtr = await Ttr.findOne({
      $or: [{ ttrSignature }, legacyMatch],
    })
      .select("ttrProductId")
      .lean();

    return res.json({
      exists: !!existingTtr,
      id: existingTtr?.ttrProductId || "",
      ttrId: existingTtr?._id || "",
      message: existingTtr ? duplicateMasterMessage("TTR", existingTtr.ttrProductId) : "",
    });
  } catch (err) {
    console.error("TTR EXISTS CHECK ERROR:", err);
    return res.status(500).json({ exists: false });
  }
});

// POST: TTR Master submission
router.post("/form/ttr", async (req, res) => {
  console.log("TTR MASTER BODY", req.body);
  try {
    const formatTtrProductId = (n) => `FS | TTR | ${String(n).padStart(6, "0")}`;
    const parseTtrSeq = (productId) => {
      const match = String(productId || "").match(/(\d{6})$/);
      return match ? Number(match[1]) : 0;
    };
    const generateTtrProductId = async () => {
      let nextSeq = parseTtrSeq(
        (await Ttr.findOne().sort({ ttrProductId: -1 }).select("ttrProductId").lean())?.ttrProductId,
      ) + 1;

      const maxAttempts = 10000;
      for (let i = 0; i < maxAttempts; i++) {
        const candidateId = formatTtrProductId(nextSeq);
        const exists = await Ttr.exists({ ttrProductId: candidateId });
        if (!exists) return candidateId;
        nextSeq += 1;
      }
      throw new Error("Unable to generate unique TTR product id");
    };

    // Prevent duplicates based on TTR specs (productId is always unique).
    const ttrSignature = hashSignature(buildTtrSignature(req.body));
    const widthRaw = req.body.ttrWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;
    const coreLengthNum = Number(req.body.ttrCoreLength);
    const minQtyNum = Number(req.body.ttrMinQty);
    if (!Number.isFinite(coreLengthNum)) {
      return res.status(400).json({
        success: false,
        message: "Core Length must be a valid number.",
      });
    }
    if (!Number.isFinite(minQtyNum) || minQtyNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Minimum Qty must be a valid number.",
      });
    }

    const duplicateTtrQuery = {
      $or: [
        { ttrSignature },
        {
          ttrType: flexTtrValue(req.body.ttrType),
          ttrColor: flexTtrValue(req.body.ttrColor),
          ttrMaterialCode: flexTtrValue(req.body.ttrMaterialCode),
          ttrWidth: flexTtrValue(widthVal),
          ttrMtrs: Number(req.body.ttrMtrs),
          ttrInkFace: flexTtrValue(req.body.ttrInkFace),
          ttrCoreId: flexTtrValue(req.body.ttrCoreId),
          ttrCoreLength: Number(req.body.ttrCoreLength),
          ttrNotch: flexTtrValue(req.body.ttrNotch),
          ttrWinding: flexTtrValue(req.body.ttrWinding),
          ttrMinQty: minQtyNum,
        },
      ],
    };
    const alreadyExists = await Ttr.findOne(duplicateTtrQuery).select("ttrProductId").lean();
    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("TTR", alreadyExists.ttrProductId),
      });
    }

    const data = {
      ttrProductId: await generateTtrProductId(),
      ttrType: String(req.body.ttrType).trim(),
      ttrColor: String(req.body.ttrColor).trim(),
      ttrMaterialCode: String(req.body.ttrMaterialCode).trim(),
      ttrWidth: widthVal,
      ttrMtrs: Number(req.body.ttrMtrs),
      ttrInkFace: String(req.body.ttrInkFace).trim(),
      ttrCoreId: String(req.body.ttrCoreId).trim(),
      ttrCoreLength: coreLengthNum,
      ttrNotch: String(req.body.ttrNotch).trim(),
      ttrWinding: String(req.body.ttrWinding).trim(),
      ttrMinQty: minQtyNum,
      ttrSignature,
      createdBy: req.user?.username || "SYSTEM",
    };

    const createdTtr = await Ttr.create(data);

    req.flash("notification", "TTR created successfully!");
    res.json({ success: true, redirect: "/fairdesk/ttr/view", id: createdTtr._id, ttrProductId: createdTtr.ttrProductId });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicateTtr = await Ttr.findOne({ ttrSignature: hashSignature(buildTtrSignature(req.body)) })
        .select("ttrProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("TTR", duplicateTtr?.ttrProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------Tape---------------------------------->
// route for tape form.
// router.get("/form/tape", async (req, res) => {
//   let clients = await Client.distinct("clientName");
//   let tapeCount = await Tape.countDocuments();

//   res.render("forms/tape.ejs", {
//     JS: "ttr.js",
//     CSS: false,
//     title: "Tape",
//     clients,
//     tapeCount,
//     notification: req.flash("notification"),
//   });
// });

// Route to handle tape form submission.
// router.post("/form/tape", async (req, res) => {
//   let { userId } = req.body;
//   let tapeData = await Tape.create(req.body);

//   let user = await Username.findOne({ _id: userId });
//   user.tape.push(tapeData);
//   await user.save();

//   req.flash("notification", "Tape created successfully!");
//   res.redirect("/fairdesk/form/tape");
// });

// ----------------------------------Tape Master---------------------------------->

// GET: Tape Master form
router.get("/form/tape-master", async (req, res) => {
  const formatTapeId = (n) => `FS | Tape | ${String(n).padStart(6, "0")}`;
  const parseTapeSeq = (productId) => {
    const match = String(productId || "").match(/(\d{6})$/);
    return match ? Number(match[1]) : 0;
  };
  const getNextTapeIdPreview = async () => {
    const latestTape = await Tape.findOne().sort({ tapeProductId: -1 }).select("tapeProductId").lean();
    let nextSeq = parseTapeSeq(latestTape?.tapeProductId) + 1;

    while (await Tape.exists({ tapeProductId: formatTapeId(nextSeq) })) {
      nextSeq += 1;
    }
    return formatTapeId(nextSeq);
  };

  const previewTapeProductId = await getNextTapeIdPreview();

  res.render("inventory/tape.ejs", {
    JS: false,
    CSS: false,
    title: "Tape Master",
    previewTapeProductId,
    notification: req.flash("notification"),
  });
});

// POST: Tape Master submission
router.post("/form/tape-master", async (req, res) => {
  console.log("TAPE MASTER BODY", req.body);
  try {
    const formatTapeId = (n) => `FS | Tape | ${String(n).padStart(6, "0")}`;
    const parseTapeSeq = (productId) => {
      const match = String(productId || "").match(/(\d{6})$/);
      return match ? Number(match[1]) : 0;
    };
    const generateTapeProductId = async () => {
      let nextSeq = parseTapeSeq(
        (await Tape.findOne().sort({ tapeProductId: -1 }).select("tapeProductId").lean())?.tapeProductId,
      ) + 1;

      const maxAttempts = 10000;
      for (let i = 0; i < maxAttempts; i++) {
        const candidateId = formatTapeId(nextSeq);
        const exists = await Tape.exists({ tapeProductId: candidateId });
        if (!exists) return candidateId;
        nextSeq += 1;
      }
      throw new Error("Unable to generate unique tape product id");
    };

    // Prevent duplicates based on tape specs (productId is always unique).
    const tapeSignature = hashSignature(buildTapeSignature(req.body));
    const widthRaw = req.body.tapeWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;

    const duplicateTapeQuery = {
      $or: [
        { tapeSignature },
        {
          tapePaperCode: flexTapeValue(req.body.tapePaperCode),
          tapeGsm: flexTapeValue(Number(req.body.tapeGsm)),
          tapePaperType: flexTapeValue(req.body.tapePaperType),
          tapeWidth: flexTapeValue(widthVal),
          tapeMtrs: flexTapeValue(Number(req.body.tapeMtrs)),
          tapeCoreId: flexTapeValue(Number(req.body.tapeCoreId)),
          tapeAdhesiveGsm: flexTapeValue(req.body.tapeAdhesiveGsm),
          tapeFinish: flexTapeValue(req.body.tapeFinish),
        },
      ],
    };
    const alreadyExists = await Tape.findOne(duplicateTapeQuery).select("tapeProductId").lean();
    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("Tape", alreadyExists.tapeProductId),
      });
    }

    const data = {
      tapeProductId: await generateTapeProductId(),
      tapePaperCode: String(req.body.tapePaperCode).trim(),
      tapeGsm: Number(req.body.tapeGsm),
      tapePaperType: String(req.body.tapePaperType).trim(),
      tapeWidth: widthVal,
      tapeMtrs: Number(req.body.tapeMtrs),
      tapeCoreId: Number(req.body.tapeCoreId),
      tapeAdhesiveGsm: String(req.body.tapeAdhesiveGsm).trim(),
      tapeFinish: String(req.body.tapeFinish).trim(),
      tapeSignature,
      createdBy: req.user?.username || "SYSTEM",
    };

    await Tape.create(data);

    req.flash("notification", "Tape Master created successfully!");
    res.json({ success: true, redirect: "/fairdesk/tape/view" });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicateTape = await Tape.findOne({ tapeSignature: hashSignature(buildTapeSignature(req.body)) })
        .select("tapeProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("Tape", duplicateTape?.tapeProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// Route to render Edit USER form
router.get("/form/edit/user/:userId", async (req, res) => {
  try {
    let { userId } = req.params;
    let user = await Username.findById(userId);

    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/fairdesk/users/master");
    }

    res.render("users/editUser", {
      CSS: "tabOpt.css",
      title: "Edit User",
      JS: false,
      user,
      notification: req.flash("notification"),
      error: req.flash("error"),
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Error loading user data.");
    res.redirect("back");
  }
});

// Route to handle Edit USER submission
router.post("/form/edit/user/:userId", async (req, res) => {
  try {
    let { userId } = req.params;
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const currentUser = await Username.findById(userId);
    if (!currentUser) {
      req.flash("error", "User not found.");
      return res.redirect("/fairdesk/users/master");
    }

    const updateData = {
      userName: String(req.body.userName || "").trim(),
      userLocation: String(req.body.userLocation || "").trim(),
      userDepartment: String(req.body.userDepartment || "").trim(),
      userContact: String(req.body.userContact || "").trim(),
      userEmail: String(req.body.userEmail || "")
        .trim()
        .toLowerCase(),
      dispatchAddress: String(req.body.dispatchAddress || "").trim(),
      transportName: String(req.body.transportName || "").trim(),
      transportContact: String(req.body.transportContact || "").trim(),
      dropLocation: String(req.body.dropLocation || "").trim(),
      deliveryMode: String(req.body.deliveryMode || "").trim(),
      deliveryLocation: String(req.body.deliveryLocation || "").trim(),
      clientPayment: String(req.body.clientPayment || "").trim(),
      SelfDispatch: String(req.body.SelfDispatch || "").trim(),
    };
    updateData.userSignature = hashSignature(buildUserSignature(updateData, currentUser.clientId));

    // Cleanup if self dispatch is enabled, ensure transport fields are empty
    if (updateData.SelfDispatch) {
      updateData.transportName = "";
      updateData.transportContact = "";
      updateData.dropLocation = "";
      updateData.deliveryMode = "";
      updateData.deliveryLocation = "";
      updateData.clientPayment = "";
    } else {
      updateData.SelfDispatch = "";
    }

    // Prevent duplicate full-entity user data within the same client.
    const duplicateUser = await Username.findOne({
      _id: { $ne: userId },
      clientId: currentUser.clientId,
      userName: new RegExp(`^${escapeRegex(updateData.userName)}$`, "i"),
      userLocation: new RegExp(`^${escapeRegex(updateData.userLocation)}$`, "i"),
      userDepartment: new RegExp(`^${escapeRegex(updateData.userDepartment)}$`, "i"),
      userContact: new RegExp(`^${escapeRegex(updateData.userContact)}$`, "i"),
      userEmail: new RegExp(`^${escapeRegex(updateData.userEmail)}$`, "i"),
      dispatchAddress: new RegExp(`^${escapeRegex(updateData.dispatchAddress)}$`, "i"),
      transportName: new RegExp(`^${escapeRegex(updateData.transportName)}$`, "i"),
      transportContact: new RegExp(`^${escapeRegex(updateData.transportContact)}$`, "i"),
      dropLocation: new RegExp(`^${escapeRegex(updateData.dropLocation)}$`, "i"),
      deliveryMode: new RegExp(`^${escapeRegex(updateData.deliveryMode)}$`, "i"),
      deliveryLocation: new RegExp(`^${escapeRegex(updateData.deliveryLocation)}$`, "i"),
      clientPayment: new RegExp(`^${escapeRegex(updateData.clientPayment)}$`, "i"),
      SelfDispatch: new RegExp(`^${escapeRegex(updateData.SelfDispatch)}$`, "i"),
    }).lean();

    if (duplicateUser) {
      req.flash("error", "User already exists (same full details).");
      return res.redirect("back");
    }

    await Username.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true });

    req.flash("notification", "User details updated successfully!");
    res.redirect(`/fairdesk/client/details/${userId}`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Error updating user details.");
    res.redirect("back");
  }
});

// ----------------------------------POS Roll Master---------------------------------->

// GET: POS Roll Master form
router.get("/form/pos-roll-master", async (req, res) => {
  const formatPosProductId = (n) => `FS | POS Roll | ${String(n).padStart(6, "0")}`;
  const parsePosSeq = (productId) => {
    const match = String(productId || "").match(/(\d{6})$/);
    return match ? Number(match[1]) : 0;
  };
  const getNextPosProductIdPreview = async () => {
    const latestPos = await PosRoll.findOne().sort({ posProductId: -1 }).select("posProductId").lean();
    let nextSeq = parsePosSeq(latestPos?.posProductId) + 1;

    while (await PosRoll.exists({ posProductId: formatPosProductId(nextSeq) })) {
      nextSeq += 1;
    }
    return formatPosProductId(nextSeq);
  };

  const previewPosProductId = await getNextPosProductIdPreview();

  res.render("inventory/posRoll.ejs", {
    JS: false,
    CSS: false,
    title: "POS Roll Master",
    previewPosProductId,
    notification: req.flash("notification"),
  });
});

// POST: POS Roll Master submission
router.post("/form/pos-roll-master", async (req, res) => {
  console.log("POS ROLL MASTER BODY", req.body);
  try {
    const formatPosProductId = (n) => `FS | POS Roll | ${String(n).padStart(6, "0")}`;
    const parsePosSeq = (productId) => {
      const match = String(productId || "").match(/(\d{6})$/);
      return match ? Number(match[1]) : 0;
    };
    const generatePosProductId = async () => {
      let nextSeq = parsePosSeq(
        (await PosRoll.findOne().sort({ posProductId: -1 }).select("posProductId").lean())?.posProductId,
      ) + 1;

      const maxAttempts = 10000;
      for (let i = 0; i < maxAttempts; i++) {
        const candidateId = formatPosProductId(nextSeq);
        const exists = await PosRoll.exists({ posProductId: candidateId });
        if (!exists) return candidateId;
        nextSeq += 1;
      }
      throw new Error("Unable to generate unique POS Roll product id");
    };

    // Prevent duplicates based on POS Roll specs (productId is always unique).
    const posSignature = hashSignature(buildPosSignature(req.body));
    const widthRaw = req.body.posWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;

    const duplicatePosQuery = {
      $or: [
        { posSignature },
        {
          posPaperCode: flexPosValue(req.body.posPaperCode),
          posPaperType: flexPosValue(req.body.posPaperType),
          posColor: flexPosValue(req.body.posColor),
          posGsm: flexPosValue(Number(req.body.posGsm)),
          posWidth: flexPosValue(widthVal),
          posMtrs: flexPosValue(Number(req.body.posMtrs)),
          posCoreId: flexPosValue(Number(req.body.posCoreId)),
        },
      ],
    };
    const alreadyExists = await PosRoll.findOne(duplicatePosQuery).select("posProductId").lean();
    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("POS Roll", alreadyExists.posProductId),
      });
    }

    const data = {
      posProductId: await generatePosProductId(),
      posPaperCode: String(req.body.posPaperCode).trim(),
      posPaperType: String(req.body.posPaperType).trim(),
      posColor: String(req.body.posColor).trim(),
      posGsm: Number(req.body.posGsm),
      posWidth: widthVal,
      posMtrs: Number(req.body.posMtrs),
      posCoreId: Number(req.body.posCoreId),
      posSignature,
    };

    await PosRoll.create(data);

    req.flash("notification", "POS Roll Master created successfully!");
    res.json({ success: true, redirect: "/fairdesk/pos-roll/view" });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicatePosRoll = await PosRoll.findOne({ posSignature: hashSignature(buildPosSignature(req.body)) })
        .select("posProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("POS Roll", duplicatePosRoll?.posProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------Tafeta Master---------------------------------->

// GET: Tafeta Master form
router.get("/form/tafeta-master", async (req, res) => {
  const formatTafetaProductId = (n) => `FS | Tafeta | ${String(n).padStart(6, "0")}`;
  const parseTafetaSeq = (productId) => {
    const match = String(productId || "").match(/(\d{6})$/);
    return match ? Number(match[1]) : 0;
  };
  const getNextTafetaProductIdPreview = async () => {
    const latestTafeta = await Tafeta.findOne().sort({ tafetaProductId: -1 }).select("tafetaProductId").lean();
    let nextSeq = parseTafetaSeq(latestTafeta?.tafetaProductId) + 1;

    while (await Tafeta.exists({ tafetaProductId: formatTafetaProductId(nextSeq) })) {
      nextSeq += 1;
    }
    return formatTafetaProductId(nextSeq);
  };

  const previewTafetaProductId = await getNextTafetaProductIdPreview();

  res.render("inventory/tafeta.ejs", {
    JS: false,
    CSS: false,
    title: "Tafeta Master",
    previewTafetaProductId,
    notification: req.flash("notification"),
  });
});

// POST: Tafeta Master submission
router.post("/form/tafeta-master", async (req, res) => {
  console.log("TAFETA MASTER BODY", req.body);
  try {
    const formatTafetaProductId = (n) => `FS | Tafeta | ${String(n).padStart(6, "0")}`;
    const parseTafetaSeq = (productId) => {
      const match = String(productId || "").match(/(\d{6})$/);
      return match ? Number(match[1]) : 0;
    };
    const generateTafetaProductId = async () => {
      let nextSeq = parseTafetaSeq(
        (await Tafeta.findOne().sort({ tafetaProductId: -1 }).select("tafetaProductId").lean())?.tafetaProductId,
      ) + 1;

      const maxAttempts = 10000;
      for (let i = 0; i < maxAttempts; i++) {
        const candidateId = formatTafetaProductId(nextSeq);
        const exists = await Tafeta.exists({ tafetaProductId: candidateId });
        if (!exists) return candidateId;
        nextSeq += 1;
      }
      throw new Error("Unable to generate unique Tafeta product id");
    };

    // Prevent duplicates based on Tafeta specs (productId is always unique).
    const tafetaSignature = hashSignature(buildTafetaSignature(req.body));
    const widthRaw = req.body.tafetaWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;

    const duplicateTafetaQuery = {
      $or: [
        { tafetaSignature },
        {
          tafetaMaterialCode: flexTafetaValue(req.body.tafetaMaterialCode),
          tafetaMaterialType: flexTafetaValue(req.body.tafetaMaterialType),
          tafetaColor: flexTafetaValue(req.body.tafetaColor),
          tafetaGsm: flexTafetaValue(req.body.tafetaGsm),
          tafetaWidth: flexTafetaValue(widthVal),
          tafetaMtrs: flexTafetaValue(req.body.tafetaMtrs),
          tafetaCoreLen: flexTafetaValue(req.body.tafetaCoreLen),
          tafetaNotch: flexTafetaValue(req.body.tafetaNotch),
          tafetaCoreId: flexTafetaValue(req.body.tafetaCoreId),
        },
      ],
    };
    const alreadyExists = await Tafeta.findOne(duplicateTafetaQuery).select("tafetaProductId").lean();
    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("Tafeta", alreadyExists.tafetaProductId),
      });
    }

    const data = {
      tafetaProductId: await generateTafetaProductId(),
      tafetaMaterialCode: String(req.body.tafetaMaterialCode).trim(),
      tafetaMaterialType: String(req.body.tafetaMaterialType).trim(),
      tafetaColor: String(req.body.tafetaColor).trim(),
      tafetaGsm: String(req.body.tafetaGsm).trim(),
      tafetaWidth: widthVal,
      tafetaMtrs: String(req.body.tafetaMtrs).trim(),
      tafetaCoreLen: String(req.body.tafetaCoreLen).trim(),
      tafetaNotch: String(req.body.tafetaNotch).trim(),
      tafetaCoreId: String(req.body.tafetaCoreId).trim(),
      tafetaSignature,
    };

    await Tafeta.create(data);

    req.flash("notification", "Tafeta Master created successfully!");
    res.json({ success: true, redirect: "/fairdesk/tafeta/view" });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicateTafeta = await Tafeta.findOne({ tafetaSignature: hashSignature(buildTafetaSignature(req.body)) })
        .select("tafetaProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("Tafeta", duplicateTafeta?.tafetaProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------Location Master---------------------------------->

// GET: Location Master form
router.get("/form/location", async (req, res) => {
  const locations = await Location.find().sort({ locationName: 1 }).lean();

  res.render("inventory/locationMaster.ejs", {
    JS: false,
    CSS: false,
    title: "Location Master",
    locations,
    notification: req.flash("notification"),
  });
});

// POST: Location Master submission
router.post("/form/location", async (req, res) => {
  try {
    const locationName = String(req.body.locationName || "")
      .trim()
      .toUpperCase();

    const alreadyExists = await Location.exists({ locationName });
    if (alreadyExists) {
      return res.status(400).json({ success: false, message: "location already exist" });
    }

    await Location.create({ locationName });
    req.flash("notification", "Location created successfully!");
    res.json({ success: true, redirect: "/fairdesk/form/location" });
  } catch (err) {
    console.error(err);
    const msg = err.code === 11000 ? "location already exist" : err.message;
    res.status(400).json({ success: false, message: msg });
  }
});

// API: Get all locations as JSON
router.get("/api/locations", async (req, res) => {
  const locations = await Location.distinct("locationName");
  const normalizedLocations = [...new Set(
    locations
      .map((location) => canonicalizeLocationName(location))
      .filter(Boolean)
  )].sort();
  res.json(normalizedLocations);
});

// DELETE: Remove a location
router.delete("/api/locations/:id", async (req, res) => {
  try {
    await Location.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ================= TAPE MASTER LIST VIEW =================
router.get("/tape/view", async (req, res) => {
  const tapes = await Tape.find().sort({ tapeProductId: 1 }).lean();
  res.render("inventory/tapeMasterDisp.ejs", {
    jsonData: tapes,
    CSS: "tableDisp.css",
    JS: false,
    title: "Tape View",
    notification: req.flash("notification"),
  });
});

// ================= TAFETA MASTER LIST VIEW =================
router.get("/tafeta/view", async (req, res) => {
  const tafetas = await Tafeta.find().sort({ tafetaProductId: 1 }).lean();
  res.render("inventory/tafetaMasterDisp.ejs", {
    jsonData: tafetas,
    CSS: "tableDisp.css",
    JS: false,
    title: "Tafeta View",
    notification: req.flash("notification"),
  });
});

function normalizeTafetaPart(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildTafetaSignature(source) {
  return [
    normalizeTafetaPart(source.tafetaMaterialCode),
    normalizeTafetaPart(source.tafetaMaterialType),
    normalizeTafetaPart(source.tafetaColor),
    normalizeTafetaPart(source.tafetaGsm),
    normalizeTafetaPart(source.tafetaWidth),
    normalizeTafetaPart(source.tafetaMtrs),
    normalizeTafetaPart(source.tafetaCoreLen),
    normalizeTafetaPart(source.tafetaNotch),
    normalizeTafetaPart(source.tafetaCoreId),
  ].join("||");
}

function flexTafetaValue(val) {
  if (val === undefined || val === null) return val;
  const arr = [val];
  if (typeof val === "string") {
    const t = val.trim();
    if (t !== val) arr.push(t);
    const n = Number(t);
    if (t !== "" && !Number.isNaN(n)) arr.push(n);
  } else {
    arr.push(String(val));
  }
  return { $in: arr };
}

// ================= POS ROLL MASTER LIST VIEW =================
router.get("/pos-roll/view", async (req, res) => {
  const posRolls = await PosRoll.find().sort({ posProductId: 1 }).lean();
  res.render("inventory/posRollMasterDisp.ejs", {
    jsonData: posRolls,
    CSS: "tableDisp.css",
    JS: false,
    title: "POS Roll View",
    notification: req.flash("notification"),
  });
});

// ================= TTR MASTER LIST VIEW =================
router.get("/ttr/view", async (req, res) => {
  const ttrs = await Ttr.find().sort({ ttrProductId: 1 }).lean();
  res.render("inventory/ttrMasterDisp.ejs", {
    jsonData: ttrs,
    CSS: "tableDisp.css",
    JS: false,
    title: "TTR View",
    notification: req.flash("notification"),
  });
});

// ================= TAPE PROFILE VIEW =================
router.get("/tape/profile/:id", async (req, res) => {
  const tape = await Tape.findById(req.params.id).lean();

  if (!tape) {
    req.flash("notification", "Tape not found");
    return res.redirect("back");
  }

  const tapeBindings = await TapeBinding.find({ tapeId: req.params.id })
    .populate({ path: "userId", select: "userName clientName hoLocation" })
    .sort({ createdAt: -1 })
    .lean();

  const primaryBinding = tapeBindings[0] || null;
  const backUrl = primaryBinding?.userId?._id
    ? `/fairdesk/client/details/${primaryBinding.userId._id}`
    : "/fairdesk/tape/view";

  const rows = [
    { label: "Paper Code", value: tape.tapePaperCode || "N/A" },
    { label: "GSM", value: tape.tapeGsm ?? "N/A" },
    { label: "Paper Type", value: tape.tapePaperType || "N/A" },
    { label: "Adhesive GSM", value: tape.tapeAdhesiveGsm ?? "N/A" },
    { label: "Width", value: tape.tapeWidth ?? "N/A" },
    { label: "Meters", value: tape.tapeMtrs ?? "N/A" },
    { label: "Core ID", value: tape.tapeCoreId ?? "N/A" },
    { label: "Finish", value: tape.tapeFinish || "N/A" },
  ];

  res.render("inventory/itemView.ejs", {
    pageTitle: "Tape Details",
    sectionTitle: "Tape Details",
    valueHeader: "Value",
    editUrl: `/fairdesk/tape/edit/${tape._id}`,
    editLabel: "Edit Tape",
    rows,
    tape,
    tapeBindings,
    primaryBinding,
    backUrl,
    title: "Tape Details",
    CSS: false,
    JS: false,
    notification: req.flash("notification"),
  });
});

function normalizePosPart(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildPosSignature(source) {
  return [
    normalizePosPart(source.posPaperCode),
    normalizePosPart(source.posPaperType),
    normalizePosPart(source.posColor),
    normalizePosPart(source.posGsm),
    normalizePosPart(source.posWidth),
    normalizePosPart(source.posMtrs),
    normalizePosPart(source.posCoreId),
  ].join("||");
}

function flexPosValue(val) {
  if (val === undefined || val === null) return val;
  const arr = [val];
  if (typeof val === "string") {
    const t = val.trim();
    if (t !== val) arr.push(t);
    const n = Number(t);
    if (t !== "" && !Number.isNaN(n)) arr.push(n);
  } else {
    arr.push(String(val));
  }
  return { $in: arr };
}

function normalizeTapePart(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildTapeSignature(source) {
  return [
    normalizeTapePart(source.tapePaperCode),
    normalizeTapePart(source.tapePaperType),
    normalizeTapePart(source.tapeGsm),
    normalizeTapePart(source.tapeWidth),
    normalizeTapePart(source.tapeMtrs),
    normalizeTapePart(source.tapeCoreId),
    normalizeTapePart(source.tapeAdhesiveGsm),
    normalizeTapePart(source.tapeFinish),
  ].join("||");
}

function flexTapeValue(val) {
  if (val === undefined || val === null) return val;
  const arr = [val];
  if (typeof val === "string") {
    const t = val.trim();
    if (t !== val) arr.push(t);
    const n = Number(t);
    if (t !== "" && !Number.isNaN(n)) arr.push(n);
  } else {
    arr.push(String(val));
  }
  return { $in: arr };
}

// ================= TAPE EDIT =================
router.get("/tape/edit/:id", async (req, res) => {
  const tape = await Tape.findById(req.params.id).lean();
  if (!tape) return res.redirect("back");

  res.render("inventory/tapeEdit.ejs", {
    title: "Edit Tape",
    CSS: false,
    JS: false,
    tape,
  });
});

router.post("/tape/edit/:id", async (req, res) => {
  try {
    const widthRaw = req.body.tapeWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;

    const updateData = {
      tapePaperCode: String(req.body.tapePaperCode || "").trim(),
      tapeGsm: Number(req.body.tapeGsm),
      tapePaperType: String(req.body.tapePaperType || "").trim(),
      tapeWidth: widthVal,
      tapeMtrs: Number(req.body.tapeMtrs),
      tapeCoreId: Number(req.body.tapeCoreId),
      tapeAdhesiveGsm: String(req.body.tapeAdhesiveGsm || "").trim(),
      tapeFinish: String(req.body.tapeFinish || "").trim(),
    };
    updateData.tapeSignature = hashSignature(buildTapeSignature(updateData));

    const duplicateTapeQuery = {
      _id: { $ne: req.params.id },
      $or: [
        { tapeSignature: updateData.tapeSignature },
        {
          tapePaperCode: flexTapeValue(updateData.tapePaperCode),
          tapeGsm: flexTapeValue(updateData.tapeGsm),
          tapePaperType: flexTapeValue(updateData.tapePaperType),
          tapeWidth: flexTapeValue(updateData.tapeWidth),
          tapeMtrs: flexTapeValue(updateData.tapeMtrs),
          tapeCoreId: flexTapeValue(updateData.tapeCoreId),
          tapeAdhesiveGsm: flexTapeValue(updateData.tapeAdhesiveGsm),
          tapeFinish: flexTapeValue(updateData.tapeFinish),
        },
      ],
    };

    const duplicateTape = await Tape.findOne(duplicateTapeQuery).select("tapeProductId").lean();
    if (duplicateTape) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("Tape", duplicateTape.tapeProductId),
      });
    }

    await Tape.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    req.flash("notification", "Tape updated successfully!");
    res.json({ success: true, redirect: `/fairdesk/tape/view` });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicateTape = await Tape.findOne({
        _id: { $ne: req.params.id },
        tapeSignature: hashSignature(buildTapeSignature(req.body)),
      })
        .select("tapeProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("Tape", duplicateTape?.tapeProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ================= POS ROLL PROFILE VIEW =================
router.get("/pos-roll/profile/:id", async (req, res) => {
  const posRoll = await PosRoll.findById(req.params.id).lean();

  if (!posRoll) {
    req.flash("notification", "POS Roll not found");
    return res.redirect("back");
  }

  const posRollBindings = await PosRollBinding.find({ posRollId: req.params.id })
    .populate({ path: "userId", select: "userName clientName hoLocation" })
    .sort({ createdAt: -1 })
    .lean();

  const primaryBinding = posRollBindings[0] || null;
  const backUrl = primaryBinding?.userId?._id
    ? `/fairdesk/client/details/${primaryBinding.userId._id}`
    : "/fairdesk/pos-roll/view";

  const rows = [
    { label: "Paper Code", value: posRoll.posPaperCode || "N/A" },
    { label: "GSM", value: posRoll.posGsm ?? "N/A" },
    { label: "Paper Type", value: posRoll.posPaperType || "N/A" },
    { label: "Color", value: posRoll.posColor || "N/A" },
    { label: "Width", value: posRoll.posWidth ?? "N/A" },
    { label: "Meters", value: posRoll.posMtrs ?? "N/A" },
    { label: "Core ID", value: posRoll.posCoreId ?? "N/A" },
  ];

  res.render("inventory/itemView.ejs", {
    pageTitle: "POS Roll Details",
    sectionTitle: "POS Roll Details",
    valueHeader: "Value",
    editUrl: `/fairdesk/pos-roll/edit/${posRoll._id}`,
    editLabel: "Edit POS Roll",
    rows,
    posRoll,
    posRollBindings,
    primaryBinding,
    backUrl,
    title: "POS Roll Details",
    CSS: false,
    JS: false,
    notification: req.flash("notification"),
  });
});

// ================= POS ROLL EDIT =================
router.get("/pos-roll/edit/:id", async (req, res) => {
  const posRoll = await PosRoll.findById(req.params.id).lean();
  if (!posRoll) return res.redirect("back");

  res.render("inventory/posRollEdit.ejs", {
    title: "Edit POS Roll",
    CSS: false,
    JS: false,
    posRoll,
  });
});

router.post("/pos-roll/edit/:id", async (req, res) => {
  try {
    const widthRaw = req.body.posWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;

    const updateData = {
      posPaperCode: String(req.body.posPaperCode || "").trim(),
      posPaperType: String(req.body.posPaperType || "").trim(),
      posColor: String(req.body.posColor || "").trim(),
      posGsm: Number(req.body.posGsm),
      posWidth: widthVal,
      posMtrs: Number(req.body.posMtrs),
      posCoreId: Number(req.body.posCoreId),
    };
    updateData.posSignature = hashSignature(buildPosSignature(updateData));

    const duplicatePosQuery = {
      _id: { $ne: req.params.id },
      $or: [
        { posSignature: updateData.posSignature },
        {
          posPaperCode: flexPosValue(updateData.posPaperCode),
          posPaperType: flexPosValue(updateData.posPaperType),
          posColor: flexPosValue(updateData.posColor),
          posGsm: flexPosValue(updateData.posGsm),
          posWidth: flexPosValue(updateData.posWidth),
          posMtrs: flexPosValue(updateData.posMtrs),
          posCoreId: flexPosValue(updateData.posCoreId),
        },
      ],
    };

    const duplicatePosRoll = await PosRoll.findOne(duplicatePosQuery).select("posProductId").lean();
    if (duplicatePosRoll) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("POS Roll", duplicatePosRoll.posProductId),
      });
    }

    await PosRoll.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    req.flash("notification", "POS Roll updated successfully!");
    res.json({ success: true, redirect: `/fairdesk/pos-roll/view` });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicatePosRoll = await PosRoll.findOne({
        _id: { $ne: req.params.id },
        posSignature: hashSignature(buildPosSignature(req.body)),
      })
        .select("posProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("POS Roll", duplicatePosRoll?.posProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ================= TAFETA PROFILE VIEW =================
router.get("/tafeta/profile/:id", async (req, res) => {
  const tafeta = await Tafeta.findById(req.params.id).lean();

  if (!tafeta) {
    req.flash("notification", "Tafeta not found");
    return res.redirect("back");
  }

  const tafetaBindings = await TafetaBinding.find({ tafetaId: req.params.id })
    .populate({ path: "userId", select: "userName clientName hoLocation" })
    .sort({ createdAt: -1 })
    .lean();

  const primaryBinding = tafetaBindings[0] || null;
  const backUrl = primaryBinding?.userId?._id
    ? `/fairdesk/client/details/${primaryBinding.userId._id}`
    : "/fairdesk/tafeta/view";

  const rows = [
    { label: "Material Code", value: tafeta.tafetaMaterialCode || "N/A" },
    { label: "GSM", value: tafeta.tafetaGsm ?? "N/A" },
    { label: "Material Type", value: tafeta.tafetaMaterialType || "N/A" },
    { label: "Color", value: tafeta.tafetaColor || "N/A" },
    { label: "Width", value: tafeta.tafetaWidth ?? "N/A" },
    { label: "Meters", value: tafeta.tafetaMtrs ?? "N/A" },
    { label: "Core Length", value: tafeta.tafetaCoreLen ?? "N/A" },
    { label: "Notch", value: tafeta.tafetaNotch || "N/A" },
    { label: "Core ID", value: tafeta.tafetaCoreId ?? "N/A" },
  ];

  res.render("inventory/itemView.ejs", {
    pageTitle: "Tafeta Details",
    sectionTitle: "Tafeta Details",
    valueHeader: "Value",
    editUrl: `/fairdesk/tafeta/edit/${tafeta._id}`,
    editLabel: "Edit Tafeta",
    rows,
    tafeta,
    tafetaBindings,
    primaryBinding,
    backUrl,
    title: "Tafeta Details",
    CSS: false,
    JS: false,
    notification: req.flash("notification"),
  });
});

// ================= TAFETA EDIT =================
router.get("/tafeta/edit/:id", async (req, res) => {
  const tafeta = await Tafeta.findById(req.params.id).lean();
  if (!tafeta) return res.redirect("back");

  res.render("inventory/tafetaEdit.ejs", {
    title: "Edit Tafeta",
    CSS: false,
    JS: false,
    tafeta,
  });
});

router.post("/tafeta/edit/:id", async (req, res) => {
  try {
    const widthRaw = req.body.tafetaWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;

    const updateData = {
      tafetaMaterialCode: String(req.body.tafetaMaterialCode || "").trim(),
      tafetaMaterialType: String(req.body.tafetaMaterialType || "").trim(),
      tafetaColor: String(req.body.tafetaColor || "").trim(),
      tafetaGsm: String(req.body.tafetaGsm || "").trim(),
      tafetaWidth: widthVal,
      tafetaMtrs: String(req.body.tafetaMtrs || "").trim(),
      tafetaCoreLen: String(req.body.tafetaCoreLen || "").trim(),
      tafetaNotch: String(req.body.tafetaNotch || "").trim(),
      tafetaCoreId: String(req.body.tafetaCoreId || "").trim(),
    };
    updateData.tafetaSignature = hashSignature(buildTafetaSignature(updateData));

    const duplicateTafetaQuery = {
      _id: { $ne: req.params.id },
      $or: [
        { tafetaSignature: updateData.tafetaSignature },
        {
          tafetaMaterialCode: flexTafetaValue(updateData.tafetaMaterialCode),
          tafetaMaterialType: flexTafetaValue(updateData.tafetaMaterialType),
          tafetaColor: flexTafetaValue(updateData.tafetaColor),
          tafetaGsm: flexTafetaValue(updateData.tafetaGsm),
          tafetaWidth: flexTafetaValue(updateData.tafetaWidth),
          tafetaMtrs: flexTafetaValue(updateData.tafetaMtrs),
          tafetaCoreLen: flexTafetaValue(updateData.tafetaCoreLen),
          tafetaNotch: flexTafetaValue(updateData.tafetaNotch),
          tafetaCoreId: flexTafetaValue(updateData.tafetaCoreId),
        },
      ],
    };

    const duplicateTafeta = await Tafeta.findOne(duplicateTafetaQuery).select("tafetaProductId").lean();
    if (duplicateTafeta) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("Tafeta", duplicateTafeta.tafetaProductId),
      });
    }

    await Tafeta.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    req.flash("notification", "Tafeta updated successfully!");
    res.json({ success: true, redirect: `/fairdesk/tafeta/view` });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicateTafeta = await Tafeta.findOne({
        _id: { $ne: req.params.id },
        tafetaSignature: hashSignature(buildTafetaSignature(req.body)),
      })
        .select("tafetaProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("Tafeta", duplicateTafeta?.tafetaProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ================= TTR PROFILE VIEW =================
router.get("/ttr/profile/:id", async (req, res) => {
  const ttr = await Ttr.findById(req.params.id).lean();

  if (!ttr) {
    req.flash("notification", "TTR not found");
    return res.redirect("back");
  }

  const ttrBindings = await TtrBinding.find({ ttrId: req.params.id })
    .populate({ path: "userId", select: "userName clientName hoLocation" })
    .sort({ createdAt: -1 })
    .lean();

  const primaryBinding = ttrBindings[0] || null;
  const backUrl = primaryBinding?.userId?._id
    ? `/fairdesk/client/details/${primaryBinding.userId._id}`
    : "/fairdesk/ttr/view";

  const rows = [
    { label: "Material Code", value: ttr.ttrMaterialCode || "N/A" },
    { label: "Type", value: ttr.ttrType || "N/A" },
    { label: "Color", value: ttr.ttrColor || "N/A" },
    { label: "Ink Face", value: ttr.ttrInkFace || "N/A" },
    { label: "Width", value: ttr.ttrWidth ?? "N/A" },
    { label: "Meters", value: ttr.ttrMtrs ?? "N/A" },
    { label: "Core ID", value: ttr.ttrCoreId ?? "N/A" },
    { label: "Core Length", value: ttr.ttrCoreLength ?? "N/A" },
    { label: "Notch", value: ttr.ttrNotch || "N/A" },
    { label: "Winding", value: ttr.ttrWinding || "N/A" },
  ];

  res.render("inventory/itemView.ejs", {
    pageTitle: "TTR Details",
    sectionTitle: "TTR Details",
    valueHeader: "Fairtech",
    editUrl: `/fairdesk/ttr/edit/${ttr._id}`,
    editLabel: "Edit TTR",
    rows,
    ttr,
    ttrBindings,
    primaryBinding,
    backUrl,
    title: "TTR Details",
    CSS: false,
    JS: false,
    notification: req.flash("notification"),
  });
});

// route for vendor form.
router.get("/form/vendor", async (req, res) => {
  let vendors = await Vendor.distinct("vendorName");
  let userCount = await VendorUser.countDocuments();
  let vendorCount = vendors.length;
  res.render("users/vendorForm.ejs", {
    JS: "vendorForm.js?v=2",
    CSS: "tabOpt.css",
    title: "Vendor Form",
    vendorCount,
    userCount,
    vendors,
    notification: req.flash("notification"),
  });
});

function normalizeVendorPart(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildVendorSignature(source) {
  return [
    normalizeVendorPart(source.vendorName),
    normalizeVendorPart(source.vendorStatus),
    normalizeVendorPart(source.hoLocation),
    normalizeVendorPart(source.warehouseLocation),
    normalizeVendorPart(source.vendorGst),
    normalizeVendorPart(source.vendorMsme),
    normalizeVendorPart(source.vendorGumasta),
    normalizeVendorPart(source.vendorPan),
    Array.isArray(source.commodities)
      ? source.commodities.map((c) => normalizeVendorPart(c)).filter(Boolean).join(",")
      : normalizeVendorPart(source.commodities),
  ].join("||");
}

function normalizeVendorUserPart(value) {
  return String(value ?? "").trim();
}

function normalizeVendorUserName(value) {
  return normalizeVendorUserPart(value).toUpperCase();
}

function normalizeVendorUserEmail(value) {
  return normalizeVendorUserPart(value).toLowerCase();
}

function normalizeVendorUserContact(value) {
  return normalizeVendorUserPart(value).replace(/\D/g, "");
}

function buildVendorUserSignature(source, vendorId) {
  return [
    normalizeVendorPart(vendorId),
    normalizeVendorUserName(source.userName),
    normalizeVendorUserEmail(source.userEmail),
    normalizeVendorUserContact(source.userContact),
  ].join("||");
}

// Route to handle VENDOR form submission
router.post("/form/vendor", async (req, res) => {
  try {
    const vendorId = String(req.body.vendorId || "").trim();
    const vendorName = String(req.body.vendorName || "").trim();
    const vendorGst = String(req.body.vendorGst || "").trim();
    const vendorPan = String(req.body.vendorPan || "").trim();
    const vendorSignature = hashSignature(buildVendorSignature(req.body));

    // Prevent duplicates only by full vendor signature.
    const alreadyExists = await Vendor.exists({
      vendorSignature,
    });
    if (alreadyExists) {
      return res.status(400).json({ success: false, message: "vendor already exist" });
    }

    const formData = {
      vendorId,
      vendorName,
      vendorStatus: String(req.body.vendorStatus || "").trim(),
      hoLocation: String(req.body.hoLocation || "").trim(),
      warehouseLocation: String(req.body.warehouseLocation || "").trim(),
      commodities: Array.isArray(req.body.commodities)
        ? req.body.commodities.map((c) => String(c).trim()).filter(Boolean)
        : req.body.commodities
          ? [String(req.body.commodities).trim()].filter(Boolean)
          : [],
      vendorGst,
      vendorMsme: String(req.body.vendorMsme || "").trim(),
      vendorGumasta: String(req.body.vendorGumasta || "").trim(),
      vendorPan,
      vendorSignature,
    };

    await Vendor.create(formData);
    req.flash("notification", "Vendor created successfully!");
    res.json({ success: true, redirect: "/fairdesk/form/vendor" });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "vendor already exist",
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get("/form/vendor/:name", async (req, res) => {
  let vendorData = await Vendor.findOne({ vendorName: req.params.name });
  let vendorName = vendorData;
  res.status(200).json(vendorName);
});

// Route to handle VENDOR USER form submission
router.post("/form/vendor-user", async (req, res) => {
  try {
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const { objectId } = req.body;
    const vendor = await Vendor.findOne({ _id: objectId });
    if (!vendor) {
      return res.status(400).json({ success: false, message: "Invalid vendor selected" });
    }

    const vendorId = String(req.body.vendorId || "").trim();
    const userName = String(req.body.userName || "").trim();
    const userContact = String(req.body.userContact || "").trim();
    const userEmail = String(req.body.userEmail || "")
      .trim()
      .toLowerCase();
    const vendorUserSignature = hashSignature(buildVendorUserSignature(req.body, vendorId));

    // Prevent duplicates only on full identity tuple within the same vendor.
    const duplicateVendorUser = await VendorUser.findOne({
      $or: [
        { vendorUserSignature },
        {
          vendorId,
          userName: new RegExp(`^${escapeRegex(userName)}$`, "i"),
          userEmail: new RegExp(`^${escapeRegex(userEmail)}$`, "i"),
          userContact: new RegExp(`^${escapeRegex(userContact)}$`, "i"),
        },
      ],
    }).lean();

    if (duplicateVendorUser) {
      return res.status(400).json({
        success: false,
        message: "vendor user already exist (same vendor + name + email + contact)",
      });
    }

    const newUser = await VendorUser.create({
      ...req.body,
      vendorId,
      userName,
      userContact,
      userEmail,
      vendorUserSignature,
    });

    vendor.users.push(newUser);
    await vendor.save();

    req.flash("notification", "Vendor user created successfully!");
    res.json({ success: true, redirect: "/fairdesk/form/vendor?tab=user" });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "vendor user already exist (same vendor + name + email + contact)",
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ================= TTR EDIT =================
router.get("/ttr/edit/:id", async (req, res) => {
  const ttr = await Ttr.findById(req.params.id).lean();
  if (!ttr) return res.redirect("back");

  res.render("inventory/ttrEdit.ejs", {
    title: "Edit TTR",
    CSS: false,
    JS: false,
    ttr,
  });
});

router.post("/ttr/edit/:id", async (req, res) => {
  try {
    const widthRaw = req.body.ttrWidth;
    const widthTrim = typeof widthRaw === "string" ? widthRaw.trim() : widthRaw;
    const widthNum = typeof widthTrim === "string" ? Number(widthTrim) : Number(widthTrim);
    const widthVal =
      typeof widthTrim === "string" && widthTrim !== "" && !Number.isNaN(widthNum) ? widthNum : widthTrim;

    const updateData = {
      ttrType: String(req.body.ttrType || "").trim(),
      ttrColor: String(req.body.ttrColor || "").trim(),
      ttrMaterialCode: String(req.body.ttrMaterialCode || "").trim(),
      ttrWidth: widthVal,
      ttrMtrs: Number(req.body.ttrMtrs),
      ttrInkFace: String(req.body.ttrInkFace || "").trim(),
      ttrCoreId: String(req.body.ttrCoreId || "").trim(),
      ttrCoreLength: Number(req.body.ttrCoreLength),
      ttrNotch: String(req.body.ttrNotch || "").trim(),
      ttrWinding: String(req.body.ttrWinding || "").trim(),
    };
    updateData.ttrSignature = hashSignature(buildTtrSignature(updateData));

    const duplicateTtrQuery = {
      _id: { $ne: req.params.id },
      $or: [
        { ttrSignature: updateData.ttrSignature },
        {
          ttrType: flexTtrValue(updateData.ttrType),
          ttrColor: flexTtrValue(updateData.ttrColor),
          ttrMaterialCode: flexTtrValue(updateData.ttrMaterialCode),
          ttrWidth: flexTtrValue(updateData.ttrWidth),
          ttrMtrs: updateData.ttrMtrs,
          ttrInkFace: flexTtrValue(updateData.ttrInkFace),
          ttrCoreId: flexTtrValue(updateData.ttrCoreId),
          ttrCoreLength: updateData.ttrCoreLength,
          ttrNotch: flexTtrValue(updateData.ttrNotch),
          ttrWinding: flexTtrValue(updateData.ttrWinding),
        },
      ],
    };

    const duplicateTtr = await Ttr.findOne(duplicateTtrQuery).select("ttrProductId").lean();
    if (duplicateTtr) {
      return res.status(400).json({
        success: false,
        message: duplicateMasterMessage("TTR", duplicateTtr.ttrProductId),
      });
    }

    await Ttr.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    req.flash("notification", "TTR updated successfully!");
    res.json({ success: true, redirect: `/fairdesk/ttr/view` });
  } catch (err) {
    console.error(err);
    if (err?.code === 11000) {
      const duplicateTtr = await Ttr.findOne({
        _id: { $ne: req.params.id },
        ttrSignature: hashSignature(buildTtrSignature(req.body)),
      })
        .select("ttrProductId")
        .lean();
      return res.status(409).json({
        success: false,
        message: duplicateMasterMessage("TTR", duplicateTtr?.ttrProductId),
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------Sales Order---------------------------------->
// Centralized Sales Order Form
router.get("/sales/order", async (req, res) => {
  const { orderId } = req.query;
  const clientsPromise = Client.distinct("clientName");

  const orderPromise = orderId
    ? TapeSalesOrder.findById(orderId)
        .lean()
        .select("tapeId tapeBinding userId quantity dispatchedQuantity estimatedDate status remarks sourceLocation poNumber orderRate onModel onBindingModel")
    : Promise.resolve(null);

  const logsPromise = orderId
    ? SalesOrderLog.find({ orderId, action: "DELIVERED" }).sort({ performedAt: -1 }).lean()
    : Promise.resolve([]);

  const [clients, orderToEdit, logs] = await Promise.all([clientsPromise, orderPromise, logsPromise]);

  res.render("inventory/salesOrderForm.ejs", {
    clients,
    orderToEdit,
    logs,
    CSS: false,
    JS: false,
    title: orderToEdit ? "Edit Sales Order" : "Sales Order",
    notification: req.flash("notification"),
  });
});

// API: Get items by type and user
// API: Get clients filtered by item type (for smart filter)
router.get("/sales/clients/:itemType", async (req, res) => {
  try {
    const { itemType } = req.params;
    let bindingModel;
    if (itemType === "TAPE") bindingModel = TapeBinding;
    else if (itemType === "POS_ROLL") bindingModel = PosRollBinding;
    else if (itemType === "TAFETA") bindingModel = TafetaBinding;
    else if (itemType === "TTR") bindingModel = TtrBinding;
    else {
      const clients = await Client.distinct("clientName");
      return res.json(clients.sort());
    }
    const userIds = await bindingModel.distinct("userId");
    const users = await Username.find({ _id: { $in: userIds } })
      .select("clientName")
      .lean();
    const clientNames = [...new Set(users.map((u) => u.clientName).filter(Boolean))].sort();
    res.json(clientNames);
  } catch (err) {
    console.error("Sales clients filter error:", err);
    res.status(500).json([]);
  }
});

router.get("/sales/items/:type/:userId", async (req, res) => {
  try {
    const { type, userId } = req.params;
    let items = [];

    if (type === "TAPE") {
      const user = await Username.findById(userId)
        .populate({
          path: "tape",
          populate: { path: "tapeId", select: "tapeProductId tapePaperCode tapeGsm tapeFinish" },
          select: "tapeMinQty tapeRatePerRoll tapeId",
        })
        .lean();

      // Get all tape IDs for this user
      const tapeBindings = user?.tape || [];

      // Fetch stock for all these tapes in one go
      const tapeIds = tapeBindings.map((b) => b.tapeId?._id).filter(Boolean);
      if (!tapeIds.length) {
        return res.json([]);
      }

      const [stockAggregation, bookedAggregation] = await Promise.all([
        TapeStock.aggregate([
          { $match: { tape: { $in: tapeIds } } },
          {
            $group: {
              _id: {
                tape: "$tape",
                location: { $toUpper: { $ifNull: ["$location", "UNKNOWN"] } },
              },
              totalQty: { $sum: "$quantity" },
            },
          },
          {
            $group: {
              _id: "$_id.tape",
              locations: {
                $push: {
                  location: "$_id.location",
                  qty: "$totalQty",
                },
              },
              totalStock: { $sum: "$totalQty" },
            },
          },
        ]),
        TapeSalesOrder.aggregate([
          { $match: { tapeId: { $in: tapeIds }, status: "PENDING" } },
          {
            $group: {
              _id: {
                tapeId: "$tapeId",
                location: { $toUpper: { $ifNull: ["$sourceLocation", "UNKNOWN"] } },
              },
              bookedQty: {
                $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] },
              },
            },
          },
        ]),
      ]);

      // Map stock back to bindings
      const stockMap = {};
      stockAggregation.forEach((s) => {
        stockMap[s._id.toString()] = s;
      });

      // Build per-tape overall booked AND per-location booked
      const bookedMap = {}; // tapeId -> total booked
      const bookedLocMap = {}; // tapeId -> { "UNIT 1": N, "UNIT 2": N, ... }
      bookedAggregation.forEach((b) => {
        const tid = b._id.tapeId.toString();
        const loc = b._id.location || "UNKNOWN";
        bookedMap[tid] = (bookedMap[tid] || 0) + b.bookedQty;
        if (!bookedLocMap[tid]) bookedLocMap[tid] = {};
        bookedLocMap[tid][loc] = (bookedLocMap[tid][loc] || 0) + b.bookedQty;
      });

      items = tapeBindings.map((binding) => {
        const tapeIdStr = binding.tapeId?._id?.toString();
        const stockInfo = stockMap[tapeIdStr] || { locations: [], totalStock: 0 };
        const booked = bookedMap[tapeIdStr] || 0;
        const locBooked = bookedLocMap[tapeIdStr] || {};

        // Overall balance
        stockInfo.booked = booked;
        stockInfo.balance = stockInfo.totalStock - booked;

        // Per-location booked & balance
        stockInfo.locations = stockInfo.locations.map((loc) => ({
          ...loc,
          booked: locBooked[loc.location] || 0,
          balance: loc.qty - (locBooked[loc.location] || 0),
        }));

        return {
          _id: binding._id,
          displayName: `${binding.tapeId?.tapeProductId || "N/A"} - ${binding.tapeId?.tapePaperCode || ""} ${binding.tapeId?.tapeGsm || ""}gsm`,
          minOrderQty: binding.tapeMinQty || 0,
          rate: binding.tapeRatePerRoll || 0,
          stock: stockInfo,
        };
      });
    } else if (type === "POS_ROLL") {
      const user = await Username.findById(userId)
        .populate({
          path: "posRoll",
          populate: { path: "posRollId", select: "posProductId posPaperCode posGsm posColor" },
          select: "posMinQty posRatePerRoll posRollId",
        })
        .lean();

      const posBindings = user?.posRoll || [];
      const posRollIds = posBindings.map((b) => b.posRollId?._id).filter(Boolean);
      if (!posRollIds.length) return res.json([]);

      const [stockAgg, bookedAgg] = await Promise.all([
        PosRollStock.aggregate([
          { $match: { posRoll: { $in: posRollIds } } },
          {
            $group: {
              _id: {
                posRoll: "$posRoll",
                location: { $toUpper: { $ifNull: ["$location", "UNKNOWN"] } },
              },
              totalQty: { $sum: "$quantity" },
            },
          },
          {
            $group: {
              _id: "$_id.posRoll",
              locations: { $push: { location: "$_id.location", qty: "$totalQty" } },
              totalStock: { $sum: "$totalQty" },
            },
          },
        ]),
        TapeSalesOrder.aggregate([
          { $match: { tapeId: { $in: posRollIds }, status: "PENDING" } },
          {
            $group: {
              _id: {
                tapeId: "$tapeId",
                location: { $toUpper: { $ifNull: ["$sourceLocation", "UNKNOWN"] } },
              },
              bookedQty: { $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] } },
            },
          },
        ]),
      ]);

      const stockMap = {};
      stockAgg.forEach((s) => {
        stockMap[s._id.toString()] = s;
      });
      const bookedMap = {};
      const bookedLocMap = {};
      bookedAgg.forEach((b) => {
        const tid = b._id.tapeId.toString();
        const loc = b._id.location || "UNKNOWN";
        bookedMap[tid] = (bookedMap[tid] || 0) + b.bookedQty;
        if (!bookedLocMap[tid]) bookedLocMap[tid] = {};
        bookedLocMap[tid][loc] = (bookedLocMap[tid][loc] || 0) + b.bookedQty;
      });

      items = posBindings.map((binding) => {
        const idStr = binding.posRollId?._id?.toString();
        const stockInfo = stockMap[idStr] || { locations: [], totalStock: 0 };
        const booked = bookedMap[idStr] || 0;
        const locBooked = bookedLocMap[idStr] || {};
        stockInfo.booked = booked;
        stockInfo.balance = stockInfo.totalStock - booked;
        stockInfo.locations = stockInfo.locations.map((loc) => ({
          ...loc,
          booked: locBooked[loc.location] || 0,
          balance: loc.qty - (locBooked[loc.location] || 0),
        }));
        return {
          _id: binding._id,
          displayName: `${binding.posRollId?.posProductId || "N/A"} - ${binding.posRollId?.posPaperCode || ""} ${binding.posRollId?.posGsm || ""}gsm`,
          minOrderQty: binding.posMinQty || 0,
          rate: binding.posRatePerRoll || 0,
          stock: stockInfo,
        };
      });
    } else if (type === "TAFETA") {
      const user = await Username.findById(userId)
        .populate({
          path: "tafeta",
          populate: { path: "tafetaId", select: "tafetaProductId tafetaMaterialCode tafetaGsm tafetaColor" },
          select: "tafetaMinQty tafetaRatePerRoll tafetaId",
        })
        .lean();

      const tafetaBindings = user?.tafeta || [];
      const tafetaIds = tafetaBindings.map((b) => b.tafetaId?._id).filter(Boolean);
      if (!tafetaIds.length) return res.json([]);

      const [stockAgg, bookedAgg] = await Promise.all([
        TafetaStock.aggregate([
          { $match: { tafeta: { $in: tafetaIds } } },
          {
            $group: {
              _id: {
                tafeta: "$tafeta",
                location: { $toUpper: { $ifNull: ["$location", "UNKNOWN"] } },
              },
              totalQty: { $sum: "$quantity" },
            },
          },
          {
            $group: {
              _id: "$_id.tafeta",
              locations: { $push: { location: "$_id.location", qty: "$totalQty" } },
              totalStock: { $sum: "$totalQty" },
            },
          },
        ]),
        TapeSalesOrder.aggregate([
          { $match: { tapeId: { $in: tafetaIds }, status: "PENDING" } },
          {
            $group: {
              _id: {
                tapeId: "$tapeId",
                location: { $toUpper: { $ifNull: ["$sourceLocation", "UNKNOWN"] } },
              },
              bookedQty: { $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] } },
            },
          },
        ]),
      ]);

      const stockMap = {};
      stockAgg.forEach((s) => {
        stockMap[s._id.toString()] = s;
      });
      const bookedMap = {};
      const bookedLocMap = {};
      bookedAgg.forEach((b) => {
        const tid = b._id.tapeId.toString();
        const loc = b._id.location || "UNKNOWN";
        bookedMap[tid] = (bookedMap[tid] || 0) + b.bookedQty;
        if (!bookedLocMap[tid]) bookedLocMap[tid] = {};
        bookedLocMap[tid][loc] = (bookedLocMap[tid][loc] || 0) + b.bookedQty;
      });

      items = tafetaBindings.map((binding) => {
        const idStr = binding.tafetaId?._id?.toString();
        const stockInfo = stockMap[idStr] || { locations: [], totalStock: 0 };
        const booked = bookedMap[idStr] || 0;
        const locBooked = bookedLocMap[idStr] || {};
        stockInfo.booked = booked;
        stockInfo.balance = stockInfo.totalStock - booked;
        stockInfo.locations = stockInfo.locations.map((loc) => ({
          ...loc,
          booked: locBooked[loc.location] || 0,
          balance: loc.qty - (locBooked[loc.location] || 0),
        }));
        return {
          _id: binding._id,
          displayName: `${binding.tafetaId?.tafetaProductId || "N/A"} - ${binding.tafetaId?.tafetaMaterialCode || ""} ${binding.tafetaId?.tafetaGsm || ""}gsm`,
          minOrderQty: binding.tafetaMinQty || 0,
          rate: binding.tafetaRatePerRoll || 0,
          stock: stockInfo,
        };
      });
    } else if (type === "LABEL") {
      const user = await Username.findById(userId).populate({
        path: "label",
        populate: { path: "labelId" },
      });
      items = (user?.label || []).map((lbl) => ({
        _id: lbl._id,
        displayName: `${lbl.labelId?.labelWidth || ""}x${lbl.labelId?.labelHeight || ""}`,
        minOrderQty: lbl.labelId?.minOrderQty || 0,
        rate: parseFloat(lbl.labelId?.ratePerLabel) || 0,
        stock: { locations: [], totalStock: 0 },
      }));
    } else if (type === "TTR") {
      const user = await Username.findById(userId)
        .populate({
          path: "ttr",
          populate: { path: "ttrId", select: "ttrColor ttrWidth ttrMtrs" },
          select: "ttrMinQty ttrRatePerRoll ttrId",
        })
        .lean();

      const ttrBindings = user?.ttr || [];
      const ttrIds = ttrBindings.map((b) => b.ttrId?._id).filter(Boolean);

      if (!ttrIds.length) {
        return res.json([]);
      }

      const [stockAggregation, bookedAggregation] = await Promise.all([
        TtrStock.aggregate([
          { $match: { ttr: { $in: ttrIds } } },
          {
            $group: {
              _id: {
                ttr: "$ttr",
                location: { $toUpper: { $ifNull: ["$location", "UNKNOWN"] } },
              },
              totalQty: { $sum: "$quantity" },
            },
          },
          {
            $group: {
              _id: "$_id.ttr",
              locations: {
                $push: {
                  location: "$_id.location",
                  qty: "$totalQty",
                },
              },
              totalStock: { $sum: "$totalQty" },
            },
          },
        ]),
        TapeSalesOrder.aggregate([
          { $match: { tapeId: { $in: ttrIds }, status: "PENDING" } },
          {
            $group: {
              _id: {
                tapeId: "$tapeId",
                location: { $toUpper: { $ifNull: ["$sourceLocation", "UNKNOWN"] } },
              },
              bookedQty: {
                $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] },
              },
            },
          },
        ]),
      ]);

      const stockMap = {};
      stockAggregation.forEach((s) => {
        stockMap[s._id.toString()] = s;
      });

      const bookedMap = {};
      const bookedLocMap = {};
      bookedAggregation.forEach((b) => {
        const tid = b._id.tapeId.toString();
        const loc = b._id.location || "UNKNOWN";
        bookedMap[tid] = (bookedMap[tid] || 0) + b.bookedQty;
        if (!bookedLocMap[tid]) bookedLocMap[tid] = {};
        bookedLocMap[tid][loc] = (bookedLocMap[tid][loc] || 0) + b.bookedQty;
      });

      items = ttrBindings.map((binding) => {
        const idStr = binding.ttrId?._id?.toString();
        const stockInfo = stockMap[idStr] || { locations: [], totalStock: 0 };
        const booked = bookedMap[idStr] || 0;
        const locBooked = bookedLocMap[idStr] || {};
        stockInfo.booked = booked;
        stockInfo.balance = stockInfo.totalStock - booked;
        stockInfo.locations = stockInfo.locations.map((loc) => ({
          ...loc,
          booked: locBooked[loc.location] || 0,
          balance: loc.qty - (locBooked[loc.location] || 0),
        }));
        return {
          _id: binding._id,
          displayName: `${binding.ttrId?.ttrColor || ""} ${binding.ttrId?.ttrWidth || ""}mm x ${binding.ttrId?.ttrMtrs || ""}m`,
          minOrderQty: binding.ttrMinQty || 0,
          rate: binding.ttrRatePerRoll || 0,
          stock: stockInfo,
        };
      });
    }

    res.json(items);
  } catch (err) {
    console.error("ITEMS API ERROR:", err);
    res.json([]);
  }
});

// Submit Sales Order (Create or Update)
router.post("/sales/order", async (req, res) => {
  try {
    const { orderId, itemType, userId, itemId, quantity, estimatedDate, remarks, sourceLocation, locationRadio, userLocation, poNumber, orderRate } = req.body;
    const createdByUser = req.user?.username || "SYSTEM";
    const qtyNum = Number(quantity);

    // Idempotency guard: if two identical create requests arrive within a short window,
    // treat the later one as duplicate and do not create a second order.
    if (!orderId && itemId && Number.isFinite(qtyNum) && qtyNum > 0) {
      const duplicateWindowStart = new Date(Date.now() - 15000);
      const recentDuplicate = await TapeSalesOrder.findOne({
        status: "PENDING",
        tapeBinding: itemId,
        quantity: qtyNum,
        poNumber: String(poNumber || "").trim(),
        createdBy: createdByUser,
        createdAt: { $gte: duplicateWindowStart },
      })
        .select("_id")
        .lean();

      if (recentDuplicate) {
        return res.json({ success: true, redirect: "/fairdesk/sales/pending", duplicate: true });
      }
    }

    if (["TAPE", "POS_ROLL", "TAFETA", "TTR"].includes(itemType) && canonicalizeLocationName(locationRadio) === "ALL") {
      return res.status(400).json({ success: false, message: "Location cannot be ALL. Please select a specific location." });
    }
    let normalizedSourceLocation = canonicalizeLocationName(sourceLocation || locationRadio || userLocation);
    const isStockBasedType = ["TAPE", "POS_ROLL", "TAFETA", "TTR"].includes(itemType);

    // "ALL" is not a valid storage location for stock-based orders.
    if (normalizedSourceLocation === "ALL") normalizedSourceLocation = "";

    // Fallback 1: derive from selected user.
    if (!normalizedSourceLocation && userId) {
      const userDoc = await Username.findById(userId).select("userLocation").lean();
      normalizedSourceLocation = canonicalizeLocationName(userDoc?.userLocation);
    }

    // Fallback 2: derive from binding -> user -> location.
    if (!normalizedSourceLocation && isStockBasedType && itemId) {
      let bindingUserId = null;

      if (itemType === "TAPE") {
        const binding = await TapeBinding.findById(itemId).select("userId").lean();
        bindingUserId = binding?.userId || null;
      } else if (itemType === "POS_ROLL") {
        const binding = await PosRollBinding.findById(itemId).select("userId").lean();
        bindingUserId = binding?.userId || null;
      } else if (itemType === "TAFETA") {
        const binding = await TafetaBinding.findById(itemId).select("userId").lean();
        bindingUserId = binding?.userId || null;
      } else if (itemType === "TTR") {
        const binding = await TtrBinding.findById(itemId).select("userId").lean();
        bindingUserId = binding?.userId || null;
      }

      if (bindingUserId) {
        const userDoc = await Username.findById(bindingUserId).select("userLocation").lean();
        normalizedSourceLocation = canonicalizeLocationName(userDoc?.userLocation);
      }
    }

    if (isStockBasedType && (!normalizedSourceLocation || normalizedSourceLocation === "ALL")) {
      return res.status(400).json({ success: false, message: "no location is selected" });
    }

    const sourceLocationForSave = normalizedSourceLocation || undefined;

    if (itemType === "TAPE") {
      const binding = await TapeBinding.findById(itemId);
      if (!binding) {
        return res.status(400).json({ success: false, message: "Invalid item selected" });
      }
      const parsedOrderRate = Number(orderRate);
      const finalOrderRate = Number.isFinite(parsedOrderRate) ? parsedOrderRate : Number(binding.tapeRatePerRoll) || 0;

      const data = {
        tapeBinding: itemId,
        userId: binding.userId,
        tapeId: binding.tapeId,
        sourceLocation: sourceLocationForSave, // Allow updating location if needed
        poNumber,
        orderRate: finalOrderRate,
        quantity: Number(quantity),
        estimatedDate: new Date(estimatedDate),
        remarks,
        // createdBy remains same for edits, but tracking modifiedBy could be good
      };

      if (orderId) {
        // UPDATE existing order
        await TapeSalesOrder.findByIdAndUpdate(orderId, data);
        req.flash("notification", "Sales order updated successfully!");
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      } else {
        // CREATE new order
        data.createdBy = createdByUser;
        const newOrder = await TapeSalesOrder.create(data);

        // Action Log entry for creation
        await SalesOrderLog.create({
          orderId: newOrder._id,
          action: "CREATED",
          quantity: Number(quantity),
          performedBy: createdByUser,
        });

        req.flash("notification", "Sales order created successfully!");

        // Redirect to pending orders
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      }
    } else if (itemType === "POS_ROLL") {
      const binding = await PosRollBinding.findById(itemId);
      if (!binding) {
        return res.status(400).json({ success: false, message: "Invalid POS Roll item selected" });
      }
      const parsedOrderRate = Number(orderRate);
      const finalOrderRate = Number.isFinite(parsedOrderRate) ? parsedOrderRate : Number(binding.posRatePerRoll) || 0;

      const data = {
        tapeBinding: itemId,
        onBindingModel: "PosRollBinding",
        userId: binding.userId,
        tapeId: binding.posRollId,
        onModel: "PosRoll",
        sourceLocation: sourceLocationForSave,
        poNumber,
        orderRate: finalOrderRate,
        quantity: Number(quantity),
        estimatedDate: new Date(estimatedDate),
        remarks,
      };

      if (orderId) {
        await TapeSalesOrder.findByIdAndUpdate(orderId, data);
        req.flash("notification", "POS Roll order updated successfully!");
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      } else {
        data.createdBy = createdByUser;
        const newOrder = await TapeSalesOrder.create(data);
        await SalesOrderLog.create({
          orderId: newOrder._id,
          action: "CREATED",
          quantity: Number(quantity),
          performedBy: createdByUser,
        });
        req.flash("notification", "POS Roll order created successfully!");
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      }
    } else if (itemType === "TAFETA") {
      const binding = await TafetaBinding.findById(itemId);
      if (!binding) {
        return res.status(400).json({ success: false, message: "Invalid Tafeta item selected" });
      }
      const parsedOrderRate = Number(orderRate);
      const finalOrderRate = Number.isFinite(parsedOrderRate) ? parsedOrderRate : Number(binding.tafetaRatePerRoll) || 0;

      const data = {
        tapeBinding: itemId,
        onBindingModel: "TafetaBinding",
        userId: binding.userId,
        tapeId: binding.tafetaId,
        onModel: "Tafeta",
        sourceLocation: sourceLocationForSave,
        poNumber,
        orderRate: finalOrderRate,
        quantity: Number(quantity),
        estimatedDate: new Date(estimatedDate),
        remarks,
      };

      if (orderId) {
        await TapeSalesOrder.findByIdAndUpdate(orderId, data);
        req.flash("notification", "Tafeta order updated successfully!");
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      } else {
        data.createdBy = createdByUser;
        const newOrder = await TapeSalesOrder.create(data);
        await SalesOrderLog.create({
          orderId: newOrder._id,
          action: "CREATED",
          quantity: Number(quantity),
          performedBy: createdByUser,
        });
        req.flash("notification", "Tafeta order created successfully!");
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      }
    } else if (itemType === "TTR") {
      const binding = await TtrBinding.findById(itemId);
      if (!binding) {
        return res.status(400).json({ success: false, message: "Invalid TTR item selected" });
      }
      const parsedOrderRate = Number(orderRate);
      const finalOrderRate = Number.isFinite(parsedOrderRate) ? parsedOrderRate : Number(binding.ttrRatePerRoll) || 0;

      const data = {
        tapeBinding: itemId,
        onBindingModel: "TtrBinding",
        userId: binding.userId,
        tapeId: binding.ttrId,
        onModel: "Ttr",
        sourceLocation: sourceLocationForSave,
        poNumber,
        orderRate: finalOrderRate,
        quantity: Number(quantity),
        estimatedDate: new Date(estimatedDate),
        remarks,
      };

      if (orderId) {
        await TapeSalesOrder.findByIdAndUpdate(orderId, data);
        req.flash("notification", "TTR order updated successfully!");
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      } else {
        data.createdBy = createdByUser;
        const newOrder = await TapeSalesOrder.create(data);
        await SalesOrderLog.create({
          orderId: newOrder._id,
          action: "CREATED",
          quantity: Number(quantity),
          performedBy: createdByUser,
        });
        req.flash("notification", "TTR order created successfully!");
        res.json({ success: true, redirect: "/fairdesk/sales/pending" });
      }
    } else {
      return res.status(400).json({ success: false, message: "Unsupported item type" });
    }
  } catch (err) {
    console.error("ORDER SUBMIT ERROR:", err);
    const sourceLocError = err?.errors?.sourceLocation;
    if (sourceLocError) {
      return res.status(400).json({ success: false, message: "no location is selected" });
    }
    res.status(400).json({ success: false, message: "Failed to submit order" });
  }
});

// View Pending Orders
router.get("/sales/pending", async (req, res) => {
  try {
    // For now we only have TapeSalesOrder
    const pendingOrders = await TapeSalesOrder.find({ status: "PENDING" })
      .select(
        "tapeId tapeBinding userId quantity dispatchedQuantity estimatedDate createdAt sourceLocation poNumber remarks status onModel onBindingModel",
      )
      .populate({ path: "userId", select: "clientName userName" })
      .populate({
        path: "tapeId",
        select:
          "tapeProductId tapePaperCode tapeGsm tapeFinish posProductId posPaperCode posGsm tafetaProductId tafetaMaterialCode tafetaGsm ttrProductId ttrColor ttrWidth ttrMtrs",
      })
      .populate({
        path: "tapeBinding",
        select:
          "tapeRatePerRoll tapeOdrQty tapeMinQty posRatePerRoll posOdrQty posMinQty tafetaRatePerRoll tafetaOdrQty tafetaMinQty ttrRatePerRoll ttrOdrQty ttrMinQty",
      })
      .sort({ createdAt: 1 })
      .lean();

    res.render("inventory/pendingOrders.ejs", {
      orders: pendingOrders,
      title: "Pending Orders",
      CSS: "tableDisp.css",
      JS: false,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("PENDING ORDERS ERROR:", err);
    res.redirect("back");
  }
});

// GET: Confirm Order Page (prefilled sales order form + extra fields)
router.get("/sales/order/confirm", async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      req.flash("notification", "No order specified");
      return res.redirect("/fairdesk/sales/pending");
    }

    const order = await TapeSalesOrder.findById(orderId)
      .populate({ path: "userId", select: "clientName userName userLocation" })
      .populate({
        path: "tapeId",
        select:
          "tapeProductId tapePaperCode tapeGsm tapeFinish posProductId posPaperCode posGsm tafetaProductId tafetaMaterialCode tafetaGsm ttrProductId ttrColor ttrWidth ttrMtrs",
      })
      .populate({
        path: "tapeBinding",
        select:
          "tapeRatePerRoll tapeOdrQty tapeMinQty posRatePerRoll posOdrQty posMinQty tafetaRatePerRoll tafetaOdrQty tafetaMinQty ttrRatePerRoll ttrOdrQty ttrMinQty",
      })
      .lean();

    if (!order) {
      req.flash("notification", "Order not found");
      return res.redirect("/fairdesk/sales/pending");
    }

    const logs = await SalesOrderLog.find({ orderId, action: "DELIVERED" }).sort({ performedAt: -1 }).lean();

    // ========== STOCK PRE-CALCULATION FOR CONFIRM PAGE ==========
    let stockInfo = { totalStock: 0, locations: [], booked: 0, balance: 0 };
    if (order.tapeId) {
      const tapeObjectId = order.tapeId._id;

      let StockModel = TapeStock;
      let matchField = "tape";

      if (order.onModel === "PosRoll") {
        StockModel = PosRollStock;
        matchField = "posRoll";
      } else if (order.onModel === "Tafeta") {
        StockModel = TafetaStock;
        matchField = "tafeta";
      } else if (order.onModel === "Ttr") {
        StockModel = TtrStock;
        matchField = "ttr";
      }

      const [stockAgg, bookedAgg] = await Promise.all([
        StockModel.aggregate([
          { $match: { [matchField]: tapeObjectId } },
          {
            $group: {
              _id: "$location",
              qty: { $sum: "$quantity" },
            },
          },
        ]),
        TapeSalesOrder.aggregate([
          { $match: { tapeId: tapeObjectId, status: "PENDING" } },
          {
            $group: {
              _id: "$sourceLocation",
              bookedQty: {
                $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] },
              },
            },
          },
        ]),
      ]);

      // Map/Combine
      const bookedMap = {}; // location -> qty
      let totalBooked = 0;
      bookedAgg.forEach((b) => {
        const loc = b._id || "UNKNOWN";
        bookedMap[loc] = b.bookedQty;
        totalBooked += b.bookedQty;
      });

      let totalPhysical = 0;
      const locations = stockAgg.map((s) => {
        const loc = s._id || "UNKNOWN";
        const booked = bookedMap[loc] || 0;
        totalPhysical += s.qty;
        return {
          location: loc,
          qty: s.qty,
          booked: booked,
          balance: s.qty - booked,
        };
      });

      stockInfo = {
        totalStock: totalPhysical,
        locations: locations, // array of { location, qty, booked, balance }
        booked: totalBooked,
        balance: totalPhysical - totalBooked,
      };
    }

    const clients = await Client.distinct("clientName");

    res.render("inventory/salesOrderForm.ejs", {
      clients,
      orderToEdit: order,
      stockInfo, // Pass pre-calculated stock
      logs,
      confirmMode: true,
      CSS: false,
      JS: false,
      title: "Confirm & Create Order",
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("CONFIRM ORDER PAGE ERROR:", err);
    req.flash("notification", "Failed to load confirm page");
    res.redirect("/fairdesk/sales/pending");
  }
});

// GET: Order Logs
router.get("/sales/order/logs", async (req, res) => {
  try {
    const logs = await SalesOrderLog.find()
      .populate({
        path: "orderId",
        populate: [
          { path: "userId", select: "clientName userName" },
          {
            path: "tapeId",
            select:
              "tapeProductId tapePaperCode tapeGsm tapeFinish posProductId posPaperCode posGsm tafetaProductId tafetaMaterialCode tafetaGsm ttrProductId ttrColor ttrWidth ttrMtrs",
          },
        ],
      })
      .sort({ performedAt: -1 })
      .lean();

    res.render("inventory/orderLogs.ejs", {
      logs,
      title: "Order Action Logs",
      CSS: "tableDisp.css",
      JS: false,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("ORDER LOGS ERROR:", err);
    req.flash("notification", "Failed to load logs");
    res.redirect("/fairdesk/sales/pending");
  }
});

// Update Order Status (with stock deduction / reversal + action logging)
router.post("/sales/order/status", async (req, res) => {
  try {
    const accepts = req.headers.accept || "";
    const wantsJson = req.xhr || accepts.includes("application/json") || accepts.includes("text/json");
    const { orderId, status, cancelReason, invoiceNumber, confirmDate, confirmQuantity } = req.body;
    const order = await TapeSalesOrder.findById(orderId)
      .populate({ path: "tapeId", select: "tapeFinish tapePaperCode tapeGsm" })
      .lean();

    if (!order) {
      req.flash("notification", "Order not found");
      return res.redirect("back");
    }

    const previousStatus = order.status;
    console.log(`[DEBUG] Order ${orderId}: Status change ${previousStatus} -> ${status}`);

    // ========== CONFIRM: Deduct stock ==========
    let finalStatus = status;

    if (status === "CONFIRMED" && previousStatus === "PENDING") {
      const tapeObjectId = new mongoose.Types.ObjectId(order.tapeId._id);
      const location = order.sourceLocation;

      let StockModel = TapeStock;
      let StockLogModel = TapeStockLog;
      let matchField = "tape";

      if (order.onModel === "PosRoll") {
        StockModel = PosRollStock;
        StockLogModel = PosRollStockLog;
        matchField = "posRoll";
      } else if (order.onModel === "Tafeta") {
        StockModel = TafetaStock;
        StockLogModel = TafetaStockLog;
        matchField = "tafeta";
      } else if (order.onModel === "Ttr") {
        StockModel = TtrStock;
        StockLogModel = TtrStockLog;
        matchField = "ttr";
      }

      if (!location) {
        req.flash("notification", "Cannot confirm: Source location missing on order");
        return res.redirect("back");
      }

      const tape = order.tapeId;
      const qty = Number(confirmQuantity) || order.quantity;
      const dispatchedSoFar = order.dispatchedQuantity || 0;
      const remaining = order.quantity - dispatchedSoFar;

      if (qty > remaining) {
        req.flash("notification", `Cannot dispatch ${qty}. Only ${remaining} remaining.`);
        return res.redirect("back");
      }

      // Get current stock at this location
      const bal = await StockModel.aggregate([
        { $match: { [matchField]: tapeObjectId, location } },
        { $group: { _id: null, qty: { $sum: "$quantity" } } },
      ]);
      const currentStock = bal[0]?.qty || 0;

      // Validate sufficient stock
      if (currentStock < qty) {
        req.flash("notification", `Insufficient stock at ${location}. Available: ${currentStock}, Required: ${qty}`);
        return res.redirect("/fairdesk/sales/pending");
      }

      // Insert negative stock entry (outward)
      const stockData = {
        [matchField]: tapeObjectId,
        location,
        quantity: -qty,
        remarks: `Sales Order Confirmed: ${orderId}`,
      };
      if (order.onModel === "Tape") stockData.tapeFinish = tape.tapeFinish;
      if (order.onModel === "Tafeta") stockData.tafetaType = tape.tafetaType;

      await StockModel.create(stockData);

      // Stock Log entry
      const logData = {
        [matchField]: tapeObjectId,
        location,
        openingStock: currentStock,
        quantity: qty,
        closingStock: currentStock - qty,
        type: "OUTWARD",
        source: "SYSTEM",
        remarks: `Sales Order Confirmed: ${orderId}`,
        createdBy: req.user?.username || "SYSTEM",
      };
      await StockLogModel.create(logData);

      // Calculate action time: Use Confirm Date (for date) + Current Time (for time)
      const now = new Date();
      let actionTime = now;
      if (confirmDate) {
        const [y, m, d] = confirmDate.split("-").map(Number);
        actionTime = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
      }

      // Action Log entry
      await SalesOrderLog.create({
        orderId,
        action: "DELIVERED",
        invoiceNumber: invoiceNumber || "",
        quantity: qty,
        performedBy: req.user?.username || "SYSTEM",
        performedAt: actionTime,
      });

      // Calculate new dispatched quantity
      const newDispatched = dispatchedSoFar + qty;

      // Determine if fully dispatched
      if (newDispatched >= order.quantity) {
        finalStatus = "CONFIRMED";
      } else {
        finalStatus = "PENDING";
      }

      // Update dispatched quantity immediately to be safe, status will be updated below
      await TapeSalesOrder.findByIdAndUpdate(orderId, { dispatchedQuantity: newDispatched });

      console.log(
        `[DEBUG] Stock deduction + action log successful. Dispatched: ${qty}, Total: ${newDispatched}/${order.quantity}, New Status: ${finalStatus}`,
      );
    } else if (status === "CONFIRMED") {
      console.log(`[DEBUG] Skipping deduction. Status: ${status}, Previous: ${previousStatus}`);
    }

    // ========== CANCEL: Log with reason ==========
    if (status === "CANCELLED" && previousStatus === "PENDING") {
      // Action Log entry for cancel from PENDING
      await SalesOrderLog.create({
        orderId,
        action: "CANCELLED",
        cancelReason: cancelReason || "No reason provided",
        quantity: order.quantity,
        performedBy: req.user?.username || "SYSTEM",
      });
    }

    // ========== CANCEL a CONFIRMED order: Reverse stock ==========
    if (status === "CANCELLED" && previousStatus === "CONFIRMED") {
      const tapeObjectId = new mongoose.Types.ObjectId(order.tapeId._id);
      const location = order.sourceLocation;
      const tape = order.tapeId;

      let StockModel = TapeStock;
      let StockLogModel = TapeStockLog;
      let matchField = "tape";

      if (order.onModel === "PosRoll") {
        StockModel = PosRollStock;
        StockLogModel = PosRollStockLog;
        matchField = "posRoll";
      } else if (order.onModel === "Tafeta") {
        StockModel = TafetaStock;
        StockLogModel = TafetaStockLog;
        matchField = "tafeta";
      } else if (order.onModel === "Ttr") {
        StockModel = TtrStock;
        StockLogModel = TtrStockLog;
        matchField = "ttr";
      }

      const qty = order.quantity; // TODO: Should this be dispatchedQuantity? For now assume cancelling full order if it was fully confirmed. Or partial?
      // If partial dispatch was supported, we really need to know *what* to reverse.
      // But assuming CONFIRMED means *fully* dispatched for now (or at least that's the only state we reverse from).
      // If it's PENDING but partially dispatched, and we cancel... we should reverse dispatchedQuantity.

      // Logic refinement for CANCEL:
      // If PENDING and dispatchedQuantity > 0, we should reverse that amount?
      // The current request didn't ask for generic cancel improvements, but I should probably handle it.
      // However, sticking to the requested scope: "click dispatch order... select less qty... should not be removed from pending"

      // Let's leave Cancel logic mostly as is, but maybe use dispatchedQuantity if available?
      // If previousStatus == CONFIRMED, it means it was fully dispatched (by my new logic).
      // So order.quantity is correct (or order.dispatchedQuantity which should be >= quantity).

      const qtyToReverse = order.dispatchedQuantity > 0 ? order.dispatchedQuantity : order.quantity;

      // Get current stock at this location
      const bal = await StockModel.aggregate([
        { $match: { [matchField]: tapeObjectId, location } },
        { $group: { _id: null, qty: { $sum: "$quantity" } } },
      ]);
      const currentStock = bal[0]?.qty || 0;

      // Re-add stock (positive entry)
      const stockData = {
        [matchField]: tapeObjectId,
        location,
        quantity: qtyToReverse,
        remarks: `Sales Order Cancelled (reversed): ${orderId}`,
      };
      if (order.onModel === "Tape") stockData.tapeFinish = tape.tapeFinish;
      if (order.onModel === "Tafeta") stockData.tafetaType = tape.tafetaType;

      await StockModel.create(stockData);

      // Stock Log entry
      const logData = {
        [matchField]: tapeObjectId,
        location,
        openingStock: currentStock,
        quantity: qtyToReverse,
        closingStock: currentStock + qtyToReverse,
        type: "INWARD",
        source: "SYSTEM",
        remarks: `Sales Order Cancelled (reversed): ${orderId}`,
        createdBy: req.user?.username || "SYSTEM",
      };
      await StockLogModel.create(logData);

      // Action Log entry for cancel from CONFIRMED
      await SalesOrderLog.create({
        orderId,
        action: "CANCELLED",
        cancelReason: cancelReason || "No reason provided",
        quantity: qtyToReverse,
        performedBy: req.user?.username || "SYSTEM",
      });

      // Reset dispatched qty
      await TapeSalesOrder.findByIdAndUpdate(orderId, { dispatchedQuantity: 0 });
    }

    // Update the order status
    await TapeSalesOrder.findByIdAndUpdate(orderId, { status: finalStatus });

    if (finalStatus === "PENDING" && status === "CONFIRMED") {
      req.flash("notification", `Partially dispatched. remaining is pending.`);
    } else {
      req.flash("notification", `Order status updated to ${finalStatus}`);
    }
    if (wantsJson) {
      res.json({ success: true, redirect: "/fairdesk/sales/pending" });
    } else {
      res.redirect("/fairdesk/sales/pending");
    }
  } catch (err) {
    console.error("STATUS UPDATE ERROR:", err);
    const accepts = req.headers.accept || "";
    const wantsJson = req.xhr || accepts.includes("application/json") || accepts.includes("text/json");
    if (wantsJson) {
      res.status(400).json({ success: false, message: "Failed to update status" });
    } else {
      req.flash("notification", "Failed to update status");
      res.redirect("back");
    }
  }
});

// ========== EDIT a Dispatch Log (JSON API) ==========
router.put("/sales/order/log/:logId", async (req, res) => {
  try {
    const { logId } = req.params;
    const { quantity: newQty, invoiceNumber, date } = req.body;

    const log = await SalesOrderLog.findById(logId).lean();
    if (!log) return res.json({ success: false, message: "Log not found" });

    const order = await TapeSalesOrder.findById(log.orderId).populate({ path: "tapeId", select: "tapeFinish" }).lean();
    if (!order) return res.json({ success: false, message: "Order not found" });

    const oldQty = log.quantity;
    const qtyDiff = Number(newQty) - oldQty;
    const tapeObjectId = new mongoose.Types.ObjectId(order.tapeId._id);
    const location = order.sourceLocation;
    const tape = order.tapeId;

    let StockModel = TapeStock;
    let StockLogModel = TapeStockLog;
    let matchField = "tape";

    if (order.onModel === "PosRoll") {
      StockModel = PosRollStock;
      StockLogModel = PosRollStockLog;
      matchField = "posRoll";
    } else if (order.onModel === "Tafeta") {
      StockModel = TafetaStock;
      StockLogModel = TafetaStockLog;
      matchField = "tafeta";
    } else if (order.onModel === "Ttr") {
      StockModel = TtrStock;
      StockLogModel = TtrStockLog;
      matchField = "ttr";
    }

    if (location && tape && qtyDiff !== 0) {
      // Get current stock at location
      const bal = await StockModel.aggregate([
        { $match: { [matchField]: tapeObjectId, location } },
        { $group: { _id: null, qty: { $sum: "$quantity" } } },
      ]);
      const currentStock = bal[0]?.qty || 0;

      if (qtyDiff > 0) {
        // Need to deduct MORE stock
        if (currentStock < qtyDiff) {
          return res.json({
            success: false,
            message: `Insufficient stock at ${location}. Available: ${currentStock}, Additional needed: ${qtyDiff}`,
          });
        }

        const stockData = {
          [matchField]: tapeObjectId,
          location,
          quantity: -qtyDiff,
          remarks: `Log Edit (additional deduction): ${log.orderId}`,
        };
        if (order.onModel === "Tape") stockData.tapeFinish = tape.tapeFinish;
        if (order.onModel === "Tafeta") stockData.tafetaType = tape.tafetaType;

        await StockModel.create(stockData);

        const logData = {
          [matchField]: tapeObjectId,
          location,
          openingStock: currentStock,
          quantity: qtyDiff,
          closingStock: currentStock - qtyDiff,
          type: "OUTWARD",
          source: "SYSTEM",
          remarks: `Log Edit (additional deduction): ${log.orderId}`,
          createdBy: req.user?.username || "SYSTEM",
        };
        await StockLogModel.create(logData);
      } else {
        // Reverse some stock (qtyDiff is negative, so -qtyDiff is positive)
        const reverseQty = -qtyDiff;

        const stockData = {
          [matchField]: tapeObjectId,
          location,
          quantity: reverseQty,
          remarks: `Log Edit (partial reversal): ${log.orderId}`,
        };
        if (order.onModel === "Tape") stockData.tapeFinish = tape.tapeFinish;
        if (order.onModel === "Tafeta") stockData.tafetaType = tape.tafetaType;

        await StockModel.create(stockData);

        const logData = {
          [matchField]: tapeObjectId,
          location,
          openingStock: currentStock,
          quantity: reverseQty,
          closingStock: currentStock + reverseQty,
          type: "INWARD",
          source: "SYSTEM",
          remarks: `Log Edit (partial reversal): ${log.orderId}`,
          createdBy: req.user?.username || "SYSTEM",
        };
        await StockLogModel.create(logData);
      }
    }

    // Update dispatched quantity on the order
    const newDispatched = (order.dispatchedQuantity || 0) + qtyDiff;
    const newStatus = newDispatched >= order.quantity ? "CONFIRMED" : "PENDING";

    await TapeSalesOrder.findByIdAndUpdate(order._id, {
      dispatchedQuantity: newDispatched,
      status: newStatus,
    });

    // Calculate action time using the provided date + current time
    const now = new Date();
    let actionTime = now;
    if (date) {
      const [y, m, d] = date.split("-").map(Number);
      actionTime = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
    }

    // Update the log entry
    await SalesOrderLog.findByIdAndUpdate(logId, {
      quantity: Number(newQty),
      invoiceNumber: invoiceNumber || "",
      performedAt: actionTime,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("EDIT LOG ERROR:", err);
    return res.json({ success: false, message: "Server error" });
  }
});

// ========== DELETE a Dispatch Log (JSON API) ==========
router.delete("/sales/order/log/:logId", async (req, res) => {
  try {
    const { logId } = req.params;

    const log = await SalesOrderLog.findById(logId).lean();
    if (!log) return res.json({ success: false, message: "Log not found" });

    const order = await TapeSalesOrder.findById(log.orderId).populate({ path: "tapeId", select: "tapeFinish" }).lean();
    if (!order) return res.json({ success: false, message: "Order not found" });

    const tapeObjectId = new mongoose.Types.ObjectId(order.tapeId._id);
    const location = order.sourceLocation;
    const tape = order.tapeId;
    const qty = log.quantity;

    let StockModel = TapeStock;
    let StockLogModel = TapeStockLog;
    let matchField = "tape";

    if (order.onModel === "PosRoll") {
      StockModel = PosRollStock;
      StockLogModel = PosRollStockLog;
      matchField = "posRoll";
    } else if (order.onModel === "Tafeta") {
      StockModel = TafetaStock;
      StockLogModel = TafetaStockLog;
      matchField = "tafeta";
    } else if (order.onModel === "Ttr") {
      StockModel = TtrStock;
      StockLogModel = TtrStockLog;
      matchField = "ttr";
    }

    // Reverse stock deduction (add stock back)
    if (location && tape && qty > 0) {
      const bal = await StockModel.aggregate([
        { $match: { [matchField]: tapeObjectId, location } },
        { $group: { _id: null, qty: { $sum: "$quantity" } } },
      ]);
      const currentStock = bal[0]?.qty || 0;

      const stockData = {
        [matchField]: tapeObjectId,
        location,
        quantity: qty,
        remarks: `Log Deleted (reversed): ${log.orderId}`,
      };
      if (order.onModel === "Tape") stockData.tapeFinish = tape.tapeFinish;
      if (order.onModel === "Tafeta") stockData.tafetaType = tape.tafetaType;

      await StockModel.create(stockData);

      const logData = {
        [matchField]: tapeObjectId,
        location,
        openingStock: currentStock,
        quantity: qty,
        closingStock: currentStock + qty,
        type: "INWARD",
        source: "SYSTEM",
        remarks: `Log Deleted (reversed): ${log.orderId}`,
        createdBy: req.user?.username || "SYSTEM",
      };
      await StockLogModel.create(logData);
    }

    // Update dispatched quantity on the order
    const newDispatched = Math.max(0, (order.dispatchedQuantity || 0) - qty);
    const newStatus = newDispatched >= order.quantity ? "CONFIRMED" : "PENDING";

    await TapeSalesOrder.findByIdAndUpdate(order._id, {
      dispatchedQuantity: newDispatched,
      status: newStatus,
    });

    // Delete the log entry
    await SalesOrderLog.findByIdAndDelete(logId);

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE LOG ERROR:", err);
    return res.json({ success: false, message: "Server error" });
  }
});

// Legacy route redirect
router.get("/form/salesorder", (req, res) => {
  res.redirect("/fairdesk/sales/order");
});

// ----------------------------------Sales Calculator---------------------------------->
// route for salescalc form.
router.get("/form/salescalc", async (req, res) => {
  let clients = await Client.distinct("clientName");
  res.render("utilities/salesCalc.ejs", { clients });
});

// Route to handle salescalc form submission.
router.post("/form/salescalc", async (req, res) => {
  let formData = req.body;

  await Calculator.create(formData);
  res.send("Sales Calculation created successfully!");
});

// ----------------------------------Production Calculator---------------------------------->
// route for prodcalc form.
router.get("/form/prodcalc", async (req, res) => {
  let clients = await Client.distinct("clientName");
  res.render("utilities/prodCalc.ejs", {
    title: "Production Calculator",
    CSS: false,
    JS: "prodCalc.js",
    clients,
    notification: req.flash("notification"),
  });
});

// Route to handle prodcalc form submission.
router.get("/form/prodcalc/data", async (req, res) => {
  let { w, h, client } = req.query;
  console.log(w, h, client);
  let clients = await Calculator.findOne({ companyName: client, labelWidth: w, labelHeight: h });
  console.log(clients);
  res.status(200).json(clients);
});

// Route to handle systemid form submission.
router.post("/form/prodcalc", async (req, res) => {
  let formData = req.body;

  await Calculator.create(formData);
  res.send("Production Calculation created successfully!");
});

// ----------------------------------Block Master---------------------------------->
// route for systemid form.
router.get("/form/block", async (req, res) => {
  let clients = await Client.distinct("clientName");
  console.log(clients);
  res.render("utilities/blockMaster.ejs", {
    CSS: false,
    title: "Block",
    JS: false,
    clients,
    notification: req.flash("notification"),
  });
});

// Route to handle systemid form submission.
router.post("/form/block", async (req, res) => {
  try {
    let formData = req.body;
    await Block.create(formData);
    req.flash("notification", "Block created successfully!");
    res.json({ success: true, redirect: "/fairdesk/form/block" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------Die Master---------------------------------->
// route for systemid form.
router.get("/form/die", async (req, res) => {
  let clients = await Client.distinct("clientName");
  console.log(clients);
  res.render("utilities/dieMaster.ejs", {
    CSS: "tabOpt.css",
    title: "Die",
    JS: "clientForm.js",
    clients,
    notification: req.flash("notification"),
  });
});

// Route to handle systemid form submission.
router.post("/form/die", async (req, res) => {
  try {
    await Die.create(req.body);
    req.flash("notification", "Die created successfully!");
    res.json({ success: true, redirect: "/fairdesk/form/die" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------------------------------->>>>>

// ----------------------------------client display---------------------------------->
// route for client display page.
router.get("/edit/client", async (req, res) => {
  let clients = await Client.find();
  res.render("edit/clientDisp.ejs", {
    CSS: false,
    title: "Client Display",
    JS: false,
    clients,
    notification: req.flash("notification"),
  });
});

// ----------------------------------user display---------------------------------->
// route for user display page.
router.get("/edit/user/:id", async (req, res) => {
  let { id } = req.params;
  let clientData = await Client.findOne({ _id: id }).populate("users");
  let users = clientData.users;
  console.log(users);
  // res.send(users);
  res.render("edit/userDisp.ejs", {
    CSS: false,
    title: "Username Display",
    JS: false,
    users,
    notification: req.flash("notification"),
  });
});

// ----------------------------------CLIENT DETAILS----------------------------------
router.get("/client/details/:userId", async (req, res) => {
  try {
    // 1️⃣ Get ONLY the clicked user
    const user = await Username.findById(req.params.userId)
      .populate("label")
      .populate("ttr")
      .populate({
        path: "tape",
        populate: { path: "tapeId" }, // REQUIRED
      })
      .populate({
        path: "posRoll",
        populate: { path: "posRollId" }, // REQUIRED
      })
      .populate({
        path: "tafeta",
        populate: { path: "tafetaId" }, // REQUIRED
      });

    if (!user) {
      req.flash("notification", "User not found");
      return res.redirect("/fairdesk/master/view");
    }

    // 2️⃣ User + Client info (same as before)
    const userData = {
      _id: user._id,
      clientId: user.clientId,
      clientName: user.clientName,
      clientType: user.clientType,
      hoLocation: user.hoLocation,
      accountHead: user.accountHead,

      userName: user.userName,
      userContact: user.userContact,
      userEmail: user.userEmail,
      userLocation: user.userLocation,
      userDepartment: user.userDepartment,
      SelfDispatch: user.SelfDispatch,
      dispatchAddress: user.dispatchAddress,
      transportName: user.transportName,
      transportContact: user.transportContact,
      dropLocation: user.dropLocation,
      deliveryMode: user.deliveryMode,
      deliveryLocation: user.deliveryLocation,
      clientPayment: user.clientPayment,
    };

    // 3️⃣ USER-ONLY inventory
    const labels = user.label || [];
    const ttrs = user.ttr || [];
    const tapes = user.tape || [];
    const posRolls = user.posRoll || [];
    const tafetas = user.tafeta || [];

    // 4️⃣ STATS (user-only)
    const stats = {
      labels: labels.length,
      ttrs: ttrs.length,
      tapes: tapes.length,
      posRolls: posRolls.length,
      tafetas: tafetas.length,
    };

    console.log("TAPES FULL OBJECT:", JSON.stringify(user.tape, null, 2));

    res.render("users/clientDetails.ejs", {
      title: "User Details",
      CSS: false,
      JS: false,
      userData,
      labels,
      ttrs,
      tapes,
      posRolls,
      tafetas,
      stats,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("USER DETAILS ERROR:", err);
    req.flash("notification", "Failed to load user details");
    res.redirect("/fairdesk/master/view");
  }
});

// ----------------------------------Master display---------------------------------->
// route for details page.
router.get("/master/view", async (req, res) => {
  let jsonData = await Username.find()
    .select("clientName clientType accountHead userName userLocation label ttr tape posRoll tafeta")
    .sort({ clientName: 1, userName: 1 });

  // console.log(jsonData);
  res.render("users/masterDisp.ejs", {
    jsonData,
    CSS: "tableDisp.css",
    JS: false,
    title: "Client Details",
    notification: req.flash("notification"),
  });
});

// ----------------------------------Vendor display----------------------------------
router.get("/vendor/view", async (req, res) => {
  try {
    const jsonData = await Vendor.find()
      .select("vendorId vendorName vendorStatus hoLocation warehouseLocation commodities vendorGst vendorMsme vendorGumasta vendorPan users")
      .populate({ path: "users", select: "_id" })
      .sort({ vendorName: 1 });

    res.render("users/vendorsView.ejs", {
      jsonData,
      CSS: "tableDisp.css",
      JS: false,
      title: "Vendor Details",
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("VENDOR VIEW ERROR:", err);
    req.flash("notification", "Failed to load vendor details");
    res.redirect("/fairdesk/form/vendor");
  }
});

// Backward-compatible redirect for the old vendor coordinator URL.
router.get("/vendor/user/view", async (req, res) => {
  return res.redirect("/fairdesk/vendor/coordinator/view");
});

// ----------------------------------Vendor coordinator display----------------------------------
router.get("/vendor/coordinator/view", async (req, res) => {
  try {
    const jsonData = await VendorUser.find()
      .sort({ vendorName: 1, userName: 1 })
      .lean();

    jsonData.forEach((row) => {
      row.dispatchType = row.SelfDispatch ? "Self Dispatch" : "Transport";
      row.ttrCount = row.ttr?.length || 0;
      row.tapeCount = row.tape?.length || 0;
      row.posRollCount = row.posRoll?.length || 0;
      row.tafetaCount = row.tafeta?.length || 0;
    });

    res.render("users/vendorUserView.ejs", {
      jsonData,
      CSS: "tableDisp.css",
      JS: false,
      title: "Vendor Coordinator View",
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("VENDOR COORDINATOR VIEW ERROR:", err);
    req.flash("notification", "Failed to load vendor coordinator view");
    res.redirect("/fairdesk/form/vendor");
  }
});

// ----------------------------------Labels display---------------------------------->
// Centralized Sales Order Form
router.get("/sales/order", async (req, res) => {
  const clients = await Client.distinct("clientName");
  let orderToEdit = null;

  if (req.query.orderId) {
    try {
      orderToEdit = await TapeSalesOrder.findById(req.query.orderId)
        .populate({ path: "userId", select: "clientName userName userLocation" })
        .lean();
    } catch (err) {
      console.error("Error fetching order to edit:", err);
    }
  }

  res.render("inventory/salesOrderForm.ejs", {
    clients,
    orderToEdit,
    CSS: false,
    JS: false,
    title: orderToEdit ? "Edit Sales Order" : "Sales Order",
    notification: req.flash("notification"),
  });
});

// ----------------------------------Labels display (individual)---------------------------------->
// route for details page.
router.get("/disp/labels", async (req, res) => {
  let jsonData = await Label.find();

  res.render("inventory/labelsDisp.ejs", {
    jsonData,
    CSS: "tableDisp.css",
    JS: false,
    title: "Labels Display",
    notification: req.flash("notification"),
  });
});

// route for details page.
router.get("/labels/view/:id", async (req, res) => {
  console.log(req.params.id);
  let userData = await Username.findById(req.params.id).populate("label");
  let jsonData = userData.label;

  console.log(jsonData);
  // res.send("hello");
  res.render("inventory/labelsDisp.ejs", {
    jsonData,
    CSS: "tableDisp.css",
    JS: false,
    title: "Labels Display",
    notification: req.flash("notification"),
  });
});

export default router;
