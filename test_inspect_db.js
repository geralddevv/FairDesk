import mongoose from "mongoose";
mongoose
  .connect("mongodb://127.0.0.1:27017/fairdesk")
  .then(async () => {
    const db = mongoose.connection.db;

    const posRolls = await db.collection("posrolls").find({}).limit(5).toArray();
    console.log(
      "PosRoll samples (raw):",
      posRolls.map((p) => ({
        posGsm: p.posGsm,
        type: typeof p.posGsm,
        posPaperCode: p.posPaperCode,
        typePC: typeof p.posPaperCode,
      })),
    );

    const tafetas = await db.collection("tafetas").find({}).limit(5).toArray();
    console.log(
      "\nTafeta samples (raw):",
      tafetas.map((t) => ({
        tafetaGsm: t.tafetaGsm,
        type: typeof t.tafetaGsm,
        tafetaWidth: t.tafetaWidth,
        typeW: typeof t.tafetaWidth,
      })),
    );

    const tapes = await db.collection("tapes").find({}).limit(5).toArray();
    console.log(
      "\nTape samples (raw):",
      tapes.map((t) => ({ tapeGsm: t.tapeGsm, type: typeof t.tapeGsm })),
    );

    const ttrs = await db.collection("ttrs").find({}).limit(5).toArray();
    console.log(
      "\nTtr samples (raw):",
      ttrs.map((t) => ({ ttrWidth: t.ttrWidth, type: typeof t.ttrWidth })),
    );

    process.exit();
  })
  .catch(console.error);
