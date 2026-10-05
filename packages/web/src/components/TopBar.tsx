import { useEffect, useRef, useState } from "react";
import { useFlow } from "../store";
import { Icon } from "./Icon";
import { confirm } from "./Dialog";

function savedLabel(savedAt: number | null, saving: boolean, now: number): string {
  if (saving) return "Saving…";
  if (!savedAt) return "Saved";
  const s = Math.round((now - savedAt) / 1000);
  if (s < 8) return "Saved just now";
  if (s < 60) return `Saved ${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `Saved ${m}m ago`;
  return `Saved ${Math.round(m / 60)}h ago`;
}

/**
 * Top bar: where you are (left), which view (centre), and the state of the work plus the two ways out of it (right):
 * share the prototype, or run it. Claude is reached from the composer on the canvas, so the bar only reports a run.
 */
export function TopBar() {
  const bundle = useFlow((s) => s.bundle)!;
  const view = useFlow((s) => s.view);
  const setView = useFlow((s) => s.setView);
  const closeProject = useFlow((s) => s.closeProject);
  const running = useFlow((s) => s.agent.running);
  const cancel = useFlow((s) => s.cancel);
  const run = useFlow((s) => s.run);
  const panel = useFlow((s) => s.panel);
  const setPanel = useFlow((s) => s.setPanel);
  const showToast = useFlow((s) => s.showToast);
  const setWalk = useFlow((s) => s.setWalk);
  const savedAt = useFlow((s) => s.savedAt);
  const saving = useFlow((s) => s.saving);
  const [now, setNow] = useState(Date.now());
  const [menu, setMenu] = useState<"project" | "run" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const spec = bundle.spec;
  const hasScreens = spec.screens.length > 0;

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (ev: MouseEvent) => { if (!menuRef.current?.contains(ev.target as Node)) setMenu(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const exportProto = async () => {
    setMenu(null);
    try { const r = await fetch(`/api/projects/${bundle.meta.id}/export`, { method: "POST" }).then((x) => x.json()); showToast(`Exported ${r.screens} screens to ${r.path}`); }
    catch (e) { showToast(`Export failed: ${(e as Error).message}`); }
  };
  const regenerate = async () => {
    setMenu(null);
    if (!spec.brief.trim()) { showToast("Write the brief first. It's the card on the canvas."); return; }
    if (hasScreens && !(await confirm("Regenerate everything from the brief?", "Every screen is rewritten. The current state stays in History."))) return;
    run("generate", { brief: spec.brief }, "Generate from the brief");
  };
  const present = (screenId?: string) => { setMenu(null); setWalk({ active: true, screenId: screenId ?? spec.screens[0]?.id ?? null, stateId: null, lastTransitionId: null }); };

  return (
    <header className="topbar">
      <div className="tb-left" ref={menu === "project" ? menuRef : undefined}>
        <button className="brand" onClick={closeProject} title="All projects">
          <span className="brand-mark" aria-hidden="true"><Icon name="hexagon" size={22} strokeWidth={2} /></span>
          <span className="wordmark">Flow<span>Vibing</span></span>
        </button>
        <span className="tb-sep" />
        <nav className="crumbs" aria-label="Project">
          <button className="crumb muted" onClick={closeProject}>Projects</button>
          <span className="crumb-sep">/</span>
          <button className="crumb current" onClick={() => setMenu(menu === "project" ? null : "project")} aria-haspopup="menu" aria-expanded={menu === "project"}>
            {spec.name} <Icon name="chevron-down" size={13} />
          </button>
        </nav>
        {menu === "project" && (
          <div className="menu" role="menu" style={{ left: 160, top: 46 }}>
            <div className="menu-meta"><Icon name="smartphone" size={12} /> {spec.device.kind} · {spec.device.width}×{spec.device.height}</div>
            <button role="menuitem" onClick={() => { setMenu(null); setPanel("history"); }}><Icon name="history" size={14} /> History</button>
            <button role="menuitem" onClick={exportProto} disabled={!hasScreens}><Icon name="download" size={14} /> Export single-file prototype</button>
            <button role="menuitem" onClick={regenerate} disabled={running}><Icon name="refresh" size={14} /> {hasScreens ? "Regenerate from the brief" : "Generate from the brief"}</button>
            <div className="menu-sep" />
            <button role="menuitem" onClick={closeProject}><Icon name="arrow-left" size={14} /> All projects</button>
          </div>
        )}
      </div>
      <div className="tb-center">
        <div className="seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "prototype"} className={view === "prototype" ? "on" : ""} onClick={() => setView("prototype")} title="Prototype (1)"><Icon name="smartphone" size={14} /> Prototype</button>
          <button role="tab" aria-selected={view === "flow"} className={view === "flow" ? "on" : ""} onClick={() => setView("flow")} title="Flow (2)"><Icon name="git-branch" size={14} /> Flow</button>
        </div>
      </div>
      <div className="tb-right" ref={menu === "run" ? menuRef : undefined}>
        {running ? (
          <button className="status working" onClick={() => setPanel("claude")} title="Open Claude to watch the run (C)"><span className="pulse" /> Claude is working</button>
        ) : (
          <span className="status" title={savedAt ? new Date(savedAt).toLocaleTimeString() : "Every change is written to the project folder"}><span className={`dot ${saving ? "busy" : ""}`} /> {savedLabel(savedAt, saving, now)}</span>
        )}
        {running && <button className="btn icon ghost" onClick={cancel} title="Stop Claude" aria-label="Stop Claude"><Icon name="stop" size={14} /></button>}
        <button className={`btn ghost ${panel === "claude" ? "on" : ""}`} onClick={() => setPanel(panel === "claude" ? null : "claude")} title="Claude panel (C)" aria-pressed={panel === "claude"}><Icon name="sparkles" size={15} /> Claude</button>
        <button className="btn" onClick={exportProto} disabled={!hasScreens} title="Write a single-file prototype that runs without a server"><Icon name="share" size={14} /> Share</button>
        <div className="split">
          <button className="btn dark" onClick={() => present()} disabled={!hasScreens} title="Walk through the flow full screen (W)"><Icon name="play" size={13} /> Run prototype</button>
          <button className="btn dark caret" onClick={() => setMenu(menu === "run" ? null : "run")} disabled={!hasScreens} aria-label="Choose where to start" aria-haspopup="menu" aria-expanded={menu === "run"}><Icon name="chevron-down" size={13} /></button>
        </div>
        {menu === "run" && (
          <div className="menu right" role="menu">
            <div className="menu-meta">Start from</div>
            {spec.screens.map((s) => <button key={s.id} role="menuitem" onClick={() => present(s.id)}>{s.name}</button>)}
          </div>
        )}
      </div>
    </header>
  );
}
