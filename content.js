// content.js — runs on every page load (top frame only).
// The CSS itself is injected by background.js with tabs.insertCSS, so it
// never appears in the page's DOM. This script only tells the background
// a page loaded and shows the "Custom CSS applied." notice.
(function () {
  const domain       = location.hostname;
  const DISABLED_KEY = "__css_injector_disabled__";
  const PREFS_KEY    = "__css_injector_prefs__";

  // ── "Custom CSS applied." notice ──────────────────────────
  // Rendered inside a closed shadow root so neither the page nor
  // the user's custom CSS can restyle or read it. It carries no id or
  // class, and only exists while visible, to keep its footprint minimal.
  let host = null;
  let box  = null;

  function showNotice() {
    if (!host) {
      host = document.createElement("div");
      host.style.setProperty("all", "initial", "important");
      host.style.setProperty("position", "fixed", "important");
      host.style.setProperty("top", "12px", "important");
      host.style.setProperty("right", "12px", "important");
      host.style.setProperty("z-index", "2147483647", "important");
      host.style.setProperty("display", "block", "important");

      const root = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = `
        .box {
          display: flex;
          align-items: center;
          gap: 8px;
          font: 600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
          color: #fff;
          background: linear-gradient(135deg, #7b6cff, #00b89a);
          padding: 6px 6px 6px 14px;
          border-radius: 20px;
          box-shadow: 0 4px 14px rgba(0,0,0,.25);
          opacity: 0;
          transform: translateY(-8px);
          transition: opacity .25s, transform .25s;
          user-select: none;
        }
        .box.show { opacity: 1; transform: translateY(0); }
        .close {
          all: unset;
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          background: rgba(255,255,255,.2);
        }
        .close:hover { background: rgba(255,255,255,.35); }
        .close:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
      `;
      box = document.createElement("div");
      box.className = "box";
      box.setAttribute("role", "status");

      const label = document.createElement("span");
      label.textContent = "Custom CSS applied.";

      const close = document.createElement("button");
      close.className = "close";
      close.type = "button";
      close.textContent = "×";
      close.title = "Dismiss";
      close.setAttribute("aria-label", "Dismiss notice");
      close.addEventListener("click", hideNotice);

      box.append(label, close);
      root.append(style, box);
    }

    if (!host.isConnected) document.documentElement.appendChild(host);
    requestAnimationFrame(() => box.classList.add("show"));
  }

  function hideNotice() {
    if (!host || !host.isConnected) return;
    const el = host;
    box.classList.remove("show");
    setTimeout(() => { if (!box.classList.contains("show")) el.remove(); }, 300);
  }

  function whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  // The background decides: CSS applied AND in-page notice enabled.
  function updateNotice(result) {
    if (result && result.showNotice) whenReady(showNotice);
    else hideNotice();
  }

  // Ask the background to inject the saved CSS as early as possible
  // (document_start) to avoid a flash of unstyled content.
  browser.runtime.sendMessage({ type: "PAGE_LOADED" }).then(updateNotice, () => {});

  // ── React to saves / toggles from popup or settings ───────
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const own = (obj) => !!obj && Object.hasOwn(obj, domain);
    const flag = changes[DISABLED_KEY];
    const toggledHere = !!flag && own(flag.oldValue) !== own(flag.newValue);

    if (Object.hasOwn(changes, domain) || toggledHere || Object.hasOwn(changes, PREFS_KEY)) {
      browser.runtime.sendMessage({ type: "REFRESH" }).then(updateNotice, () => {});
    }
  });
})();
