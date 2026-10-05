import { useFlow } from "../store";
import { Inspector } from "./Inspector";
import { AgentPanel } from "./AgentPanel";
import { HistoryPanel } from "./HistoryPanel";
import { PreviewPanel } from "./PreviewPanel";
import { Icon } from "./Icon";

const TITLES = { preview: "Live preview", inspect: "Inspect", claude: "Claude", history: "History" } as const;
const ICONS = { preview: "smartphone", inspect: "sliders", claude: "sparkles", history: "history" } as const;

/** One floating panel on the right, four tabs. Only one thing at a time, so the board keeps its width. */
export function RightPanel() {
  const panel = useFlow((s) => s.panel);
  const setPanel = useFlow((s) => s.setPanel);
  const selection = useFlow((s) => s.selection);
  const canPreview = selection?.kind === "node" && (selection.id.startsWith("screen:") || selection.id.startsWith("edgecase:"));
  const isEdgeCase = selection?.kind === "node" && selection.id.startsWith("edgecase:");
  // Closed: a slim tab on the edge brings it back, so hiding the panel never hides the way to reopen it.
  if (!panel) {
    return (
      <button className="rp-edge" onClick={() => setPanel(canPreview ? "preview" : "inspect")} title="Open the panel (I)" aria-label="Open panel">
        <Icon name="panel-right" size={15} />
      </button>
    );
  }
  const active = panel === "preview" && !canPreview ? "inspect" : panel;
  const tabs = (canPreview ? ["preview", "inspect", "claude", "history"] : ["inspect", "claude", "history"]) as (typeof active)[];
  return (
    <aside className="rpanel" aria-label={TITLES[active]}>
      <div className="rp-head">
        <span className="rp-icon"><Icon name={ICONS[active]} size={16} /></span>
        <span className="rp-title">{TITLES[active]}</span>
        {active === "preview" && <span className={`pill ${isEdgeCase ? "warn" : "ok"}`}><span className="pill-dot" /> {isEdgeCase ? "Edge case" : "Live"}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn icon ghost sm" onClick={() => setPanel(null)} title="Hide panel" aria-label="Hide panel"><Icon name="x" size={14} /></button>
      </div>
      <div className="rp-tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={active === k} className={active === k ? "on" : ""} onClick={() => setPanel(k)}>{TITLES[k]}</button>
        ))}
      </div>
      <div className="rp-body">
        {active === "preview" && <PreviewPanel />}
        {active === "inspect" && <Inspector />}
        {active === "claude" && <AgentPanel />}
        {active === "history" && <HistoryPanel />}
      </div>
    </aside>
  );
}
