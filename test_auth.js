import mongoose from "mongoose";
import Employee from "./models/hr/employee_model.js";
import { configDotenv } from "dotenv";

configDotenv();

async function testDatabaseLogin() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/fairdesk");
    
    console.log("--- DATABASE AUTH TEST ---");
    const totalCount = await Employee.countDocuments();
    const activeCount = await Employee.countDocuments({ isActive: true });
    console.log(`Total Employees: ${totalCount}`);
    console.log(`Active Employees: ${activeCount}`);

    if (activeCount > 0) {
      const sample = await Employee.findOne({ isActive: true });
      console.log("\nSample Active Employee:");
      console.log(`Name: '${sample.empName}'`);
      console.log(`ID: '${sample.empId}'`);
      console.log(`Password: '${sample.password}'`);
      
      // Test the regex logic
      const testName = sample.empName;
      const regex = new RegExp(`^${testName}$`, "i");
      const match = await Employee.findOne({
        $or: [
          { empId: { $regex: regex } },
          { empName: { $regex: regex } }
        ],
        password: sample.password,
        isActive: true
      });
      console.log(`\nTest matching with name '${testName}': ${match ? "SUCCESS" : "FAILED"}`);
    } else {
      console.log("\nNo active employees found to test.");
    }

  } catch (err) {
    console.error("Test Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

testDatabaseLogin();
