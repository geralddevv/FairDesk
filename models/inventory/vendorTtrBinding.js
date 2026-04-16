import mongoose from "mongoose";

const vendorTtrBindingSchema = new mongoose.Schema(
  {
    vendorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorUser",
      required: true,
      index: true,
    },
    ttrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ttr",
      required: true,
      index: true,
    },

    vendorTtrMaterialCode: {
      type: String,
      required: true,
      trim: true,
    },
    vendorTtrType: {
      type: String,
      required: true,
      trim: true,
    },
    ttrMtrsDel: {
      type: String,
      required: true,
      trim: true,
    },

    ttrRatePerRoll: {
      type: Number,
      required: true,
      min: 0,
    },
    ttrSaleCost: {
      type: Number,
      required: true,
      min: 0,
    },
    ttrMinQty: {
      type: Number,
      required: true,
      min: 1,
    },
    ttrOdrQty: {
      type: Number,
      required: true,
      min: 1,
    },
    ttrOdrFreq: {
      type: String,
      required: true,
      trim: true,
    },
    ttrCreditTerm: {
      type: String,
      required: true,
      trim: true,
    },

    vendorTapePaperCode: {
      type: String,
      required: true,
      trim: true,
    },
    vendorTapeGsm: {
      type: Number,
      required: true,
      min: 0,
    },
    tapeMtrsDel: {
      type: Number,
      required: true,
      min: 0,
    },
    tapeRatePerRoll: {
      type: Number,
      required: true,
      min: 0,
    },
    tapeSaleCost: {
      type: Number,
      required: true,
      min: 0,
    },
    tapeMinQty: {
      type: Number,
      required: true,
      min: 1,
    },
    tapeOdrQty: {
      type: Number,
      required: true,
      min: 1,
    },
    tapeOdrFreq: {
      type: String,
      required: true,
      trim: true,
    },
    tapeCreditTerm: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  },
);

vendorTtrBindingSchema.index({ vendorUserId: 1, ttrId: 1 }, { unique: true });

const VendorTtrBinding = mongoose.model("VendorTtrBinding", vendorTtrBindingSchema);

export default VendorTtrBinding;
