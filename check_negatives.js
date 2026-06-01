import mongoose from "mongoose";

async function checkNegatives() {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/fairdesk");
    const db = mongoose.connection.db;
    
    console.log("--- Checking Negative Stocks ---");
    const stockModels = ['tapestocks', 'posrollstocks', 'tafetastocks', 'ttrstocks'];
    for (const model of stockModels) {
        const negativeStocks = await db.collection(model).find({ quantity: { $lt: 0 } }).toArray();
        if (negativeStocks.length > 0) {
            console.log(`Negative stocks in ${model}:`, negativeStocks.length);
            negativeStocks.slice(0, 3).forEach(s => console.log(JSON.stringify(s)));
        } else {
            console.log(`No negative stocks in ${model}`);
        }
    }

    console.log("\n--- Checking Over-dispatched Sales Orders ---");
    const salesOrders = await db.collection('tapesalesorders').find({ 
        $expr: { $gt: ["$dispatchedQuantity", "$quantity"] } 
    }).toArray();
    if (salesOrders.length > 0) {
        console.log(`Over-dispatched sales orders:`, salesOrders.length);
        salesOrders.slice(0, 3).forEach(o => console.log(JSON.stringify(o)));
    } else {
        console.log("No over-dispatched sales orders");
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

checkNegatives();
