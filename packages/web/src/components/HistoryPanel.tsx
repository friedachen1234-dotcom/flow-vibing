import { useFlow } from "../store";
import { Icon } from "./Icon";

/** Versions as a vertical list, newest first. Click to preview, restore or pin from the preview. */
export function HistoryPanel() {
  const versions = useFlow((s) => s.bundle!.versions);
  const spec = useFlow((s) => s.bundle!.spec);
  const setPreviewVersion = useFlow((s) => s.setPreviewVersion);
  const selection = useFlow((s) => s.selection);
  const focusScreen = selection?.kind === "node" && selection.id.startsWith("screen:") ? selection.id.slice(7) : null;
  const list = focusScreen ? versions.filter((v, i) => i === 0 || v.screens.includes(focusScreen)) : versions;
  const nameOf = (id: string) => spec.screens.find((s) => s.id === id)?.name ?? id;
  return (
    <div className="history">
      {focusScreen && <div className="hp-filter">Showing versions that touched <b>{nameOf(focusScreen)}</b>. <button className="link" onClick={() => useFlow.getState().select(null)}>Show all</button></div>}
      {list.map((v, i) => (
        <button key={v.id} className={`hv ${i === 0 ? "head" : ""}`} onClick={() => setPreviewVersion(v.id)}>
          <div className="hv-line"><span className="hv-dot" /></div>
          <div className="hv-body">
            <div className="hv-title">{v.label ?? v.summary}{v.pinned && <Icon name="pin" size={12} className="hv-pin" />}</div>
            <div className="hv-meta">
              <span className="pill grey">{v.kind}</span>
              <span>{new Date(v.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              {i === 0 && <span className="pill">current</span>}
            </div>
            {v.screens.length > 0 && <div className="hv-screens">{v.screens.map(nameOf).join(", ")}</div>}
          </div>
        </button>
      ))}
      {list.length === 0 && <div className="empty">No versions yet.</div>}
    </div>
  );
}
