import fs from "fs";
import mongoose from "mongoose";

mongoose
  .connect("mongodb://127.0.0.1:27017/fairdesk")
  .then(async () => {
    const db = mongoose.connection.db;

    const posRolls = await db.collection("posrolls").find({}).limit(5).toArray();
    const tafetas = await db.collection("tafetas").find({}).limit(5).toArray();
    const tapes = await db.collection("tapes").find({}).limit(5).toArray();
    const ttrs = await db.collection("ttrs").find({}).limit(5).toArray();

    fs.writeFileSync("db_dump.json", JSON.stringify({ posRolls, tafetas, tapes, ttrs }, null, 2));
    console.log("Dumped to db_dump.json");
    process.exit();
  })
  .catch(console.error);
