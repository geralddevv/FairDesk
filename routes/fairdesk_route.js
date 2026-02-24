import express, { json } from "express";
import mongoose from "mongoose";
// import asyncHandler from "express-async-handler";
import Client from "../models/users/client.js";
import Username from "../models/users/username.js";
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
const router = express.Router();

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
  let clients = await Client.distinct("clientName");
  let userCount = await Username.countDocuments();
  let clientCount = clients.length;
  res.render("users/clientForm.ejs", {
    JS: "clientForm.js",
    CSS: "tabOpt.css",
    title: "Client Form",
    clientCount,
    userCount,
    clients,
    notification: req.flash("notification"),
  });
});

// Route to handle CLIENT form submission
router.post("/form/client", async (req, res) => {
  let formData = req.body;

  await Client.create(formData);

  req.flash("notification", "Client created successfully!");
  res.redirect("/fairdesk/form/client");
});

router.get("/form/client/:name", async (req, res) => {
  let clientData = await Client.findOne({ clientName: req.params.name });
  let clientName = clientData;
  res.status(200).json(clientName);
});

// ----------------------------------Username---------------------------------->
// Route to handle USER form submission
router.post("/form/user", async (req, res) => {
  let { objectId } = req.body;
  let newUser = await Username.create(req.body);
  // console.log(formData.objectId);
  let client = await Client.findOne({ _id: objectId });

  client.users.push(newUser);
  await client.save();

  req.flash("notification", "User created successfully!");
  res.redirect("/fairdesk/form/client");
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
  let { userObjId } = req.body;
  let savedLabel = await Label.create(req.body);
  console.log(userObjId);
  let user = await Username.findOne({ _id: userObjId });
  console.log(user);
  user.label.push(savedLabel);
  await user.save();

  req.flash("notification", "Label created successfully!");
  res.redirect("/fairdesk/form/labels");
});

router.get("/form/labels/:name", async (req, res) => {
  let clientData = await Client.findOne({ clientName: req.params.name }).populate("users");
  let clientName = clientData;
  console.log(clientName.users);
  console.log(clientName);
  res.status(200).json(clientName);
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
// route for ttr form.
router.get("/form/ttr", async (req, res) => {
  let clients = await Client.distinct("clientName");
  let ttrCount = (await Ttr.countDocuments()) + 1;
  console.log(ttrCount);

  res.render("inventory/ttr.ejs", {
    JS: "ttr.js",
    CSS: false,
    title: "TTR",
    clients,
    ttrCount,
    notification: req.flash("notification"),
  });
});

// Route to handle ttr form submission.
router.post("/form/ttr", async (req, res) => {
  let { userId } = req.body;
  let ttrData = await Ttr.create(req.body);

  let user = await Username.findOne({ _id: userId });
  user.ttr.push(ttrData);
  await user.save();

  req.flash("notification", "TTR created successfully!");
  res.redirect("/fairdesk/form/ttr");
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
  const tapeCount = (await Tape.countDocuments()) + 1;

  res.render("inventory/tape.ejs", {
    JS: false,
    CSS: false,
    title: "Tape Master",
    tapeCount,
    notification: req.flash("notification"),
  });
});

// POST: Tape Master submission
router.post("/form/tape-master", async (req, res) => {
  console.log("TAPE MASTER BODY", req.body);
  try {
    const data = {
      tapeProductId: req.body.tapeProductId,
      tapePaperCode: req.body.tapePaperCode,
      tapeGsm: Number(req.body.tapeGsm),
      tapePaperType: req.body.tapePaperType,
      tapeWidth: Number(req.body.tapeWidth),
      tapeMtrs: Number(req.body.tapeMtrs),
      tapeCoreId: Number(req.body.tapeCoreId),
      tapeAdhesiveGsm: Number(req.body.tapeAdhesiveGsm),
      tapeFinish: req.body.tapeFinish,
      createdBy: req.user?.username || "SYSTEM",
    };

    await Tape.create(data);

    req.flash("notification", "Tape Master created successfully!");
    res.redirect("/fairdesk/form/tape-master");
  } catch (err) {
    console.error(err);
    req.flash("notification", err.message);
    res.redirect("back");
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

// ================= TAPE PROFILE VIEW =================
router.get("/tape/profile/:id", async (req, res) => {
  const tape = await Tape.findById(req.params.id).lean();

  if (!tape) {
    req.flash("notification", "Tape not found");
    return res.redirect("back");
  }

  res.render("inventory/tapeView.ejs", { tape });
});

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
    await Tape.findByIdAndUpdate(req.params.id, req.body);
    res.redirect(`/fairdesk/tape/profile/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.redirect("back");
  }
});

// ----------------------------------Sales Order---------------------------------->
// Centralized Sales Order Form
router.get("/sales/order", async (req, res) => {
  const clients = await Client.distinct("clientName");
  let orderToEdit = null;
  let logs = [];

  if (req.query.orderId) {
    try {
      orderToEdit = await TapeSalesOrder.findById(req.query.orderId).lean();
      logs = await SalesOrderLog.find({ orderId: req.query.orderId, action: "DELIVERED" })
        .sort({ performedAt: -1 })
        .lean();
    } catch (err) {
      console.error("Error fetching order to edit:", err);
    }
  }

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
router.get("/sales/items/:type/:userId", async (req, res) => {
  try {
    const { type, userId } = req.params;
    let items = [];

    if (type === "TAPE") {
      const user = await Username.findById(userId).populate({
        path: "tape",
        populate: { path: "tapeId" },
      });

      // Get all tape IDs for this user
      const tapeBindings = user?.tape || [];

      // Fetch stock for all these tapes in one go
      const tapeIds = tapeBindings.map((b) => b.tapeId?._id).filter(Boolean);

      // 1. Get Physical Stock
      const stockAggregation = await TapeStock.aggregate([
        { $match: { tape: { $in: tapeIds } } },
        {
          $group: {
            _id: { tape: "$tape", location: "$location" },
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
      ]);

      // 2. Get Booked Stock (Pending Orders) — overall AND per-location
      const bookedAggregation = await TapeSalesOrder.aggregate([
        { $match: { tapeId: { $in: tapeIds }, status: "PENDING" } },
        {
          $group: {
            _id: { tapeId: "$tapeId", location: "$sourceLocation" },
            bookedQty: {
              $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] },
            },
          },
        },
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
          stock: stockInfo,
        };
      });
    } else if (type === "LABEL") {
      const user = await Username.findById(userId).populate("label");
      items = (user?.label || []).map((lbl) => ({
        _id: lbl._id,
        displayName: `${lbl.labelId || "N/A"} - ${lbl.labelWidth || ""}x${lbl.labelHeight || ""}`,
        stock: { locations: [], totalStock: 0 }, // Placeholder for Label stock
      }));
    } else if (type === "TTR") {
      const user = await Username.findById(userId).populate("ttr");
      items = (user?.ttr || []).map((ttr) => ({
        _id: ttr._id,
        displayName: `${ttr.ttrId || "N/A"} - ${ttr.ttrWidth || ""}x${ttr.ttrMtrs || ""}`,
        stock: { locations: [], totalStock: 0 }, // Placeholder for TTR stock
      }));
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
    const { orderId, itemType, userId, itemId, quantity, estimatedDate, remarks, sourceLocation } = req.body;

    if (itemType === "TAPE") {
      const binding = await TapeBinding.findById(itemId);
      if (!binding) {
        req.flash("notification", "Invalid item selected");
        return res.redirect("back");
      }

      const data = {
        tapeBinding: itemId,
        userId: binding.userId,
        tapeId: binding.tapeId,
        sourceLocation, // Allow updating location if needed
        quantity: Number(quantity),
        estimatedDate: new Date(estimatedDate),
        remarks,
        // createdBy remains same for edits, but tracking modifiedBy could be good
      };

      if (orderId) {
        // UPDATE existing order
        await TapeSalesOrder.findByIdAndUpdate(orderId, data);
        req.flash("notification", "Sales order updated successfully!");
        res.redirect("/fairdesk/sales/pending"); // Redirect back to pending list after edit
      } else {
        // CREATE new order
        data.createdBy = req.user?.username || "SYSTEM";
        const newOrder = await TapeSalesOrder.create(data);

        // Action Log entry for creation
        await SalesOrderLog.create({
          orderId: newOrder._id,
          action: "CREATED",
          quantity: Number(quantity),
          performedBy: req.user?.username || "SYSTEM",
        });

        req.flash("notification", "Sales order created successfully!");

        // Redirect to pending orders
        res.redirect("/fairdesk/sales/pending");
      }
    } else {
      // Placeholder for non-TAPE items (if any logic exists)
      req.flash("notification", "Only Tape orders supported for now");
      res.redirect("back");
    }
  } catch (err) {
    console.error("ORDER SUBMIT ERROR:", err);
    req.flash("notification", "Failed to submit order");
    res.redirect("back");
  }
});

// View Pending Orders
router.get("/sales/pending", async (req, res) => {
  try {
    // For now we only have TapeSalesOrder
    const pendingOrders = await TapeSalesOrder.find({ status: "PENDING" })
      .populate("userId")
      .populate("tapeId")
      .populate("tapeBinding")
      .sort({ createdAt: -1 })
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
      .populate("userId")
      .populate("tapeId")
      .populate("tapeBinding")
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

      // 1. Get Physical Stock
      const stockAgg = await TapeStock.aggregate([
        { $match: { tape: tapeObjectId } },
        {
          $group: {
            _id: "$location",
            qty: { $sum: "$quantity" },
          },
        },
      ]);

      // 2. Get Booked Stock (Pending Orders) — overall AND per-location
      const bookedAgg = await TapeSalesOrder.aggregate([
        { $match: { tapeId: tapeObjectId, status: "PENDING" } },
        {
          $group: {
            _id: "$sourceLocation",
            bookedQty: {
              $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] },
            },
          },
        },
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
          { path: "tapeId", select: "tapePaperCode tapeGsm" },
        ],
      })
      .sort({ performedAt: -1 });

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
    const { orderId, status, cancelReason, invoiceNumber, confirmDate, confirmQuantity } = req.body;
    const order = await TapeSalesOrder.findById(orderId).populate("tapeId");

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
      const bal = await TapeStock.aggregate([
        { $match: { tape: tapeObjectId, location } },
        { $group: { _id: null, qty: { $sum: "$quantity" } } },
      ]);
      const currentStock = bal[0]?.qty || 0;

      // Validate sufficient stock
      if (currentStock < qty) {
        req.flash("notification", `Insufficient stock at ${location}. Available: ${currentStock}, Required: ${qty}`);
        return res.redirect("/fairdesk/sales/pending");
      }

      // Insert negative stock entry (outward)
      await TapeStock.create({
        tape: tapeObjectId,
        tapeFinish: tape.tapeFinish,
        location,
        quantity: -qty,
        remarks: `Sales Order Confirmed: ${orderId}`,
      });

      // Stock Log entry
      await TapeStockLog.create({
        tape: tapeObjectId,
        location,
        openingStock: currentStock,
        quantity: qty,
        closingStock: currentStock - qty,
        type: "OUTWARD",
        source: "SYSTEM",
        remarks: `Sales Order Confirmed: ${orderId}`,
        createdBy: req.user?.username || "SYSTEM",
      });

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
      const bal = await TapeStock.aggregate([
        { $match: { tape: tapeObjectId, location } },
        { $group: { _id: null, qty: { $sum: "$quantity" } } },
      ]);
      const currentStock = bal[0]?.qty || 0;

      // Re-add stock (positive entry)
      await TapeStock.create({
        tape: tapeObjectId,
        tapeFinish: tape.tapeFinish,
        location,
        quantity: qtyToReverse,
        remarks: `Sales Order Cancelled (reversed): ${orderId}`,
      });

      // Stock Log entry
      await TapeStockLog.create({
        tape: tapeObjectId,
        location,
        openingStock: currentStock,
        quantity: qtyToReverse,
        closingStock: currentStock + qtyToReverse,
        type: "INWARD",
        source: "SYSTEM",
        remarks: `Sales Order Cancelled (reversed): ${orderId}`,
        createdBy: req.user?.username || "SYSTEM",
      });

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
    res.redirect("/fairdesk/sales/pending");
  } catch (err) {
    console.error("STATUS UPDATE ERROR:", err);
    req.flash("notification", "Failed to update status");
    res.redirect("back");
  }
});

// ========== EDIT a Dispatch Log (JSON API) ==========
router.put("/sales/order/log/:logId", async (req, res) => {
  try {
    const { logId } = req.params;
    const { quantity: newQty, invoiceNumber, date } = req.body;

    const log = await SalesOrderLog.findById(logId);
    if (!log) return res.json({ success: false, message: "Log not found" });

    const order = await TapeSalesOrder.findById(log.orderId).populate("tapeId");
    if (!order) return res.json({ success: false, message: "Order not found" });

    const oldQty = log.quantity;
    const qtyDiff = Number(newQty) - oldQty;
    const tapeObjectId = new mongoose.Types.ObjectId(order.tapeId._id);
    const location = order.sourceLocation;
    const tape = order.tapeId;

    if (location && tape && qtyDiff !== 0) {
      // Get current stock at location
      const bal = await TapeStock.aggregate([
        { $match: { tape: tapeObjectId, location } },
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

        await TapeStock.create({
          tape: tapeObjectId,
          tapeFinish: tape.tapeFinish,
          location,
          quantity: -qtyDiff,
          remarks: `Log Edit (additional deduction): ${log.orderId}`,
        });

        await TapeStockLog.create({
          tape: tapeObjectId,
          location,
          openingStock: currentStock,
          quantity: qtyDiff,
          closingStock: currentStock - qtyDiff,
          type: "OUTWARD",
          source: "SYSTEM",
          remarks: `Log Edit (additional deduction): ${log.orderId}`,
          createdBy: req.user?.username || "SYSTEM",
        });
      } else {
        // Reverse some stock (qtyDiff is negative, so -qtyDiff is positive)
        const reverseQty = -qtyDiff;

        await TapeStock.create({
          tape: tapeObjectId,
          tapeFinish: tape.tapeFinish,
          location,
          quantity: reverseQty,
          remarks: `Log Edit (partial reversal): ${log.orderId}`,
        });

        await TapeStockLog.create({
          tape: tapeObjectId,
          location,
          openingStock: currentStock,
          quantity: reverseQty,
          closingStock: currentStock + reverseQty,
          type: "INWARD",
          source: "SYSTEM",
          remarks: `Log Edit (partial reversal): ${log.orderId}`,
          createdBy: req.user?.username || "SYSTEM",
        });
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
    log.quantity = Number(newQty);
    log.invoiceNumber = invoiceNumber || "";
    log.performedAt = actionTime;
    await log.save();

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

    const log = await SalesOrderLog.findById(logId);
    if (!log) return res.json({ success: false, message: "Log not found" });

    const order = await TapeSalesOrder.findById(log.orderId).populate("tapeId");
    if (!order) return res.json({ success: false, message: "Order not found" });

    const tapeObjectId = new mongoose.Types.ObjectId(order.tapeId._id);
    const location = order.sourceLocation;
    const tape = order.tapeId;
    const qty = log.quantity;

    // Reverse stock deduction (add stock back)
    if (location && tape && qty > 0) {
      const bal = await TapeStock.aggregate([
        { $match: { tape: tapeObjectId, location } },
        { $group: { _id: null, qty: { $sum: "$quantity" } } },
      ]);
      const currentStock = bal[0]?.qty || 0;

      await TapeStock.create({
        tape: tapeObjectId,
        tapeFinish: tape.tapeFinish,
        location,
        quantity: qty,
        remarks: `Log Deleted (reversed): ${log.orderId}`,
      });

      await TapeStockLog.create({
        tape: tapeObjectId,
        location,
        openingStock: currentStock,
        quantity: qty,
        closingStock: currentStock + qty,
        type: "INWARD",
        source: "SYSTEM",
        remarks: `Log Deleted (reversed): ${log.orderId}`,
        createdBy: req.user?.username || "SYSTEM",
      });
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

// View Order Action Logs
router.get("/sales/order/logs", async (req, res) => {
  try {
    const logs = await SalesOrderLog.find()
      .populate({
        path: "orderId",
        populate: [
          { path: "userId", model: "Username" },
          { path: "tapeId", model: "Tape" },
        ],
      })
      .sort({ performedAt: -1 })
      .lean();

    res.render("inventory/orderLogs.ejs", {
      logs,
      title: "Order Logs",
      CSS: "tableDisp.css",
      JS: false,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error("ORDER LOGS ERROR:", err);
    req.flash("notification", "Failed to load order logs");
    res.redirect("back");
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
  let formData = req.body;

  let savedBlockData = await Block.create(formData);
  console.log(savedBlockData);
  req.flash("notification", "Block created successfully!");
  res.redirect("/fairdesk/form/block");
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
  let savedDieData = await Die.create(req.body);
  req.flash("notification", "Die created successfully!");
  res.redirect("/fairdesk/form/die");
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
      });

    if (!user) {
      req.flash("notification", "User not found");
      return res.redirect("/fairdesk/master/view");
    }

    // 2️⃣ User + Client info (same as before)
    const userData = {
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
    };

    // 3️⃣ USER-ONLY inventory
    const labels = user.label || [];
    const ttrs = user.ttr || [];
    const tapes = user.tape || [];

    // 4️⃣ STATS (user-only)
    const stats = {
      labels: labels.length,
      ttrs: ttrs.length,
      tapes: tapes.length,
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
  let jsonData = await Username.find().sort({ clientName: 1 });

  // console.log(jsonData);
  res.render("users/masterDisp.ejs", {
    jsonData,
    CSS: "tableDisp.css",
    JS: false,
    title: "Client Details",
    notification: req.flash("notification"),
  });
});

// ----------------------------------Labels display---------------------------------->
// Centralized Sales Order Form
router.get("/sales/order", async (req, res) => {
  const clients = await Client.distinct("clientName");
  let orderToEdit = null;

  if (req.query.orderId) {
    try {
      orderToEdit = await TapeSalesOrder.findById(req.query.orderId).lean();
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

// ----------------------------------TTR display---------------------------------->
// route for details page.
router.get("/ttr/view/:id", async (req, res) => {
  let userData = await Username.findById(req.params.id).populate("ttr");
  let jsonData = userData.ttr;

  // jsonData.push(itemsCount);
  console.log(jsonData);
  res.render("inventory/ttrDisp.ejs", {
    jsonData,
    CSS: "tableDisp.css",
    JS: false,
    title: "TTR Display",
    notification: req.flash("notification"),
  });
});

export default router;
