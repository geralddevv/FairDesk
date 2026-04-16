import mongoose from "mongoose";

const vendorTapeBindingSchema = new mongoose.Schema(
  {
    vendorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorUser",
      required: true,
      index: true,
    },
    tapeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tape",
      required: true,
      index: true,
    },
    vendorTapePaperCode: { type: String, required: true, trim: true },
    vendorTapeGsm: { type: Number, required: true },
    tapeMtrsDel: { type: Number, default: 0 },
    tapeRatePerRoll: { type: Number, required: true },
    tapeSaleCost: { type: Number, required: true },
    tapeMinQty: { type: Number, required: true },
    tapeOdrQty: { type: Number, required: true },
    tapeOdrFreq: { type: String, trim: true },
    tapeCreditTerm: { type: String, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true },
);

vendorTapeBindingSchema.index(
  {
    vendorUserId: 1,
    tapeId: 1,
    vendorTapePaperCode: 1,
    vendorTapeGsm: 1,
    tapeRatePerRoll: 1,
    tapeSaleCost: 1,
    tapeMinQty: 1,
    tapeOdrQty: 1,
    tapeOdrFreq: 1,
    tapeCreditTerm: 1,
    tapeMtrsDel: 1,
  },
  { unique: true },
);

const VendorTapeBinding = mongoose.model("VendorTapeBinding", vendorTapeBindingSchema);
export default VendorTapeBinding;
