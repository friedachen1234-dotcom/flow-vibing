import { useFlow } from "../store";
import { Inspector, PanelHeader } from "./Inspector";
import { AgentPanel } from "./AgentPanel";
import { HistoryPanel } from "./HistoryPanel";
import { Icon } from "./Icon";

const TITLES = { inspect: "Details", claude: "Claude", history: "History" } as const;
const TABS = ["inspect", "claude", "history"] as const;

/**
 * One floating panel on the right. Its shape never changes: a header that says what is selected, then three tabs that
 * are views of that one thing. Details (what it is and what it connects to), Claude (change it), History (how it got here).
 */
export function RightPanel() {
  const panel = useFlow((s) => s.panel);
  const setPanel = useFlow((s) => s.setPanel);
  // Closed: a slim tab on the edge brings it back, so hiding the panel never hides the way to reopen it.
  if (!panel) {
    return (
      <button className="rp-edge" onClick={() => setPanel("inspect")} title="Open the panel (I)" aria-label="Open panel">
        <Icon name="panel-right" size={15} />
      </button>
    );
  }
  const active = panel === "preview" ? "inspect" : panel;
  return (
    <aside className="rpanel" aria-label={TITLES[active]}>
      <PanelHeader onClose={() => setPanel(null)} />
      <div className="rp-tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={active === k} className={active === k ? "on" : ""} onClick={() => setPanel(k)}>{TITLES[k]}</button>
        ))}
      </div>
      <div className="rp-body">
        {active === "inspect" && <Inspector />}
        {active === "claude" && <AgentPanel />}
        {active === "history" && <HistoryPanel />}
      </div>
    </aside>
  );
}
