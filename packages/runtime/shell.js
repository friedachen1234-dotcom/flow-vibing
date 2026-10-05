/*
 * FLOW runtime shell.
 * Loads a project's Design Spec and screen files, renders one screen at a time in an inner iframe,
 * and swaps screens according to the spec's transitions. Talks to the host app (parent window) with postMessage.
 *
 * Data sources, in order:
 *   1. window.__FLOW__ = { spec, screens: { [file]: html }, agent: "<screen-agent.js source>" }  (exported prototype)
 *   2. ?project=ID  → fetches /api/projects/ID/files/flow.json and screen files from the FLOW server
 *   3. ?example=ID  → same, from /api/examples/ID/files/ (a shipped example, run in place)
 */
(function () {
  const params = new URLSearchParams(location.search);
  const projectId = params.get("project");
  const exampleId = params.get("example"); // run a shipped example in place, without copying it into a project
  const startScreen = params.get("screen");
  const startState = params.get("state");
  const follow = params.get("follow") !== "0"; // when false, transitions are reported but not performed
  const version = params.get("version");
  const inline = window.__FLOW__ || null;
  const filesBase = projectId
    ? (version ? `/api/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(version)}/files/` : `/api/projects/${encodeURIComponent(projectId)}/files/`)
    : exampleId ? `/api/examples/${encodeURIComponent(exampleId)}/files/`
    : "./";
  const stage = document.getElementById("stage");
  const missing = document.getElementById("missing");

  let spec = null;
  let agentSource = null;
  let current = { screenId: null, stateId: null, frame: null };
  let pickerEnabled = false;
  let highlightEl = null;
  const history = [];

  function post(msg) {
    if (window.parent && window.parent !== window) window.parent.postMessage({ source: "flow-shell", ...msg }, "*");
  }

  async function loadText(rel) {
    if (inline && inline.screens && inline.screens[rel] != null) return inline.screens[rel];
    const res = await fetch(filesBase + rel, { cache: "no-store" });
    if (!res.ok) throw new Error(`${rel}: ${res.status}`);
    return await res.text();
  }

  async function loadSpec() {
    if (inline && inline.spec) return inline.spec;
    const res = await fetch(filesBase + "flow.json", { cache: "no-store" });
    if (!res.ok) throw new Error("flow.json: " + res.status);
    return await res.json();
  }

  async function loadAgent() {
    if (inline && inline.agent) return inline.agent;
    const res = await fetch("./screen-agent.js", { cache: "no-store" });
    return await res.text();
  }

  function screenById(id) { return spec.screens.find((s) => s.id === id) || null; }
  function defaultState(screen) { const d = screen.states.find((s) => s.isDefault); return d ? d.id : (screen.states[0] ? screen.states[0].id : null); }

  /** Rewrites a screen document so it works inside srcdoc: base href for relative assets, then the agent script. */
  function prepareHtml(html, file) {
    const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
    const baseHref = new URL(filesBase + dir, location.href).href;
    const inject = `<base href="${baseHref}"><script>${agentSource}<\/script>`;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + inject);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + "<head>" + inject + "</head>");
    return inject + html;
  }

  function showMissing(text) { missing.textContent = text; missing.classList.add("show"); }
  function hideMissing() { missing.classList.remove("show"); }

  async function mount(screenId, stateId, animation, transitionId) {
    const screen = screenById(screenId);
    if (!screen) { showMissing(`No screen "${screenId}" in the spec.`); return; }
    let html;
    try { html = await loadText(screen.file); } catch (e) { showMissing(`Screen "${screen.name}" has no file yet.\n${e.message}`); post({ type: "flow:missing", screenId }); return; }
    hideMissing();
    const frame = document.createElement("iframe");
    frame.setAttribute("title", screen.name);
    frame.dataset.screenId = screenId;
    const targetState = stateId || defaultState(screen);
    frame.dataset.stateId = targetState || "";
    const anim = animation && animation !== "none" ? animation : null;
    const old = current.frame;
    if (anim) frame.classList.add("enter-" + anim);
    frame.srcdoc = prepareHtml(html, screen.file);
    stage.appendChild(frame);
    current = { screenId, stateId: targetState, frame };
    frame.addEventListener("load", () => {
      send(frame, { type: "flow:setState", stateId: targetState });
      send(frame, { type: "flow:scroll-mode", mode: scrollMode });
      send(frame, { type: "flow:picker", enabled: pickerEnabled });
      if (highlightEl) send(frame, { type: "flow:highlight", elementId: highlightEl });
    });
    if (old) {
      if (anim) {
        old.classList.add("leave-" + anim);
        if (anim === "modal" || anim === "push") stage.insertBefore(old, frame); // new frame above
        else stage.appendChild(old); // pop and fade: old above, sliding away
        old.addEventListener("animationend", () => old.remove(), { once: true });
        setTimeout(() => old.remove(), 600);
      } else old.remove();
    }
    post({ type: "flow:navigated", screenId, stateId: targetState, transitionId: transitionId || null });
  }

  /**
   * Wheel and pinch over a prototype. The board owns these gestures: plain scroll pans the canvas, pinch or
   * modifier-scroll zooms it, and neither may reach the browser, which would zoom the whole page. Only when the host
   * puts this screen in "scroll" mode (it is selected) does a plain scroll reach the document inside.
   */
  let scrollMode = "scroll";
  function forwardWheel(ev, x, y) {
    const zoom = ev.ctrlKey || ev.metaKey;
    if (!zoom && scrollMode === "scroll") return; // let the screen scroll itself
    ev.preventDefault();
    post({ type: "flow:wheel", deltaX: ev.deltaX, deltaY: ev.deltaY, deltaMode: ev.deltaMode, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, x, y });
  }
  window.addEventListener("wheel", (ev) => forwardWheel(ev, ev.clientX, ev.clientY), { passive: false, capture: true });
  // Safari reports trackpad pinch as gesture events; swallowing them stops the page from zooming.
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) window.addEventListener(t, (ev) => ev.preventDefault(), { passive: false });

  function send(frame, msg) {
    try { frame.contentWindow.postMessage({ source: "flow-shell", ...msg }, "*"); } catch (e) { /* frame not ready */ }
  }

  function setState(stateId) {
    if (!current.frame) return;
    current.stateId = stateId;
    current.frame.dataset.stateId = stateId || "";
    send(current.frame, { type: "flow:setState", stateId });
    post({ type: "flow:navigated", screenId: current.screenId, stateId, transitionId: null });
  }

  function runTransition(transitionId, elementId) {
    const t = spec.transitions.find((x) => x.id === transitionId);
    post({ type: "flow:transition", transitionId, elementId, screenId: current.screenId, found: !!t });
    if (!t || !follow) return;
    history.push({ screenId: current.screenId, stateId: current.stateId });
    if (t.to.screenId === current.screenId && t.to.stateId) { setState(t.to.stateId); return; }
    mount(t.to.screenId, t.to.stateId || null, t.animation || "push", t.id);
  }

  /** Several branches share one element: ask which one to take, showing each condition. */
  function chooseBranch(ids, elementId) {
    const old = document.getElementById("branch-chooser");
    if (old) old.remove();
    const box = document.createElement("div");
    box.id = "branch-chooser";
    box.style.cssText = "position:absolute;left:12px;right:12px;bottom:16px;background:#171B22;color:#fff;border-radius:12px;padding:10px 12px;font:13px system-ui,sans-serif;z-index:50;box-shadow:0 12px 32px rgba(0,0,0,.3)";
    const title = document.createElement("div");
    title.textContent = "Which branch?";
    title.style.cssText = "font-weight:700;margin-bottom:8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;opacity:.7";
    box.appendChild(title);
    for (const id of ids) {
      const t = spec.transitions.find((x) => x.id === id);
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t && t.condition ? t.condition : (t ? t.trigger : id);
      b.style.cssText = "display:block;width:100%;text-align:left;background:rgba(255,255,255,.08);color:#fff;border:0;border-radius:8px;padding:9px 10px;margin:4px 0;font:inherit;cursor:pointer";
      b.addEventListener("click", () => { box.remove(); runTransition(id, elementId); });
      box.appendChild(b);
    }
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.textContent = "Cancel";
    cancel.style.cssText = "background:none;border:0;color:rgba(255,255,255,.6);font:inherit;padding:6px 0 0;cursor:pointer";
    cancel.addEventListener("click", () => box.remove());
    box.appendChild(cancel);
    document.body.appendChild(box);
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.source === "flow-agent") {
      // From the screen document.
      if (d.type === "flow:transition") {
        const ids = Array.isArray(d.transitionIds) && d.transitionIds.length ? d.transitionIds : [d.transitionId];
        const known = ids.filter((id) => spec.transitions.some((t) => t.id === id));
        if (known.length > 1) chooseBranch(known, d.elementId); else runTransition(ids[0], d.elementId);
      }
      else if (d.type === "flow:ready") post({ type: "flow:screen-ready", screenId: current.screenId, elements: d.elements, transitions: d.transitions });
      else if (d.type === "flow:wheel") { if (d.zoom || scrollMode !== "scroll") post({ type: "flow:wheel", deltaX: d.deltaX, deltaY: d.deltaY, deltaMode: d.deltaMode, ctrlKey: d.ctrlKey, metaKey: d.metaKey, x: d.x, y: d.y }); }
      else if (d.type === "flow:pick") post({ type: "flow:picked", screenId: current.screenId, elementId: d.elementId, label: d.label, rect: d.rect, tag: d.tag });
      else if (d.type === "flow:hover") post({ type: "flow:hover", screenId: current.screenId, elementId: d.elementId, rect: d.rect });
      return;
    }
    if (d.source === "flow-host") {
      // From the FLOW app.
      if (d.type === "flow:goto") mount(d.screenId, d.stateId || null, d.animation || "none", null);
      else if (d.type === "flow:setState") setState(d.stateId);
      else if (d.type === "flow:picker") { pickerEnabled = !!d.enabled; if (current.frame) send(current.frame, { type: "flow:picker", enabled: pickerEnabled }); }
      else if (d.type === "flow:highlight") { highlightEl = d.elementId || null; if (current.frame) send(current.frame, { type: "flow:highlight", elementId: highlightEl }); }
      else if (d.type === "flow:back") { const prev = history.pop(); if (prev) mount(prev.screenId, prev.stateId, "pop", null); }
      else if (d.type === "flow:reload") boot(current.screenId, current.stateId);
      else if (d.type === "flow:scroll-mode") { scrollMode = d.mode === "scroll" ? "scroll" : "pan"; document.documentElement.setAttribute("data-flow-scroll", scrollMode); if (current.frame) send(current.frame, { type: "flow:scroll-mode", mode: scrollMode }); }
      else if (d.type === "flow:preview" || d.type === "flow:preview-tokens") { if (current.frame) send(current.frame, d); }
      else if (d.type === "flow:transition") runTransition(d.transitionId, null);
    }
  });

  async function boot(screenId, stateId) {
    try {
      spec = await loadSpec();
      agentSource = agentSource || (await loadAgent());
    } catch (e) { showMissing("Could not load the project.\n" + e.message); return; }
    post({ type: "flow:ready", screens: spec.screens.map((s) => s.id) });
    const first = screenId || startScreen || (spec.screens[0] && spec.screens[0].id);
    if (!first) { showMissing("No screens yet. Generate one from the brief."); return; }
    await mount(first, stateId || startState || null, "none", null);
  }

  boot(null, null);
})();
