import mongoose from "mongoose";
const { Schema } = mongoose;

const vendorUserSchema = new mongoose.Schema({
  vendorId: { type: String, required: true },
  vendorName: { type: String, required: true },
  hoLocation: { type: String, required: true },
  warehouseLocation: { type: String, required: true },
  userName: { type: String, required: true },
  userLocation: { type: String, required: true },
  userDepartment: { type: String, required: true },
  userContact: { type: String, required: true },
  userEmail: { type: String, required: true },
  dispatchAddress: { type: String, required: true },
  transportName: { type: String },
  transportContact: { type: String },
  dropLocation: { type: String },
  deliveryMode: { type: String },
  deliveryLocation: { type: String },
  vendorPayment: { type: String },
  SelfDispatch: { type: String },
  vendorStatus: { type: String },
  ownerName: { type: String },
  ownerMobNo: { type: String },
  ownerEmail: { type: String },
  vendorGst: { type: String },
  vendorMsme: { type: String },

  // Multiple label per vendor (future-proof)
  label: [
    {
      type: Schema.Types.ObjectId,
      ref: "Label",
    },
  ],
});

const VendorUser = mongoose.model("VendorUser", vendorUserSchema);

export default VendorUser;
