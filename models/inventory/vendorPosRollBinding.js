import mongoose from "mongoose";

const vendorPosRollBindingSchema = new mongoose.Schema(
  {
    vendorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorUser",
      required: true,
      index: true,
    },
    posRollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PosRoll",
      required: true,
      index: true,
    },
    vendorPosPaperCode: { type: String, required: true, trim: true },
    vendorPosGsm: { type: Number, required: true },
    posMtrsDel: { type: Number, default: 0 },
    posRatePerRoll: { type: Number, required: true },
    posSaleCost: { type: Number, required: true },
    posMinQty: { type: Number, required: true },
    posOdrQty: { type: Number, required: true },
    posOdrFreq: { type: String, trim: true },
    posCreditTerm: { type: String, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true },
);

vendorPosRollBindingSchema.index(
  {
    vendorUserId: 1,
    posRollId: 1,
    vendorPosPaperCode: 1,
    vendorPosGsm: 1,
    posRatePerRoll: 1,
    posSaleCost: 1,
    posMinQty: 1,
    posOdrQty: 1,
    posOdrFreq: 1,
    posCreditTerm: 1,
    posMtrsDel: 1,
  },
  { unique: true },
);

const VendorPosRollBinding = mongoose.model("VendorPosRollBinding", vendorPosRollBindingSchema);
export default VendorPosRollBinding;
