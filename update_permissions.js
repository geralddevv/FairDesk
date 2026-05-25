import mongoose from "mongoose";
import Employee from "./models/hr/employee_model.js";
import { configDotenv } from "dotenv";

configDotenv();

async function updateExistingPermissions() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/fairdesk");
    
    console.log("Updating all employees to have full Read, Write, and Delete access...");
    
    const result = await Employee.updateMany(
      {}, 
      { 
        $set: { 
          canRead: true, 
          canWrite: true, 
          canDelete: true 
        } 
      }
    );

    console.log(`Successfully updated ${result.modifiedCount} employees.`);
    
  } catch (err) {
    console.error("Error during update:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database.");
  }
}

updateExistingPermissions();
