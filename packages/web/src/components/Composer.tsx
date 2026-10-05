import { useEffect, useRef, useState } from "react";
import { useFlow } from "../store";
import { api } from "../api";
import { Icon } from "./Icon";

/**
 * The one place to talk to Claude from the board. It always knows what it is about: the picked element, the selected
 * screen, or the whole project. Variants come from the same bar, so exploring and editing share one habit.
 */
export function Composer() {
  const bundle = useFlow((s) => s.bundle)!;
  const projectId = useFlow((s) => s.projectId)!;
  const running = useFlow((s) => s.agent.running);
  const status = useFlow((s) => s.agent.status);
  const cancel = useFlow((s) => s.cancel);
  const run = useFlow((s) => s.run);
  const picked = useFlow((s) => s.picker.picked);
  const setPicked = useFlow((s) => s.setPicked);
  const selection = useFlow((s) => s.selection);
  const pending = useFlow((s) => s.pendingChanges);
  const setPanel = useFlow((s) => s.setPanel);
  const draft = useFlow((s) => s.composerDraft);
  const setDraft = useFlow((s) => s.setComposerDraft);
  const showToast = useFlow((s) => s.showToast);
  const [text, setText] = useState("");
  const [count, setCount] = useState(3);
  const inputRef = useRef<HTMLInputElement>(null);
  const { spec, canvas } = bundle;
  const hasScreens = spec.screens.length > 0;

  useEffect(() => { if (draft) { setText(draft); setDraft(""); inputRef.current?.focus(); } }, [draft, setDraft]);
  useEffect(() => { if (picked) inputRef.current?.focus(); }, [picked?.elementId, picked?.screenId]);

  const selectedScreen = selection?.kind === "node" && selection.id.startsWith("screen:") ? spec.screens.find((s) => s.id === selection.id.slice(7)) : undefined;
  const pickedScreen = picked ? spec.screens.find((s) => s.id === picked.screenId) : undefined;
  const target = picked ? { screenId: picked.screenId, elementId: picked.elementId } : selectedScreen ? { screenId: selectedScreen.id } : undefined;
  const targetLabel = picked ? (spec.screens.find((s) => s.id === picked.screenId)?.elements.find((e) => e.id === picked.elementId)?.label ?? picked.label ?? picked.elementId) : selectedScreen?.name;

  const send = () => {
    const t = text.trim();
    if (!t || running) return;
    setText("");
    if (!hasScreens) { if (!spec.brief.trim()) { showToast("Write the brief first. It's the card on the canvas."); return; } run("chat", { text: t }, t); setPanel("claude"); return; }
    if (picked) run("chat", { text: t, target: { screenId: picked.screenId, elementId: picked.elementId } }, `${pickedScreen?.name ?? picked.screenId} · ${picked.elementId}: ${t}`);
    else if (selectedScreen) run("chat", { text: t, target: { screenId: selectedScreen.id } }, `${selectedScreen.name}: ${t}`);
    else run("chat", { text: t }, t);
    setPanel("claude");
  };
  const variants = () => {
    if (!target || running) return;
    const inspirationIds = canvas.edges.filter((e) => e.type === "magic" && e.target === `screen:${target.screenId}` && (!target.elementId || !e.targetElementId || e.targetElementId === target.elementId)).map((e) => e.source);
    run("variants", { target, count, direction: text.trim(), inspirationIds }, `${count} variants of ${targetLabel}${text.trim() ? `: ${text.trim()}` : ""}`);
    setText("");
  };
  const apply = () => { if (!running) run("regenerate", { changeRequests: pending }, `Apply ${pending.length} change${pending.length === 1 ? "" : "s"}`); setPanel("claude"); };
  const generate = () => { if (!spec.brief.trim()) { showToast("Write the brief first. It's the card on the canvas."); return; } run("generate", { brief: spec.brief }, "Generate from the brief"); setPanel("claude"); };

  const placeholder = !hasScreens ? "Ask about the brief, or press Generate" : picked ? `Change ${targetLabel}, or describe variants to explore…` : selectedScreen ? `Change ${selectedScreen.name}, or describe variants to explore…` : "Ask Claude to change something, anywhere in the flow…";

  return (
    <div className="composer-bar" onKeyDown={(e) => e.stopPropagation()}>
      <div className="cp-row">
        <input ref={inputRef} className="cp-input" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === "Escape") { (e.target as HTMLInputElement).blur(); } }} />
        {running && <button className="btn sm danger-soft" onClick={cancel} title="Stop Claude"><Icon name="stop" size={12} /> Stop</button>}
      </div>
      <div className="cp-row tools">
        {picked ? (
          <span className="cp-chip" title={`Claude will change only ${pickedScreen?.name ?? picked.screenId}`}>
            {pickedScreen && <span className="cp-thumb"><iframe title="" tabIndex={-1} src={api.shellUrl(projectId, pickedScreen.id, { follow: false })} style={{ width: spec.device.width, height: spec.device.height, transform: `scale(${22 / spec.device.width})` }} /></span>}
            <span className="cp-chip-text">{targetLabel}</span>
            <button className="x" onClick={() => setPicked(null)} aria-label="Clear target"><Icon name="x" size={11} /></button>
          </span>
        ) : selectedScreen ? (
          <span className="cp-chip"><Icon name="smartphone" size={12} /> <span className="cp-chip-text">{selectedScreen.name}</span></span>
        ) : hasScreens ? (
          <span className="cp-hint"><Icon name="crosshair" size={12} /> Press <span className="kbd">P</span> and click an element to target it</span>
        ) : null}
        {hasScreens && target && (
          <label className="cp-count">
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many variants">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} variants</option>)}</select>
            <Icon name="chevron-down" size={12} />
          </label>
        )}
        <span style={{ flex: 1 }} />
        {running ? (
          <span className="cp-status"><span className="pulse" /> {status || "Claude is working"}</span>
        ) : pending.length > 0 ? (
          <>
            <button className="btn sm ghost" onClick={() => setPanel("claude")}>{pending.length} queued change{pending.length === 1 ? "" : "s"}</button>
            <button className="btn sm primary" onClick={apply}><Icon name="wand" size={12} /> Apply changes</button>
          </>
        ) : !hasScreens ? (
          <button className="btn sm primary" onClick={generate}><Icon name="sparkles" size={12} /> Generate</button>
        ) : (
          <>
            {text.trim() && <button className="btn sm" onClick={send} title="Send to Claude (↵)"><Icon name="send" size={12} /> Send</button>}
            <button className="btn sm primary" disabled={!target} onClick={variants} title={target ? `Explore ${count} alternatives of ${targetLabel}` : "Select a screen or pick an element first"}><Icon name="sparkles" size={12} /> Generate variants</button>
          </>
        )}
      </div>
    </div>
  );
}
