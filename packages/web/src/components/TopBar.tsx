import { useFlow } from "../store";
import { Icon } from "./Icon";

/**
 * Top bar: where you are (left), which view (centre), and the one thing to do next (right).
 * Modes live in the tool rail, panels in the right panel. Nothing else competes here.
 */
export function TopBar() {
  const bundle = useFlow((s) => s.bundle)!;
  const view = useFlow((s) => s.view);
  const setView = useFlow((s) => s.setView);
  const closeProject = useFlow((s) => s.closeProject);
  const pending = useFlow((s) => s.pendingChanges);
  const running = useFlow((s) => s.agent.running);
  const run = useFlow((s) => s.run);
  const cancel = useFlow((s) => s.cancel);
  const panel = useFlow((s) => s.panel);
  const setPanel = useFlow((s) => s.setPanel);
  const showToast = useFlow((s) => s.showToast);
  const spec = bundle.spec;
  const hasScreens = spec.screens.length > 0;

  /** The one accent button. It always opens Claude; when there is an obvious job, it also starts it. */
  const claudeCta = () => {
    setPanel("claude");
    if (running) return;
    if (pending.length) { run("regenerate", { changeRequests: pending }, `Apply ${pending.length} change${pending.length === 1 ? "" : "s"}`); return; }
    if (!hasScreens) {
      if (!spec.brief.trim()) { showToast("Write the brief first. It's the card on the canvas."); return; }
      run("generate", { brief: spec.brief }, "Generate from the brief");
    }
  };
  const ctaLabel = running ? "Claude is working" : pending.length ? `Apply ${pending.length} change${pending.length === 1 ? "" : "s"}` : hasScreens ? "Ask Claude" : "Generate";
  const ctaIcon = running ? null : pending.length ? "wand" : hasScreens ? "message-square" : "sparkles";

  const exportProto = async () => {
    try { const r = await fetch(`/api/projects/${bundle.meta.id}/export`, { method: "POST" }).then((x) => x.json()); showToast(`Exported ${r.screens} screens to ${r.path}`); }
    catch (e) { showToast(`Export failed: ${(e as Error).message}`); }
  };

  return (
    <header className="topbar">
      <div className="tb-left">
        <button className="btn icon ghost" onClick={closeProject} title="All projects" aria-label="All projects"><Icon name="arrow-left" /></button>
        <div className="wordmark" aria-hidden="true">Flow<span>Vibing</span></div>
        <div className="tb-project">
          <div className="tb-name">{spec.name}</div>
          <div className="tb-meta"><Icon name="smartphone" size={11} /> {spec.device.kind} · {spec.device.width}×{spec.device.height}</div>
        </div>
      </div>
      <div className="tb-center">
        <div className="seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "prototype"} className={view === "prototype" ? "on" : ""} onClick={() => setView("prototype")} title="Prototype (1)"><Icon name="smartphone" size={14} /> Prototype</button>
          <button role="tab" aria-selected={view === "flow"} className={view === "flow" ? "on" : ""} onClick={() => setView("flow")} title="Flow (2)"><Icon name="git-branch" size={14} /> Flow</button>
        </div>
      </div>
      <div className="tb-right">
        <button className="btn" onClick={exportProto} disabled={!hasScreens} title="Write a single-file prototype that runs without a server"><Icon name="download" size={14} /> Export</button>
        <div className="seg icons" role="tablist" aria-label="Panel">
          <button role="tab" aria-selected={panel === "inspect"} className={panel === "inspect" ? "on" : ""} onClick={() => setPanel(panel === "inspect" ? null : "inspect")} title="Inspect (I)" aria-label="Inspect"><Icon name="sliders" size={15} /></button>
          <button role="tab" aria-selected={panel === "history"} className={panel === "history" ? "on" : ""} onClick={() => setPanel(panel === "history" ? null : "history")} title="History (H)" aria-label="History"><Icon name="history" size={15} /></button>
        </div>
        <button className={`btn primary cta ${running ? "working" : ""} ${panel === "claude" ? "open" : ""}`} onClick={claudeCta} title={running ? "Open Claude to watch or stop the run (C)" : "Claude (C)"} aria-pressed={panel === "claude"}>
          {running ? <span className="pulse light" /> : <Icon name={ctaIcon!} size={15} />} {ctaLabel}
          {pending.length > 0 && !running && <span className="cta-count">{pending.length}</span>}
        </button>
        {running && <button className="btn icon danger-soft" onClick={cancel} title="Stop Claude" aria-label="Stop Claude"><Icon name="stop" size={14} /></button>}
      </div>
    </header>
  );
}
