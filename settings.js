// settings.js
(function () {
  const list        = document.getElementById("domain-list");
  const badge       = document.getElementById("count-badge");
  const btnClearAll = document.getElementById("btn-clear-all");
  const toast       = document.getElementById("toast");

  const DISABLED_KEY = "__css_injector_disabled__";
  const PREFS_KEY    = "__css_injector_prefs__";

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = isError ? "error show" : "show";
    setTimeout(() => { toast.className = ""; }, 2200);
  }

  // ── Safe element builder ──────────────────────────────────
  function el(tag, attrs = {}, text = null) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") node.className = v;
      else if (k === "title") node.title = v;
      else node.setAttribute(k, v);
    }
    if (text !== null) node.textContent = text;
    return node;
  }

  // ── Render all domains ────────────────────────────────────
  function render(data) {
    list.innerHTML = "";
    const disabled = data[DISABLED_KEY] || {};
    const isOff    = (domain) => Object.hasOwn(disabled, domain);
    const domains  = Object.keys(data).filter(k => k !== DISABLED_KEY && typeof data[k] === "string" && data[k]);

    badge.textContent = `${domains.length} domain${domains.length !== 1 ? "s" : ""}`;

    if (domains.length === 0) {
      const empty = el("div", { className: "empty" });
      empty.appendChild(el("div", { className: "empty-icon" }, "🎨"));
      empty.appendChild(el("p", {}, "No styles saved yet. Open the extension popup on any website to get started."));
      list.appendChild(empty);
      return;
    }

    domains.sort().forEach(domain => {
      const css   = data[domain];
      const lines = css.split("\n").length;
      const chars = css.length;

      // Card
      const card = el("div", { className: "domain-card" });
      card.dataset.domain = domain;

      // Card header
      const header = el("div", { className: "card-header" });

      const domainInfo = el("div", { className: "domain-info" });
      domainInfo.appendChild(el("span", {
        className: isOff(domain) ? "domain-dot off" : "domain-dot",
        title: isOff(domain) ? "Disabled" : "Enabled"
      }));
      domainInfo.appendChild(el("span", { className: "domain-name", title: domain }, domain));

      const meta = el("span", { className: "card-meta" },
        `${lines} line${lines !== 1 ? "s" : ""} · ${chars} chars`);

      const actions = el("div", { className: "card-actions" });
      const btnDelete = el("button", { className: "btn-icon btn-delete", title: "Delete styles for this domain" }, "✕ Delete");
      const btnSave   = el("button", { className: "btn-icon btn-save-card", title: "Save edits" }, "💾 Save");
      actions.appendChild(btnDelete);
      actions.appendChild(btnSave);

      const chevron = el("span", { className: "chevron" }, "▼");

      header.appendChild(domainInfo);
      header.appendChild(meta);
      header.appendChild(actions);
      header.appendChild(chevron);

      // Card body
      const body     = el("div", { className: "card-body" });
      const textarea = el("textarea", { spellcheck: "false", autocomplete: "off" }, css);
      body.appendChild(textarea);

      card.appendChild(header);
      card.appendChild(body);

      // Toggle expand/collapse
      header.addEventListener("click", (e) => {
        if (e.target.closest(".card-actions")) return;
        body.classList.toggle("open");
        chevron.classList.toggle("open");
      });

      // Save edits
      btnSave.addEventListener("click", (e) => {
        e.stopPropagation();
        const newCss = textarea.value.trim();
        browser.storage.local.set({ [domain]: newCss }).then(() => {
          showToast(`✓ Saved styles for ${domain}`);
          const updatedLines = newCss.split("\n").length;
          meta.textContent = `${updatedLines} line${updatedLines !== 1 ? "s" : ""} · ${newCss.length} chars`;
        });
      });

      // Delete domain
      btnDelete.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Delete all styles for "${domain}"?`)) return;
        browser.storage.local.remove(domain).then(() => {
          card.remove();
          const remaining = list.querySelectorAll(".domain-card").length;
          badge.textContent = `${remaining} domain${remaining !== 1 ? "s" : ""}`;
          if (remaining === 0) render({});
          showToast(`Deleted styles for ${domain}`);
        });
      });

      list.appendChild(card);
    });
  }

  // ── Clear all ─────────────────────────────────────────────
  btnClearAll.addEventListener("click", () => {
    if (!confirm("Delete ALL saved styles for every domain? This cannot be undone.")) return;
    // Keep preferences: "Clear All" only deletes styles.
    browser.storage.local.get(PREFS_KEY).then((result) => {
      return browser.storage.local.clear().then(() =>
        result[PREFS_KEY] ? browser.storage.local.set({ [PREFS_KEY]: result[PREFS_KEY] }) : null);
    }).then(() => {
      render({});
      showToast("All styles cleared");
    });
  });

  // ── Load all saved data on open ───────────────────────────
  browser.storage.local.get(null).then(render);
})();
