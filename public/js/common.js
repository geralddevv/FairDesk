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

document.querySelectorAll("input[type='text']").forEach((input) => {
  input.addEventListener("input", function () {
    const start = this.selectionStart;
    const end = this.selectionEnd;
    const uppercased = this.value.toUpperCase();
    if (this.value !== uppercased) {
      this.value = uppercased;
      this.setSelectionRange(start, end);
    }
  });
});

// ================= CUSTOM NAV HISTORY =================

(function () {
  const backBtn = document.getElementById("fdNavBack");
  const forwardBtn = document.getElementById("fdNavForward");
  if (!backBtn || !forwardBtn) return;

  const STACK_KEY = "fd_navStack";
  const FORWARD_KEY = "fd_navForwardStack";
  const LAST_KEY = "fd_navLast";
  const ACTION_KEY = "fd_navAction";

  const getLocationKey = () => window.location.pathname + window.location.search;

  const readStack = (key) => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  };

  const writeStack = (key, arr) => {
    sessionStorage.setItem(key, JSON.stringify(arr));
  };

  const updateButtons = (backStack, forwardStack) => {
    const backDisabled = backStack.length === 0;
    const forwardDisabled = forwardStack.length === 0;

    backBtn.classList.toggle("disabled", backDisabled);
    forwardBtn.classList.toggle("disabled", forwardDisabled);
    backBtn.disabled = backDisabled;
    forwardBtn.disabled = forwardDisabled;
  };

  const current = getLocationKey();
  let backStack = readStack(STACK_KEY);
  let forwardStack = readStack(FORWARD_KEY);

  const last = sessionStorage.getItem(LAST_KEY);
  const actionRaw = sessionStorage.getItem(ACTION_KEY);
  let action = null;
  try {
    action = actionRaw ? JSON.parse(actionRaw) : null;
  } catch (err) {
    action = null;
  }

  if (action && action.target === current) {
    sessionStorage.removeItem(ACTION_KEY);
  } else if (last && last !== current) {
    if (!backStack.length || backStack[backStack.length - 1] !== last) {
      backStack.push(last);
    }
    forwardStack = [];
  } else if (!last) {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin) {
        const refKey = ref.pathname + ref.search;
        if (refKey && refKey !== current) {
          backStack.push(refKey);
        }
      }
    } catch (err) {
      // ignore invalid referrer
    }
  }

  sessionStorage.setItem(LAST_KEY, current);
  writeStack(STACK_KEY, backStack);
  writeStack(FORWARD_KEY, forwardStack);
  updateButtons(backStack, forwardStack);

  backBtn.addEventListener("click", () => {
    if (!backStack.length) return;
    const target = backStack.pop();
    forwardStack.push(current);
    writeStack(STACK_KEY, backStack);
    writeStack(FORWARD_KEY, forwardStack);
    sessionStorage.setItem(ACTION_KEY, JSON.stringify({ target }));
    window.location.href = target;
  });

  forwardBtn.addEventListener("click", () => {
    if (!forwardStack.length) return;
    const target = forwardStack.pop();
    backStack.push(current);
    writeStack(STACK_KEY, backStack);
    writeStack(FORWARD_KEY, forwardStack);
    sessionStorage.setItem(ACTION_KEY, JSON.stringify({ target }));
    window.location.href = target;
  });
})();
