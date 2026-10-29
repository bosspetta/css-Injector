// popup.js
(function () {
  const input      = document.getElementById("css-input");
  const btnSave    = document.getElementById("btn-save");
  const btnClear   = document.getElementById("btn-clear");
  const domainEl   = document.getElementById("domain-display");
  const statusDot  = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const charCount  = document.getElementById("char-count");
  const toast      = document.getElementById("toast");
  const toggle     = document.getElementById("toggle-enabled");
  const toggleLbl  = document.getElementById("toggle-label");
  const extWarning = document.getElementById("external-warning");
  const noticeTgl  = document.getElementById("toggle-notice");

  const DISABLED_KEY = "__css_injector_disabled__";
  const PREFS_KEY    = "__css_injector_prefs__";

  let domain = "";
  let tabId = null;
  let previewTimer = null;

  const own = (obj, key) => !!obj && Object.hasOwn(obj, key);

  // CSS can make network requests (url(), @import, image-set()). Combined
  // with attribute selectors that can leak page data to a remote server,
  // so warn when pasted CSS loads anything that isn't a data: URI.
  const EXTERNAL_RE = /@import|url\((?!\s*['"]?\s*data:)|image-set\(/i;

  function checkExternal(css) {
    extWarning.hidden = !EXTERNAL_RE.test(css);
  }

  // ── Toast helper ──────────────────────────────────────────
  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = isError ? "error show" : "show";
    setTimeout(() => { toast.className = ""; }, 2000);
  }

  // ── Status helper ─────────────────────────────────────────
  function setStatus(state, text) {
    statusDot.className = `status-dot ${state}`;
    statusText.textContent = text;
  }

  // ── Enable switch helper ──────────────────────────────────
  function setToggle(on) {
    toggle.checked = on;
    toggle.setAttribute("aria-checked", String(on));
    toggleLbl.textContent = on ? "Styles enabled on this site" : "Styles disabled on this site";
  }

  // ── In-page notice preference (global, off by default) ────
  function setNoticeToggle(on) {
    noticeTgl.checked = on;
    noticeTgl.setAttribute("aria-checked", String(on));
  }

  browser.storage.local.get(PREFS_KEY).then((result) => {
    const prefs = result[PREFS_KEY];
    setNoticeToggle(own(prefs, "pageNotice") && prefs.pageNotice === true);
  });

  noticeTgl.addEventListener("change", () => {
    const on = noticeTgl.checked;
    setNoticeToggle(on);
    browser.storage.local.get(PREFS_KEY).then((result) => {
      const prefs = { ...(result[PREFS_KEY] || {}), pageNotice: on };
      return browser.storage.local.set({ [PREFS_KEY]: prefs });
    }).then(() => {
      showToast(on ? "On-page notice enabled" : "On-page notice disabled");
    }).catch(() => {
      setNoticeToggle(!on);
      showToast("Error saving", true);
    });
  });

  // ── Settings button ───────────────────────────────────────
  document.getElementById("btn-settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });

  // ── Get active tab domain ─────────────────────────────────
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;
    tabId = tab.id;

    try {
      domain = new URL(tab.url).hostname;
    } catch (_) {
      domain = "";
    }

    domainEl.textContent = domain || "unknown";

    if (!domain) {
      setStatus("error", "cannot inject here");
      input.disabled = true;
      btnSave.disabled = true;
      toggle.disabled = true;
      return;
    }

    // Load saved CSS for this domain
    browser.storage.local.get([domain, DISABLED_KEY]).then((result) => {
      const saved = own(result, domain) && typeof result[domain] === "string" ? result[domain] : "";
      const on    = !own(result[DISABLED_KEY], domain);
      input.value = saved;
      checkExternal(saved);
      charCount.textContent = `${saved.length} chars`;
      setToggle(on);
      if (!saved) {
        setStatus("", "no styles saved");
      } else if (on) {
        setStatus("saved", "styles loaded");
      } else {
        setStatus("", "styles saved but disabled");
      }
    });
  });

  // ── Enable / disable styles for this domain ───────────────
  // The content script listens to storage changes and asks the background
  // to re-apply, so persisting the flag is enough to update the page.
  toggle.addEventListener("change", () => {
    if (!domain) return;
    const on = toggle.checked;
    setToggle(on);

    browser.storage.local.get(DISABLED_KEY).then((result) => {
      const disabled = { ...(result[DISABLED_KEY] || {}) };
      if (on) delete disabled[domain];
      else disabled[domain] = true;
      return browser.storage.local.set({ [DISABLED_KEY]: disabled });
    }).then(() => {
      setStatus(on ? "saved" : "", on ? "styles enabled" : "styles disabled");
      showToast(on ? "Styles enabled for " + domain : "Styles disabled for " + domain);
    }).catch(() => {
      setToggle(!on);
      showToast("Error saving", true);
    });
  });

  // ── Live preview while typing (debounced 400ms) ───────────
  input.addEventListener("input", () => {
    charCount.textContent = `${input.value.length} chars`;
    setStatus("active", "unsaved changes…");
    checkExternal(input.value);

    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      sendPreview(input.value);
    }, 400);
  });

  // ── Tab key inserts 2 spaces ──────────────────────────────
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = input.selectionStart;
      const end   = input.selectionEnd;
      input.value = input.value.slice(0, start) + "  " + input.value.slice(end);
      input.selectionStart = input.selectionEnd = start + 2;
    }
  });

  // ── Save ──────────────────────────────────────────────────
  btnSave.addEventListener("click", () => {
    if (!domain) return;
    const css = input.value.trim();

    browser.storage.local.set({ [domain]: css }).then(() => {
      sendPreview(css);
      setStatus("saved", toggle.checked ? "saved & applied ✓" : "saved (disabled)");
      showToast("✓ Saved for " + domain);
    }).catch(() => {
      showToast("Error saving", true);
    });
  });

  // ── Clear ─────────────────────────────────────────────────
  btnClear.addEventListener("click", () => {
    if (!domain) return;
    input.value = "";
    charCount.textContent = "0 chars";
    checkExternal("");
    sendPreview("");

    browser.storage.local.remove(domain).then(() => {
      setStatus("", "no styles saved");
      showToast("Cleared styles for " + domain);
    });
  });

  // ── Live preview via background (tabs.insertCSS) ──────────
  function sendPreview(css) {
    if (tabId === null) return;
    browser.runtime.sendMessage({ type: "PREVIEW_CSS", tabId, css }).catch(() => {
      // Restricted pages (about:, AMO…) can't be styled — ignore
    });
  }
})();
