// ================= SIDEBAR TOGGLE WITH PERSISTENCE =================

const navToggle = document.querySelector(".nav-toggle");
const sideNav = document.querySelector(".side-nav");

// Storage key
const STORAGE_KEY_NAV = "fd_navExpanded";

// Sync toggle button state (sidebar class is already set by inline script in HTML)
if (localStorage.getItem(STORAGE_KEY_NAV) === "collapsed") {
  navToggle.classList.add("active");
}

navToggle.addEventListener("click", () => {
  navToggle.classList.toggle("active");
  sideNav.classList.toggle("nav-panel-toggle");

  // Persist state
  const isExpanded = sideNav.classList.contains("nav-panel-toggle");
  localStorage.setItem(STORAGE_KEY_NAV, isExpanded ? "expanded" : "collapsed");
});

// ================= GENERIC NAV GROUP TOGGLE =================

function toggleNavGroup(wrapper) {
  const menu = wrapper.querySelector(".nav-labels-opt");
  if (!menu) return;

  const isOpen = menu.style.height && menu.style.height !== "0px";

  if (isOpen) {
    menu.style.height = "0px";
  } else {
    menu.style.height = menu.scrollHeight + "px";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-opt-wrap").forEach((wrapper) => {
    const menu = wrapper.querySelector(".nav-labels-opt");
    if (!menu) return;

    // Disable animation for initial open
    menu.classList.add("no-transition");

    if (menu.querySelector(".nav-items.active")) {
      menu.style.height = menu.scrollHeight + "px";
    }

    // Re-enable animation AFTER paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        menu.classList.remove("no-transition");
      });
    });
  });
});

// Attach toggle to ALL nav groups
document.querySelectorAll(".nav-opt-wrap").forEach((wrapper) => {
  const toggle = wrapper.querySelector(":scope > .nav-items");
  if (!toggle) return;

  toggle.addEventListener("click", (e) => {
    if (e.target.closest(".nav-labels-opt")) return;
    e.stopPropagation();
    toggleNavGroup(wrapper);
  });
});

// Prevent option clicks from closing the dropdown
document.querySelectorAll(".nav-opt-wrap .nav-labels-opt").forEach((menu) => {
  menu.addEventListener("click", (e) => {
    e.stopPropagation();
  });
});

// ================= INPUT UPPERCASE =================

document.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", function () {
    this.value = this.value.toUpperCase();
  });
});
