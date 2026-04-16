import mongoose from "mongoose";

const vendorTafetaBindingSchema = new mongoose.Schema(
  {
    vendorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorUser",
      required: true,
      index: true,
    },
    tafetaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tafeta",
      required: true,
      index: true,
    },
    vendorTafetaMaterialCode: { type: String, required: true, trim: true },
    vendorTafetaGsm: { type: String, required: true, trim: true },
    tafetaMtrsDel: { type: String, required: true, trim: true },
    tafetaRatePerRoll: { type: Number, required: true, min: 0 },
    tafetaSaleCost: { type: Number, required: true, min: 0 },
    tafetaMinQty: { type: Number, required: true, min: 1 },
    tafetaOdrQty: { type: Number, required: true, min: 1 },
    tafetaOdrFreq: { type: String, required: true, trim: true },
    tafetaCreditTerm: { type: String, required: true, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true },
);

vendorTafetaBindingSchema.index({ vendorUserId: 1, tafetaId: 1 }, { unique: true });

const VendorTafetaBinding = mongoose.model("VendorTafetaBinding", vendorTafetaBindingSchema);
export default VendorTafetaBinding;
