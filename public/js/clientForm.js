(function () {
  // DOM Elements
  const dom = {
    hardwareBtn: document.querySelector(".hardware"),
    softwareBtn: document.querySelector(".software"),
    hardwareOpt: document.querySelector(".hardware-options"),
    softwareOpt: document.querySelector(".software-options"),
    clientSwitch: document.querySelector(".client-switch"),
    userSwitch: document.querySelector(".user-switch"),
    clientContent: document.querySelector(".client-content"),
    userContent: document.querySelector(".user-content"),
    transportContact: document.querySelector("#transport-contact"),
    ownerMobNo: document.querySelector("#owner-mob-no"),
    clientNameSelect: document.getElementById("userform-client-name"),
    userContactNo: document.querySelector("#user-contact-no"),
  };

  // Initialize Choices only once
  let choicesInstance = null;
  let isHandlingChange = false; // Guard against multiple triggers

  // Function to toggle disabled state based on visibility
  function updateInputDisabledState() {
    // Hardware options section
    const isHardwareVisible = window.getComputedStyle(dom.hardwareOpt).display !== "none";
    const hardwareInputs = dom.hardwareOpt.querySelectorAll("input, select");

    hardwareInputs.forEach((input) => {
      input.disabled = !isHardwareVisible;
      input.required = isHardwareVisible;
    });

    // Software options section
    const isSoftwareVisible = window.getComputedStyle(dom.softwareOpt).display !== "none";
    const softwareInputs = dom.softwareOpt.querySelectorAll("input, select");

    softwareInputs.forEach((input) => {
      input.disabled = !isSoftwareVisible;
      input.required = isSoftwareVisible;
    });
  }

  // Initialize the page
  function init() {
    if (!dom.hardwareBtn || !dom.softwareBtn) return;

    // Tab switching
    dom.hardwareBtn.addEventListener("click", () => toggleTabs("hardware"));
    dom.softwareBtn.addEventListener("click", () => toggleTabs("software"));

    // View switching
    if (dom.clientSwitch && dom.userSwitch) {
      dom.clientSwitch.addEventListener("click", () => toggleViews("client"));
      dom.userSwitch.addEventListener("click", () => toggleViews("user"));
    }

    // Format mobile inputs
    if (dom.transportContact) formatMobileInput(dom.transportContact);
    if (dom.ownerMobNo) formatMobileInput(dom.ownerMobNo);
    if (dom.userContactNo) formatMobileInput(dom.userContactNo);

    // Initialize Choices
    if (dom.clientNameSelect) {
      initChoicesSelect();
    }

    // Set up MutationObserver to watch for display changes
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.attributeName === "style") {
          updateInputDisabledState();
        }
      });
    });

    // Observe both sections for style changes
    observer.observe(dom.hardwareOpt, { attributes: true });
    observer.observe(dom.softwareOpt, { attributes: true });

    // Initial state update
    updateInputDisabledState();

    // Handle URL query parameter for tab switching
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam === "user" && dom.userSwitch) {
      toggleViews("user");
    } else if (tabParam === "client" && dom.clientSwitch) {
      toggleViews("client");
    }
  }

  function toggleTabs(activeTab) {
    const isHardware = activeTab === "hardware";
    dom.hardwareBtn.classList.toggle("active", isHardware);
    dom.softwareBtn.classList.toggle("active", !isHardware);
    dom.hardwareOpt.style.display = isHardware ? "grid" : "none";
    dom.softwareOpt.style.display = isHardware ? "none" : "grid";

    // Update disabled states after visibility changes
    updateInputDisabledState();
  }

  function toggleViews(activeView) {
    const isClient = activeView === "client";
    dom.clientSwitch.classList.toggle("active", isClient);
    dom.userSwitch.classList.toggle("active", !isClient);
    dom.clientContent.style.display = isClient ? "grid" : "none";
    dom.userContent.style.display = isClient ? "none" : "grid";

    if (!isClient) {
      dom.userContent.style.gridTemplateColumns = "repeat(32, 1fr)";
      dom.userContent.style.gap = "1.25rem";
    }
  }

  function formatMobileInput(input) {
    input.addEventListener("keydown", (e) => {
      const allowedKeys = ["Backspace", "ArrowLeft", "ArrowRight", "Tab", "Delete"];

      // Allow Ctrl+V / Cmd+V
      if ((e.ctrlKey || e.metaKey) && ["v", "V", "c", "C", "x", "X", "a", "A"].includes(e.key)) {
        return; // allow paste, copy, cut, select all
      }

      if (!/^\d$/.test(e.key) && !allowedKeys.includes(e.key)) {
        e.preventDefault();
      }
    });

    input.addEventListener("input", function () {
      let digits = this.value.replace(/\D/g, "").slice(0, 10);
      this.value = digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
    });
  }

  function initChoicesSelect() {
    try {
      choicesInstance = new Choices(dom.clientNameSelect, {
        searchEnabled: true,
        itemSelectText: "",
        shouldSort: false,
        callbackOnInit: function () {
          // Add ONE event listener after initialization
          this.passedElement.element.addEventListener("change", (e) => {
            if (isHandlingChange) return;
            isHandlingChange = true;

            setTimeout(() => {
              isHandlingChange = false;
            }, 100);

            handleClientChange(e.target.value);
          });
        },
      });
    } catch (e) {
      console.error("Choices initialization failed:", e);
      // Fallback to native select
      dom.clientNameSelect.addEventListener("change", (e) => {
        handleClientChange(e.target.value);
      });
    }
  }

  function handleClientChange(clientName) {
    if (!clientName) return;

    console.log("Client changed (triggered once):", clientName);

    fetch(`/fairdesk/form/client/${encodeURIComponent(clientName)}`)
      .then((response) => response.json())
      .then((data) => {
        console.log("Response:", data);
        feedClientData(data);
      })
      .catch((error) => console.error("Error:", error));
  }

  // Start when DOM is ready
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();

function feedClientData(data) {
  console.log(data._id);
  document.getElementById("user-client-id").value = data.clientId;
  document.getElementById("username-client-type").value = data.clientType;
  document.getElementById("username-ho-location").value = data.hoLocation;
  document.getElementById("username-account-head").value = data.accountHead;
  document.getElementById("object-id").value = data._id;
}
