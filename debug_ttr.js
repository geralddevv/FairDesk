import mongoose from "mongoose";
import VendorTtrBinding from "./models/inventory/vendorTtrBinding.js";
import Ttr from "./models/inventory/ttr.js";

async function check() {
  await mongoose.connect("mongodb://localhost:27017/fairdesk");
  const bindingId = "6a1823d5051094e08ffca304";
  const binding = await VendorTtrBinding.findById(bindingId).lean();
  console.log("Binding:", binding);
  if (binding && binding.ttrId) {
    const ttr = await Ttr.findById(binding.ttrId).lean();
    console.log("Master TTR:", ttr);
  }
  await mongoose.disconnect();
}

check();
