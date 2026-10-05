/*
 * FLOW screen agent. Injected into every screen document by the shell.
 * Responsibilities: honour data-flow-state, forward data-flow-transition clicks, and provide the element picker.
 * Generated screens style states with html[data-flow-state="..."] selectors and mark addressable regions with data-flow-el.
 */
(function () {
  if (window.__flowAgent) return;
  window.__flowAgent = true;
  const root = document.documentElement;
  let pickerEnabled = false;
  let overlay = null;
  let label = null;
  let hovered = null;
  let highlighted = null;

  function post(msg) { window.parent.postMessage({ source: "flow-agent", ...msg }, "*"); }

  function setState(stateId) {
    if (stateId) root.setAttribute("data-flow-state", stateId); else root.removeAttribute("data-flow-state");
    if (document.body) document.body.setAttribute("data-flow-state", stateId || "");
    document.dispatchEvent(new CustomEvent("flowstate", { detail: { stateId } }));
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.setAttribute("data-flow-ui", "");
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2C4FDB;border-radius:4px;background:rgba(44,79,219,.08);display:none;box-sizing:border-box;transition:all 80ms ease";
    // Eight handles, like a selection in a design tool. Shown only for the element the host is working on.
    for (const pos of ["-5px -5px", "-5px calc(50% - 4px)", "-5px auto", "calc(50% - 4px) -5px", "calc(50% - 4px) auto", "auto -5px", "auto calc(50% - 4px)", "auto auto"]) {
      const h = document.createElement("i");
      const [top, left] = pos.split(" ");
      h.setAttribute("data-flow-handle", "");
      h.style.cssText = "position:absolute;width:8px;height:8px;background:#fff;border:1.5px solid #2C4FDB;border-radius:2px;box-sizing:border-box;display:none;top:" + top + ";left:" + left + ";" + (top === "auto" ? "bottom:-5px;" : "") + (left === "auto" ? "right:-5px;" : "");
      overlay.appendChild(h);
    }
    label = document.createElement("div");
    label.setAttribute("data-flow-ui", "");
    label.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;background:#2C4FDB;color:#fff;font:600 11px/1.4 system-ui,sans-serif;padding:2px 6px;border-radius:3px;display:none;white-space:nowrap";
    document.body.appendChild(overlay);
    document.body.appendChild(label);
  }

  function frameOn(el, color, handles) {
    ensureOverlay();
    const r = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.borderWidth = handles ? "1.5px" : "2px";
    for (const h of overlay.querySelectorAll("[data-flow-handle]")) { h.style.display = handles ? "block" : "none"; h.style.borderColor = color; }
    overlay.style.left = r.left + "px"; overlay.style.top = r.top + "px";
    overlay.style.width = r.width + "px"; overlay.style.height = r.height + "px";
    overlay.style.borderColor = color; overlay.style.background = color === "#2C4FDB" ? "rgba(44,79,219,.08)" : "rgba(184,54,139,.10)";
    label.style.display = "block";
    label.style.background = color;
    label.textContent = el.getAttribute("data-flow-el");
    label.style.left = r.left + "px";
    label.style.top = Math.max(0, r.top - 20) + "px";
    return r;
  }
  function frameOff() { if (overlay) { overlay.style.display = "none"; label.style.display = "none"; } }

  function elFor(target) {
    let n = target;
    while (n && n !== document.body) { if (n.getAttribute && n.hasAttribute("data-flow-el")) return n; n = n.parentElement; }
    return null;
  }
  function rectOf(el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }

  document.addEventListener("click", (ev) => {
    if (pickerEnabled) {
      const el = elFor(ev.target);
      ev.preventDefault(); ev.stopPropagation();
      if (el) post({ type: "flow:pick", elementId: el.getAttribute("data-flow-el"), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60), rect: rectOf(el), tag: el.tagName.toLowerCase() });
      return;
    }
    let n = ev.target;
    while (n && n !== document.body) {
      if (n.getAttribute && n.hasAttribute("data-flow-transition")) {
        ev.preventDefault();
        const holder = elFor(n);
        const ids = (n.getAttribute("data-flow-transition") || "").split(/\s+/).filter(Boolean);
        post({ type: "flow:transition", transitionId: ids[0] || null, transitionIds: ids, elementId: holder ? holder.getAttribute("data-flow-el") : null });
        return;
      }
      n = n.parentElement;
    }
  }, true);

  document.addEventListener("mousemove", (ev) => {
    if (!pickerEnabled) return;
    const el = elFor(ev.target);
    if (el === hovered) return;
    hovered = el;
    if (el) { frameOn(el, "#2C4FDB", false); post({ type: "flow:hover", elementId: el.getAttribute("data-flow-el"), rect: rectOf(el) }); }
    else if (highlighted) { const h = document.querySelector('[data-flow-el="' + CSS.escape(highlighted) + '"]'); if (h) frameOn(h, "#2C4FDB", true); else frameOff(); }
    else frameOff();
  }, true);

  let previewed = null; // { el, original }
  let tokensPreview = null;
  function previewElement(elementId, html) {
    if (previewed) { previewed.el.outerHTML = previewed.original; previewed = null; }
    if (!elementId || html == null) return;
    const el = document.querySelector('[data-flow-el="' + CSS.escape(elementId) + '"]');
    if (!el) return;
    const original = el.outerHTML;
    el.outerHTML = html;
    const replaced = document.querySelector('[data-flow-el="' + CSS.escape(elementId) + '"]');
    if (replaced) previewed = { el: replaced, original };
  }
  function previewTokens(css) {
    if (!tokensPreview) { tokensPreview = document.createElement("style"); tokensPreview.setAttribute("data-flow-ui", ""); document.head.appendChild(tokensPreview); }
    tokensPreview.textContent = css || "";
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "flow-shell") return;
    if (d.type === "flow:preview") previewElement(d.elementId, d.html);
    else if (d.type === "flow:preview-tokens") previewTokens(d.css);
    else if (d.type === "flow:setState") setState(d.stateId);
    else if (d.type === "flow:scroll-mode") { scrollMode = d.mode === "scroll" ? "scroll" : "pan"; root.setAttribute("data-flow-scroll", scrollMode); }
    else if (d.type === "flow:picker") { pickerEnabled = !!d.enabled; document.body && (document.body.style.cursor = pickerEnabled ? "crosshair" : ""); if (!pickerEnabled) { hovered = null; if (!highlighted) frameOff(); } }
    else if (d.type === "flow:highlight") {
      highlighted = d.elementId || null;
      const el = highlighted ? document.querySelector('[data-flow-el="' + CSS.escape(highlighted) + '"]') : null;
      if (el) { frameOn(el, "#2C4FDB", true); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } else frameOff();
    }
  });

  // Scrolling belongs to the board unless the host says this screen is being scrolled on purpose. Pinch and
  // modifier-scroll always go up as zoom, and never to the browser.
  let scrollMode = "scroll";
  window.addEventListener("wheel", (ev) => {
    const zoom = ev.ctrlKey || ev.metaKey;
    if (!zoom && scrollMode === "scroll") return;
    ev.preventDefault();
    post({ type: "flow:wheel", deltaX: ev.deltaX, deltaY: ev.deltaY, deltaMode: ev.deltaMode, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, zoom, x: ev.clientX, y: ev.clientY });
  }, { passive: false, capture: true });
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) window.addEventListener(t, (ev) => ev.preventDefault(), { passive: false });

  function ready() {
    const elements = Array.from(document.querySelectorAll("[data-flow-el]")).map((el) => el.getAttribute("data-flow-el"));
    const transitions = Array.from(document.querySelectorAll("[data-flow-transition]")).map((el) => el.getAttribute("data-flow-transition"));
    post({ type: "flow:ready", elements, transitions });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
