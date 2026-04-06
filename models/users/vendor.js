import mongoose from "mongoose";

let vendorSchema = new mongoose.Schema({
  vendorId: { type: String, required: true, unique: true },
  vendorName: { type: String, required: true },
  vendorType: { type: String, required: true },
  vendorStatus: { type: String, required: true },
  hoLocation: { type: String, required: true },
  accountHead: { type: String, required: true },
  vendorGst: { type: String, required: true },
  vendorMsme: { type: String, required: true },
  vendorGumasta: { type: String, required: true },
  vendorPan: { type: String, required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: "VendorUser" }],
});

let Vendor = mongoose.model("Vendor", vendorSchema);

export default Vendor;
