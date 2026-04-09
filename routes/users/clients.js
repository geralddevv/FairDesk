import express from "express";
import Client from "../../models/users/client.js";

const router = express.Router();

router.use((req, res, next) => {
  const role = req.session?.authUser?.role;
  if (!role) return res.redirect("/login");

  if (role === "admin" || role === "hod") return next();

  if (role === "sales") {
    const path = req.path || "";
    if (req.method !== "GET") return res.redirect("/login");

    if (path === "/view" || path.startsWith("/api/") || path.startsWith("/profile/")) {
      return next();
    }
    return res.redirect("/login");
  }

  return res.redirect("/login");
});

/* ================= CLIENTS VIEW ================= */
router.get("/view", async (req, res) => {
  try {
    const clients = await Client.find(
      {},
      {
        clientId: 1,
        clientName: 1,
        clientType: 1,
        hoLocation: 1,
        accountHead: 1,
        clientGst: 1,
        clientPan: 1,
        clientMsme: 1,
        clientGumasta: 1,
        clientStatus: 1,
        users: 1,
      },
    ).sort({ clientName: 1 });

    res.render("users/clientsView.ejs", {
      title: "Client View",
      jsonData: clients,
      CSS: "tableDisp.css",
      JS: false,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error(err);
    req.flash("notification", "Failed to load Clients");
    res.redirect("back");
  }
});

/* ================= CLIENT POPUP DATA ================= */
router.get("/api/:id", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id, { __v: 0 });
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= EDIT CLIENT FORM ================= */
router.get("/edit/:id", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      req.flash("notification", "Client not found");
      return res.redirect("/fairdesk/client/view");
    }

    res.render("users/clientEditForm.ejs", {
      title: "Edit Client",
      client,
      JS: false,
      CSS: "tabOpt.css",
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error(err);
    req.flash("notification", "Failed to load client");
    res.redirect("/fairdesk/client/view");
  }
});

/* ================= UPDATE CLIENT ================= */
router.post("/edit/:id", async (req, res) => {
  try {
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const clientName = String(req.body.clientName || "").trim();
    const clientType = String(req.body.clientType || "").trim();
    const clientStatus = String(req.body.clientStatus || "").trim();
    const hoLocation = String(req.body.hoLocation || "").trim();
    const accountHead = String(req.body.accountHead || "").trim();
    const clientGst = String(req.body.clientGst || "").trim();
    const clientMsme = String(req.body.clientMsme || "").trim();
    const clientGumasta = String(req.body.clientGumasta || "").trim();
    const clientPan = String(req.body.clientPan || "").trim();

    // Block edit only when another client already has the same full entity.
    const duplicateClient = await Client.findOne({
      _id: { $ne: req.params.id },
      clientName: new RegExp(`^${escapeRegex(clientName)}$`, "i"),
      clientType: new RegExp(`^${escapeRegex(clientType)}$`, "i"),
      clientStatus: new RegExp(`^${escapeRegex(clientStatus)}$`, "i"),
      hoLocation: new RegExp(`^${escapeRegex(hoLocation)}$`, "i"),
      accountHead: new RegExp(`^${escapeRegex(accountHead)}$`, "i"),
      clientGst: new RegExp(`^${escapeRegex(clientGst)}$`, "i"),
      clientMsme: new RegExp(`^${escapeRegex(clientMsme)}$`, "i"),
      clientGumasta: new RegExp(`^${escapeRegex(clientGumasta)}$`, "i"),
      clientPan: new RegExp(`^${escapeRegex(clientPan)}$`, "i"),
    }).lean();

    if (duplicateClient) {
      return res.status(400).json({
        success: false,
        message: "client already exist (same full details)",
      });
    }

    await Client.findByIdAndUpdate(
      req.params.id,
      {
        clientName,
        clientType,
        clientStatus,
        hoLocation,
        accountHead,
        clientGst,
        clientMsme,
        clientGumasta,
        clientPan,
      },
      {
      runValidators: true,
      },
    );

    req.flash("notification", "Client updated successfully!");
    res.json({ success: true, redirect: "/fairdesk/client/view" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Failed to update client" });
  }
});

/* ================= CLIENT PROFILE (OPTIONAL) ================= */
router.get("/profile/:id", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      req.flash("notification", "Client not found");
      return res.redirect("/fairdesk/client/view");
    }

    res.render("users/clientProfile.ejs", {
      title: "Client Profile",
      client,
      CSS: false,
      JS: false,
      notification: req.flash("notification"),
    });
  } catch (err) {
    console.error(err);
    req.flash("notification", "Invalid client link");
    res.redirect("/fairdesk/client/view");
  }
});

export default router;
