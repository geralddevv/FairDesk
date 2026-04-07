import mongoose from "mongoose";

let vendorSchema = new mongoose.Schema({
  vendorId: { type: String, required: true, unique: true },
  vendorName: { type: String, required: true },
  vendorStatus: { type: String, required: true },
  hoLocation: { type: String, required: true },
  warehouseLocation: { type: String, required: true },
  commodities: [{ type: String }],
  commodityHead: { type: String },
  commodityMake: { type: String },
  commodityModel: { type: String },
  commodityPartNo: { type: String },
  vendorGst: { type: String, required: true },
  vendorMsme: { type: String, required: true },
  vendorGumasta: { type: String, required: true },
  vendorPan: { type: String, required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: "VendorUser" }],
});

let Vendor = mongoose.model("Vendor", vendorSchema);

export default Vendor;
