// background.js — injects the custom CSS with tabs.insertCSS.
// Sheets added this way live outside the page's DOM, so the site's own
// scripts can neither read the user's CSS nor detect it via a <style> tag.
(function () {
  const DISABLED_KEY = "__css_injector_disabled__";
  const PREFS_KEY    = "__css_injector_prefs__";

  // tabId → CSS currently inserted in that tab's top frame.
  // removeCSS needs the exact same code that was inserted.
  const inserted = new Map();

  const own = (obj, key) => !!obj && Object.hasOwn(obj, key);

  function hostnameOf(url) {
    try { return new URL(url).hostname; } catch (_) { return ""; }
  }

  // Returns { css, enabled } for a hostname.
  function getState(domain) {
    return browser.storage.local.get([domain, DISABLED_KEY]).then((result) => ({
      css:     own(result, domain) && typeof result[domain] === "string" ? result[domain] : "",
      enabled: !own(result[DISABLED_KEY], domain),
    }));
  }

  // Whether to show the in-page notice (default: no). When off, the
  // toolbar badge is the only indicator and nothing is added to the page.
  function pageNoticeEnabled() {
    return browser.storage.local.get(PREFS_KEY).then((result) => {
      const prefs = result[PREFS_KEY];
      return own(prefs, "pageNotice") && prefs.pageNotice === true;
    });
  }

  // Toolbar badge: lives in Firefox's UI, invisible to the page.
  // Tab-specific badges are reset by Firefox when the tab navigates.
  function updateBadge(tabId) {
    const on = inserted.has(tabId);
    browser.browserAction.setBadgeText({ tabId, text: on ? "ON" : "" }).catch(() => {});
    browser.browserAction.setTitle({
      tabId,
      title: on ? "CSS Injector — Custom CSS applied" : "CSS Injector",
    }).catch(() => {});
  }

  // Replace whatever we inserted in the tab with `css` ("" removes it).
  async function setTabCSS(tabId, css) {
    const prev = inserted.get(tabId) || "";
    if (prev === css) return;

    if (prev) {
      await browser.tabs.removeCSS(tabId, { code: prev, frameId: 0 }).catch(() => {});
      inserted.delete(tabId);
    }
    if (css) {
      await browser.tabs.insertCSS(tabId, { code: css, frameId: 0, runAt: "document_start" });
      inserted.set(tabId, css);
    }
  }

  // Apply the saved state for the page currently loaded in a tab.
  // Tells content.js whether to show the in-page notice.
  async function applySaved(tabId, url) {
    const domain = hostnameOf(url);
    if (!domain) return { showNotice: false };
    const { css, enabled } = await getState(domain);
    await setTabCSS(tabId, enabled ? css : "");
    updateBadge(tabId);
    const applied = !!(enabled && css);
    return { showNotice: applied && await pageNoticeEnabled() };
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    // Only trust messages coming from this extension.
    if (sender.id !== browser.runtime.id) return;

    switch (message.type) {
      // From content.js: a new document started loading in this tab.
      case "PAGE_LOADED":
        if (!sender.tab || sender.frameId !== 0) return;
        // The previous document (and its sheet) is gone.
        inserted.delete(sender.tab.id);
        return applySaved(sender.tab.id, sender.url);

      // From content.js: saved CSS or on/off state changed for its domain.
      case "REFRESH":
        if (!sender.tab || sender.frameId !== 0) return;
        return applySaved(sender.tab.id, sender.url);

      // From popup.js: live preview of unsaved CSS.
      case "PREVIEW_CSS":
        return browser.tabs.get(message.tabId).then(async (tab) => {
          const { enabled } = await getState(hostnameOf(tab.url));
          if (enabled) {
            await setTabCSS(tab.id, message.css || "");
            updateBadge(tab.id);
          }
        });
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => inserted.delete(tabId));

  browser.browserAction.setBadgeBackgroundColor({ color: "#7b6cff" });
  browser.browserAction.setBadgeTextColor({ color: "#ffffff" });
})();
