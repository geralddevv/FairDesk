import mongoose from "mongoose";
import Username from "./models/users/username.js";

async function runTest() {
  await mongoose.connect("mongodb://127.0.0.1:27017/fairdesk");
  const user = await Username.findOne();
  if (!user) {
    console.log("No users found");
    return;
  }

  console.log("Initial transport name:", user.transportName);

  const updateData = {
    transportName: "Test Transport",
    SelfDispatch: "",
  };

  await Username.findByIdAndUpdate(user._id, updateData, { new: true, runValidators: true });

  const updated = await Username.findById(user._id);
  console.log("Updated transport name:", updated.transportName);

  process.exit(0);
}

runTest().catch(console.error);
