import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useFlow, useHeadVersion } from "../store";
import { Icon } from "./Icon";

const FRAME_W = 300;

/**
 * The selected screen running at reading size, beside the flow view where the cards cannot show it.
 * An edge case previews its host screen with the handling text underneath, so the two readings stay side by side.
 */
export function PreviewPanel() {
  const bundle = useFlow((s) => s.bundle)!;
  const projectId = useFlow((s) => s.projectId)!;
  const selection = useFlow((s) => s.selection);
  const select = useFlow((s) => s.select);
  const head = useHeadVersion();
  const { spec } = bundle;
  const ref = useRef<HTMLIFrameElement>(null);
  const [live, setLive] = useState<{ screenId: string; stateId: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const edgeCase = selection?.kind === "node" && selection.id.startsWith("edgecase:") ? spec.edgeCases.find((e) => e.id === selection.id.slice(9)) : undefined;
  const hostId = edgeCase ? (edgeCase.attachedTo.screenId ?? spec.transitions.find((t) => t.id === edgeCase.attachedTo.transitionId)?.from.screenId) : selection?.kind === "node" && selection.id.startsWith("screen:") ? selection.id.slice(7) : undefined;
  const screen = spec.screens.find((s) => s.id === hostId);

  useEffect(() => { setLive(null); }, [hostId, reloadKey]);
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (!ref.current || ev.source !== ref.current.contentWindow) return;
      const d = ev.data;
      if (d?.source === "flow-shell" && d.type === "flow:navigated") setLive({ screenId: d.screenId, stateId: d.stateId });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const post = (msg: Record<string, unknown>) => ref.current?.contentWindow?.postMessage({ source: "flow-host", ...msg }, "*");

  if (!screen) return <div className="inspector"><div className="empty">Select a screen or an edge case to run it here.</div></div>;
  const showing = spec.screens.find((s) => s.id === (live?.screenId ?? screen.id)) ?? screen;
  const stateId = live?.stateId ?? showing.states.find((s) => s.isDefault)?.id ?? "";
  const scale = FRAME_W / spec.device.width;
  const frameH = Math.round(Math.min(spec.device.height, spec.device.width * 2.05) * scale);

  return (
    <div className="preview">
      <div className="pv-crumbs">
        {showing.id !== screen.id || edgeCase
          ? <button className="pv-back" onClick={() => { if (showing.id !== screen.id) post({ type: "flow:goto", screenId: screen.id }); else select({ kind: "node", id: `screen:${screen.id}` }); }} aria-label="Back"><Icon name="arrow-left" size={15} /></button>
          : <span className="pv-back" />}
        <button className="crumb" onClick={() => select({ kind: "node", id: `screen:${screen.id}` })}>{screen.name}</button>
        {edgeCase && <><span className="crumb-sep">/</span><span className="crumb current">{edgeCase.scenario}</span></>}
        {!edgeCase && showing.id !== screen.id && <><span className="crumb-sep">/</span><span className="crumb current">{showing.name}</span></>}
      </div>
      <div className="pv-stage">
        <div className="pv-device" style={{ width: FRAME_W, height: frameH }}>
          <iframe ref={ref} key={`${head}:${reloadKey}`} title={screen.name} src={api.shellUrl(projectId, screen.id)} style={{ width: spec.device.width, height: spec.device.height, transform: `scale(${scale})` }} />
        </div>
      </div>
      {edgeCase && (
        <div className="pv-ec">
          <div className="pv-ec-row"><span className="k">Scenario</span><span>{edgeCase.scenario}</span></div>
          <div className="pv-ec-row"><span className="k">Handling</span><span>{edgeCase.handling}</span></div>
          <div className="pv-ec-row"><span className="k">Severity</span><span className={`pill ${edgeCase.severity === "high" ? "err" : edgeCase.severity === "low" ? "grey" : "warn"}`}>{edgeCase.severity}</span></div>
        </div>
      )}
      <div className="pv-sim">
        <label>Simulate</label>
        <div className="pv-sim-row">
          <select className="input" value={stateId} onChange={(e) => post({ type: "flow:setState", stateId: e.target.value })} disabled={showing.states.length === 0}>
            {showing.states.map((st) => <option key={st.id} value={st.id}>{st.trigger ? `${st.name} · ${st.trigger}` : st.name}</option>)}
          </select>
          <button className="btn" onClick={() => setReloadKey((k) => k + 1)} title="Reload the screen in its default state"><Icon name="rotate-ccw" size={13} /> Reset</button>
        </div>
      </div>
    </div>
  );
}
