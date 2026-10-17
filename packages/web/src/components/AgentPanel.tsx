import { useEffect, useRef, useState } from "react";
import { describeChange } from "@flow/shared";
import { useFlow } from "../store";
import { Icon } from "./Icon";
import { confirm } from "./Dialog";

/** Edit with Claude: what is selected, what to change, and one button. The conversation stays above, out of the way. */
export function AgentPanel() {
  const bundle = useFlow((s) => s.bundle)!;
  const agent = useFlow((s) => s.agent);
  const pending = useFlow((s) => s.pendingChanges);
  const removeChange = useFlow((s) => s.removeChange);
  const clearChanges = useFlow((s) => s.clearChanges);
  const run = useFlow((s) => s.run);
  const cancel = useFlow((s) => s.cancel);
  const draft = useFlow((s) => s.composerDraft);
  const setDraft = useFlow((s) => s.setComposerDraft);
  const selection = useFlow((s) => s.selection);
  const select = useFlow((s) => s.select);
  const picked = useFlow((s) => s.picker.picked);
  const setPicked = useFlow((s) => s.setPicked);
  const pickerOn = useFlow((s) => s.picker.enabled);
  const setPicker = useFlow((s) => s.setPicker);
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { spec, canvas } = bundle;
  const hasScreens = spec.screens.length > 0;

  useEffect(() => { if (draft) { setText(draft); setDraft(""); } }, [draft, setDraft]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [agent.items.length, agent.streaming]);

  // The subject: the picked element, else the selected screen, else the whole project.
  const selectedScreen = selection?.kind === "node" && selection.id.startsWith("screen:") ? spec.screens.find((s) => s.id === selection.id.slice(7)) : undefined;
  const screen = picked ? spec.screens.find((s) => s.id === picked.screenId) : selectedScreen;
  const subject = picked ? `${screen?.name ?? picked.screenId} · ${picked.label || picked.elementId}` : screen?.name ?? null;
  const clearSubject = () => { setPicked(null); select(null); };

  const refTitles = screen
    ? canvas.edges.filter((e) => e.type === "magic" && e.target === `screen:${screen.id}`).map((e) => canvas.nodes.find((n) => n.id === e.source)).filter((n) => n?.type === "inspiration").map((n) => (n as { title: string }).title)
    : [];
  const suggestions = screen ? ["Simplify hierarchy", "Tighten the spacing", ...(refTitles[0] ? [`Lean into ${refTitles[0]}`] : [])] : ["Add a settings screen", "Make the flow shorter"];

  const canSend = !agent.running && !!text.trim();
  const send = () => {
    if (!canSend) return;
    const t = text.trim();
    setText("");
    if (picked) run("chat", { text: t, target: { screenId: picked.screenId, elementId: picked.elementId } }, `${screen?.name ?? picked.screenId} · ${picked.elementId}: ${t}`);
    else if (screen) run("chat", { text: `On the ${screen.name} screen: ${t}`, target: { screenId: screen.id } }, `${screen.name}: ${t}`);
    else run("chat", { text: t }, t);
  };
  const generate = () => {
    if (!spec.brief.trim()) { useFlow.getState().showToast("Write a brief first, on the Brief card."); return; }
    run("generate", { brief: spec.brief }, "Generate from the brief");
  };
  const apply = () => run("regenerate", { changeRequests: pending }, `Apply ${pending.length} change${pending.length === 1 ? "" : "s"}`);
  const confirmRegen = async () => { setMenu(false); if (await confirm("Regenerate everything from the brief?", "Every screen is rewritten. The current state stays in History.")) generate(); };

  return (
    <div className="agent">
      <div className="ap-title">
        <span className="ap-mark"><Icon name="sparkles" size={18} strokeWidth={2} /></span>
        <span className="ap-name">Edit with Claude</span>
        <span className={`ap-status ${agent.running ? "on" : ""}`}>{agent.running ? <><span className="pulse" /> {agent.status || "Working"}</> : null}</span>
        <span style={{ flex: 1 }} />
        {agent.running && <button className="btn sm danger-soft" onClick={cancel}><Icon name="stop" size={12} /> Stop</button>}
        <span className="ap-menu-wrap">
          <button className="rp-more" onClick={() => setMenu(!menu)} aria-label="More" aria-expanded={menu}><Icon name="more-horizontal" size={18} /></button>
          {menu && (
            <div className="menu ap-menu" onMouseLeave={() => setMenu(false)}>
              {hasScreens && <button disabled={agent.running} onClick={() => confirmRegen()}><Icon name="refresh" size={14} /> Regenerate all from the brief</button>}
              {!hasScreens && <button disabled={agent.running} onClick={() => { setMenu(false); generate(); }}><Icon name="sparkles" size={14} /> Generate from the brief</button>}
              <div className="menu-meta">Session cost ${agent.totalCost.toFixed(2)}</div>
            </div>
          )}
        </span>
      </div>

      {(agent.items.length > 0 || agent.streaming) && (
        <div className="log" ref={logRef}>
          {agent.items.map((it) => {
            if (it.kind === "tool") return <div key={it.id} className="tool"><span className={`dot ${it.ok === false ? "err" : it.ok ? "ok" : it.name === "Write" || it.name === "Edit" ? "write" : ""}`} />{it.text}</div>;
            if (it.kind === "done") return (
              <div key={it.id} className="msg done">{it.text}
                {it.issues && it.issues.length > 0 && <div className="issues">{it.issues.map((i, k) => <div key={k} className={`issue ${i.level}`}>{i.message}</div>)}</div>}
              </div>
            );
            return <div key={it.id} className={`msg ${it.kind}`}>{it.text}</div>;
          })}
          {agent.streaming && <div className="msg assistant streaming">{agent.streaming}</div>}
        </div>
      )}

      {pending.length > 0 && (
        <div className="changes">
          <h4>Queued edits · {pending.length}</h4>
          {pending.map((cr) => <div key={cr.id} className="cr"><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{describeChange(cr, spec)}</span><button className="x" onClick={() => removeChange(cr.id)} title="Remove">×</button></div>)}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn primary sm" disabled={agent.running} onClick={apply}>Apply {pending.length === 1 ? "edit" : "edits"}</button>
            <button className="btn ghost sm" onClick={clearChanges}>Discard</button>
          </div>
        </div>
      )}

      <div className="composer">
        {subject ? (
          <div className="ap-subject"><span>Selected: <b>{subject}</b></span><button className="x" onClick={clearSubject} aria-label="Clear selection"><Icon name="x" size={12} /></button></div>
        ) : (
          <div className="ap-subject whole">Whole project <span className="muted">· select a screen to focus</span></div>
        )}
        <div className="ap-ask">What would you like to change?</div>
        <div className="ap-chips">
          {suggestions.map((sg) => <button key={sg} className="ap-chip" onClick={() => setText(sg)}>{sg}</button>)}
        </div>
        <div className={`ap-box ${pickerOn ? "picking" : ""}`}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder={hasScreens ? `Describe a change${screen ? ` to ${screen.name}` : ""}…` : "Ask Claude about the brief, or generate from the menu"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
          <div className="ap-box-foot">
            <button className={`ap-tool ${pickerOn ? "on" : ""}`} onClick={() => setPicker(!pickerOn)} data-tip={pickerOn ? "Stop picking" : "Pick an element in the prototype"} data-key="P" aria-label="Pick an element"><Icon name="crosshair" size={16} /></button>
            <span style={{ flex: 1 }} />
            <span className="muted small">⌘↵</span>
          </div>
        </div>
        <button className="btn dark ap-go" disabled={!canSend} onClick={send}>Apply change <Icon name="arrow-right" size={15} className="up" /></button>
        <div className="ap-note">Changes create a restorable version. Variants live in Inspect.</div>
      </div>
    </div>
  );
}
