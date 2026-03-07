import express from "express";
import Client from "../../models/users/client.js";

const router = express.Router();

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
      },
    );

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
    await Client.findByIdAndUpdate(req.params.id, req.body, {
      runValidators: true,
    });

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
