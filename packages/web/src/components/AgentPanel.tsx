import { useEffect, useRef, useState } from "react";
import { describeChange } from "@flow/shared";
import { useFlow } from "../store";
import { Icon } from "./Icon";
import { confirm } from "./Dialog";

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
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const { spec } = bundle;
  const hasScreens = spec.screens.length > 0;

  useEffect(() => { if (draft) { setText(draft); setDraft(""); } }, [draft, setDraft]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [agent.items.length, agent.streaming]);

  const picked = useFlow((s) => s.picker.picked);
  const setPicked = useFlow((s) => s.setPicked);
  const pickedScreen = picked ? spec.screens.find((s) => s.id === picked.screenId) : undefined;
  const send = () => {
    const t = text.trim();
    if (!t || agent.running) return;
    setText("");
    if (picked) run("chat", { text: t, target: { screenId: picked.screenId, elementId: picked.elementId } }, `${pickedScreen?.name ?? picked.screenId} · ${picked.elementId}: ${t}`);
    else run("chat", { text: t }, t);
  };
  const generate = () => {
    if (!spec.brief.trim()) { useFlow.getState().showToast("Write a brief first, on the Brief card."); return; }
    run("generate", { brief: spec.brief }, `Generate from the brief`);
  };
  const apply = () => run("regenerate", { changeRequests: pending }, `Apply ${pending.length} change${pending.length === 1 ? "" : "s"}`);
  const confirmRegen = async () => { if (await confirm("Regenerate everything from the brief?", "Every screen is rewritten. The current state stays in History.")) generate(); };

  return (
    <div className="agent">
      <div className="ap-head">
        <span className="status">{agent.running ? <><span className="pulse" /> {agent.status || "working"}</> : "idle"}</span>
        <span className="cost" title="Cost this session">${agent.totalCost.toFixed(2)}</span>
        {hasScreens && <button className="btn sm ghost" disabled={agent.running} onClick={() => confirmRegen()} title="Start over from the brief. Rewrites every screen."><Icon name="refresh" size={12} /> Regenerate all</button>}
      </div>
      <div className="log" ref={logRef}>
        {agent.items.length === 0 && (
          <div className="muted small" style={{ lineHeight: 1.6 }}>
            {hasScreens ? "Ask for changes in plain words, or queue structured edits from the flow view and apply them together." : "Write the brief on the canvas, attach any references with magic lines, then generate."}
          </div>
        )}
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
      {pending.length > 0 && (
        <div className="changes">
          <h4>Pending changes · {pending.length}</h4>
          {pending.map((cr) => <div key={cr.id} className="cr"><span className="pill grey">{cr.op}</span><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{describeChange(cr, spec)}</span><button className="x" onClick={() => removeChange(cr.id)} title="Remove">×</button></div>)}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn primary" disabled={agent.running} onClick={apply}>Apply changes</button>
            <button className="btn ghost" onClick={clearChanges}>Discard</button>
          </div>
        </div>
      )}
      <div className="composer">
        {picked && (
          <div className="ctx-chip" title="Claude will change only this element's screen">
            <Icon name="crosshair" size={12} /> Editing <b>{picked.elementId}</b> on {pickedScreen?.name ?? picked.screenId}
            <button className="x" onClick={() => setPicked(null)} aria-label="Clear target"><Icon name="x" size={11} /></button>
          </div>
        )}
        <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={hasScreens ? "Ask for a change or a question…" : "Ask Claude about the brief, or press Generate in the top bar"} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
        <div className="row">
          <button className="btn primary" disabled={agent.running || !text.trim()} onClick={send}><Icon name="send" size={13} /> Send</button>
          <span style={{ flex: 1 }} />
          {agent.running && <button className="btn danger-soft" onClick={cancel}><Icon name="stop" size={12} /> Stop</button>}
          {!agent.running && <span className="muted small">⌘↵</span>}
        </div>
      </div>
    </div>
  );
}
