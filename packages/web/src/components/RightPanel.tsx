import { useFlow } from "../store";
import { Inspector } from "./Inspector";
import { AgentPanel } from "./AgentPanel";
import { HistoryPanel } from "./HistoryPanel";
import { Icon } from "./Icon";

const TITLES = { inspect: "Inspect", claude: "Claude", history: "History" } as const;

/** One panel, three tabs. Only one thing on the right at a time so the canvas keeps its width. */
export function RightPanel() {
  const panel = useFlow((s) => s.panel);
  const setPanel = useFlow((s) => s.setPanel);
  if (!panel) return null;
  return (
    <aside className="rpanel" aria-label={TITLES[panel]}>
      <div className="rp-head">
        <div className="rp-tabs" role="tablist">
          {(["inspect", "claude", "history"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={panel === k} className={panel === k ? "on" : ""} onClick={() => setPanel(k)}>{TITLES[k]}</button>
          ))}
        </div>
        <button className="btn icon ghost" onClick={() => setPanel(null)} title="Hide panel" aria-label="Hide panel"><Icon name="x" size={14} /></button>
      </div>
      <div className="rp-body">
        {panel === "inspect" && <Inspector />}
        {panel === "claude" && <AgentPanel />}
        {panel === "history" && <HistoryPanel />}
      </div>
    </aside>
  );
}
