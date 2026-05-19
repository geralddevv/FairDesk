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

const router = express.Router();

const toUpperLocation = (value) => String(value || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
const toNumber = (value) => Number(value || 0);
const idString = (value) => String(value || "");

function formatSpec(parts) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

async function loadBookedMap(onModel) {
  const bookedRows = await TapeSalesOrder.aggregate([
    {
      $match: {
        onModel,
        status: { $nin: ["CANCELLED"] },
      },
    },
    {
      $group: {
        _id: {
          itemId: "$tapeId",
          location: { $toUpper: { $ifNull: ["$sourceLocation", "UNKNOWN"] } },
        },
        bookedQty: {
          $sum: { $subtract: ["$quantity", { $ifNull: ["$dispatchedQuantity", 0] }] },
        },
      },
    },
  ]);

  return new Map(
    bookedRows.map((row) => [
      `${idString(row._id?.itemId)}__${toUpperLocation(row._id?.location)}`,
      toNumber(row.bookedQty),
    ]),
  );
}

async function loadStockRows({
  stockModel,
  itemField,
  masterModel,
  masterSelect,
  onModel,
  itemType,
  buildProductId,
  buildSpec,
  buildProfileUrl,
}) {
  const [stockRows, bookedMap] = await Promise.all([
    stockModel.aggregate([
      {
        $group: {
          _id: {
            itemId: `$${itemField}`,
            location: { $toUpper: { $ifNull: ["$location", "UNKNOWN"] } },
          },
          quantity: { $sum: "$quantity" },
        },
      },
    ]),
    loadBookedMap(onModel),
  ]);

  const stockMap = new Map(
    stockRows.map((row) => [
      `${idString(row._id?.itemId)}__${toUpperLocation(row._id?.location)}`,
      toNumber(row.quantity),
    ]),
  );

  const rowKeys = Array.from(new Set([...stockMap.keys(), ...bookedMap.keys()])).filter(Boolean);
  const itemIds = Array.from(new Set(rowKeys.map((key) => key.split("__")[0]).filter(Boolean)));
  if (!itemIds.length) return [];

  const masters = await masterModel.find({ _id: { $in: itemIds } }).select(masterSelect).lean();
  const masterMap = new Map(masters.map((master) => [idString(master._id), master]));

  return rowKeys
    .map((key) => {
      const [itemId, location = "UNKNOWN"] = key.split("__");
      const master = masterMap.get(itemId);
      if (!master) return null;

      const quantity = toNumber(stockMap.get(key));
      const booked = toNumber(bookedMap.get(key));
      const balance = quantity - booked;

      if (quantity === 0 && booked === 0) return null;

      return {
        itemType,
        itemId,
        productId: buildProductId(master),
        location,
        quantity,
        booked,
        balance,
        specification: buildSpec(master),
        profileUrl: buildProfileUrl(itemId),
      };
    })
    .filter(Boolean);
}

router.get("/view", async (req, res) => {
  try {
    const groupedRows = await Promise.all([
      loadStockRows({
        stockModel: TapeStock,
        itemField: "tape",
        masterModel: Tape,
        masterSelect:
          "tapeProductId tapePaperCode tapeGsm tapePaperType tapeWidth tapeMtrs tapeCoreId tapeFinish",
        onModel: "Tape",
        itemType: "Tape",
        buildProductId: (master) => master.tapeProductId,
        buildSpec: (master) =>
          formatSpec([
            master.tapePaperCode,
            master.tapeGsm && `${master.tapeGsm} GSM`,
            master.tapePaperType,
            master.tapeWidth && `${master.tapeWidth} W`,
            master.tapeMtrs && `${master.tapeMtrs} M`,
            master.tapeCoreId && `Core ${master.tapeCoreId}`,
            master.tapeFinish,
          ]),
        buildProfileUrl: (itemId) => `/fairdesk/tape/profile/${itemId}`,
      }),
      loadStockRows({
        stockModel: PosRollStock,
        itemField: "posRoll",
        masterModel: PosRoll,
        masterSelect: "posProductId posPaperCode posPaperType posColor posGsm posWidth posMtrs posCoreId",
        onModel: "PosRoll",
        itemType: "POS Roll",
        buildProductId: (master) => master.posProductId,
        buildSpec: (master) =>
          formatSpec([
            master.posPaperCode,
            master.posPaperType,
            master.posColor,
            master.posGsm && `${master.posGsm} GSM`,
            master.posWidth && `${master.posWidth} W`,
            master.posMtrs && `${master.posMtrs} M`,
            master.posCoreId && `Core ${master.posCoreId}`,
          ]),
        buildProfileUrl: (itemId) => `/fairdesk/pos-roll/profile/${itemId}`,
      }),
      loadStockRows({
        stockModel: TafetaStock,
        itemField: "tafeta",
        masterModel: Tafeta,
        masterSelect:
          "tafetaProductId tafetaMaterialCode tafetaMaterialType tafetaColor tafetaGsm tafetaWidth tafetaMtrs tafetaCoreId",
        onModel: "Tafeta",
        itemType: "Tafeta",
        buildProductId: (master) => master.tafetaProductId,
        buildSpec: (master) =>
          formatSpec([
            master.tafetaMaterialCode,
            master.tafetaMaterialType,
            master.tafetaColor,
            master.tafetaGsm && `${master.tafetaGsm} GSM`,
            master.tafetaWidth && `${master.tafetaWidth} W`,
            master.tafetaMtrs && `${master.tafetaMtrs} M`,
            master.tafetaCoreId && `Core ${master.tafetaCoreId}`,
          ]),
        buildProfileUrl: (itemId) => `/fairdesk/tafeta/profile/${itemId}`,
      }),
      loadStockRows({
        stockModel: TtrStock,
        itemField: "ttr",
        masterModel: Ttr,
        masterSelect:
          "ttrProductId ttrType ttrColor ttrMaterialCode ttrWidth ttrMtrs ttrCoreId ttrCoreLength ttrWinding",
        onModel: "Ttr",
        itemType: "TTR",
        buildProductId: (master) => master.ttrProductId,
        buildSpec: (master) =>
          formatSpec([
            master.ttrType,
            master.ttrColor,
            master.ttrMaterialCode,
            master.ttrWidth && `${master.ttrWidth} W`,
            master.ttrMtrs && `${master.ttrMtrs} M`,
            master.ttrCoreId && `Core ${master.ttrCoreId}`,
            master.ttrCoreLength && `${master.ttrCoreLength} CL`,
            master.ttrWinding,
          ]),
        buildProfileUrl: (itemId) => `/fairdesk/ttr/profile/${itemId}`,
      }),
    ]);

    const rows = groupedRows
      .flat()
      .sort(
        (a, b) =>
          a.itemType.localeCompare(b.itemType) ||
          a.productId.localeCompare(b.productId) ||
          a.location.localeCompare(b.location),
      );

    const summary = {
      totalLines: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + toNumber(row.quantity), 0),
      totalBooked: rows.reduce((sum, row) => sum + toNumber(row.booked), 0),
      totalBalance: rows.reduce((sum, row) => sum + toNumber(row.balance), 0),
      totalLocations: new Set(rows.map((row) => row.location)).size,
      totalItems: new Set(rows.map((row) => row.itemId)).size,
    };

    res.render("stock/stockView.ejs", {
      title: "Stock View",
      CSS: "tableDisp.css",
      JS: false,
      notification: req.flash("notification"),
      jsonData: rows,
      summary,
    });
  } catch (err) {
    console.error("Failed to load stock summary", err);
    req.flash("notification", "Failed to load stock summary");
    res.redirect("/fairdesk");
  }
});

export default router;
