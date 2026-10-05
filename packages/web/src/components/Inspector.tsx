import { useEffect, useState } from "react";
import { MAGIC_RELATION_LABELS, classifyTransition, mainMoves, type CanvasEdge, type CanvasNode, type MagicRelation, type ScreenSpec, type TransitionSpec, type EdgeCaseSpec, type Severity, type Animation } from "@flow/shared";
import { api } from "../api";
import { useFlow } from "../store";
import { ask, confirm } from "../components/Dialog";

export function Inspector() {
  const bundle = useFlow((s) => s.bundle)!;
  const selection = useFlow((s) => s.selection);
  const { spec, canvas } = bundle;

  if (!selection) return <div className="inspector"><ProjectOverview /></div>;
  if (selection.kind === "transition") {
    const t = spec.transitions.find((x) => x.id === selection.id);
    return <div className="inspector">{t ? <TransitionPanel t={t} /> : <div className="empty">That transition no longer exists.</div>}</div>;
  }
  if (selection.kind === "edge") {
    const e = canvas.edges.find((x) => x.id === selection.id);
    return <div className="inspector">{e ? <EdgePanel e={e} /> : <div className="empty">That line no longer exists.</div>}</div>;
  }
  const n = canvas.nodes.find((x) => x.id === selection.id);
  if (!n) return <div className="inspector"><div className="empty">Nothing selected.</div></div>;
  return (
    <div className="inspector">
      {n.type === "screen" && <ScreenPanel node={n} />}
      {n.type === "edgeCase" && <EdgeCasePanel node={n} />}
      {n.type === "inspiration" && <InspirationPanel node={n} />}
      {n.type === "skill" && <SkillPanel node={n} />}
      {n.type === "prompt" && <PromptPanel node={n} />}
      {n.type === "variantPanel" && <VariantPanel node={n} />}
      {n.type === "note" && <GenericPanel title="Note" node={n} />}
      {n.type === "versionPin" && <VersionPinPanel node={n} />}
      {n.type === "group" && <GenericPanel title="Group" node={n} />}
    </div>
  );
}

/** Click-to-edit text. Enter or blur commits, Escape cancels. Keeps one-field edits out of modal dialogs. */
function InlineText({ value, onCommit, multiline, allowEmpty, placeholder, className }: { value: string; onCommit: (v: string) => void; multiline?: boolean; allowEmpty?: boolean; placeholder?: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const cancel = () => { setDraft(value); setEditing(false); };
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v === value.trim()) return;
    if (v || allowEmpty) onCommit(v); else setDraft(value);
  };
  if (!editing) {
    return (
      <span className={`inline-text ${className ?? ""}`} title="Click to edit" role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}>
        {value || <span className="muted">{placeholder ?? "Empty"}</span>}
      </span>
    );
  }
  if (multiline) {
    return <textarea className={`input ${className ?? ""}`} value={draft} autoFocus rows={3} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(); }} />;
  }
  return <input className={`input ${className ?? ""}`} value={draft} autoFocus placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter") commit(); }} />;
}

function ProjectOverview() {
  const bundle = useFlow((s) => s.bundle)!;
  const { spec, versions } = bundle;
  return (
    <>
      <div className="sec"><h2>{spec.name}</h2><div className="muted small">{spec.device.kind} · {spec.device.width}×{spec.device.height}</div></div>
      <div className="sec">
        <h3>At a glance</h3>
        <div className="row"><span className="grow">Screens</span><b>{spec.screens.length}</b></div>
        <div className="row"><span className="grow">States</span><b>{spec.screens.reduce((a, s) => a + s.states.length, 0)}</b></div>
        <div className="row"><span className="grow">Transitions</span><b>{spec.transitions.length}</b></div>
        <div className="row"><span className="grow">Edge cases</span><b>{spec.edgeCases.length}</b></div>
        <div className="row"><span className="grow">Versions</span><b>{versions.length}</b></div>
      </div>
      <div className="sec">
        <h3>Brief</h3>
        <div className="small" style={{ lineHeight: 1.5, color: "var(--ink-2)" }}>{spec.brief || "No brief yet. Edit the Brief card on the canvas."}</div>
      </div>
      <div className="sec muted small" style={{ lineHeight: 1.6 }}>
        Select a screen, transition, or reference to inspect it. Drag from a reference's right handle to a screen to say how it should influence it. Press <span className="kbd">?</span> for every shortcut.
      </div>
    </>
  );
}

function ScreenPanel({ node }: { node: Extract<CanvasNode, { type: "screen" }> }) {
  const bundle = useFlow((s) => s.bundle)!;
  const addChange = useFlow((s) => s.addChange);
  const select = useFlow((s) => s.select);
  const setHighlight = useFlow((s) => s.setHighlight);
  const highlight = useFlow((s) => s.highlight);
  const picked = useFlow((s) => s.picker.picked);
  const run = useFlow((s) => s.run);
  const running = useFlow((s) => s.agent.running);
  const setComposerDraft = useFlow((s) => s.setComposerDraft);
  const { spec, canvas, versions } = bundle;
  const screen = spec.screens.find((s) => s.id === node.screenId) as ScreenSpec | undefined;
  const [variantDir, setVariantDir] = useState("");
  const [variantCount, setVariantCount] = useState(3);
  if (!screen) return <div className="empty">Screen missing from the spec.</div>;
  const outs = spec.transitions.filter((t) => t.from.screenId === screen.id);
  const ins = spec.transitions.filter((t) => t.to.screenId === screen.id && t.from.screenId !== screen.id);
  const ecs = spec.edgeCases.filter((e) => e.attachedTo.screenId === screen.id || outs.some((t) => t.id === e.attachedTo.transitionId));
  const touched = versions.filter((v) => v.screens.includes(screen.id));
  const pickedHere = picked && picked.screenId === screen.id ? picked : null;
  const requestVariants = () => {
    const inspirationIds = canvas.edges.filter((e) => e.type === "magic" && e.target === node.id).map((e) => e.source);
    run("variants", { target: { screenId: screen.id, elementId: pickedHere?.elementId }, count: variantCount, direction: variantDir, inspirationIds }, `Variants of ${pickedHere ? pickedHere.elementId + " on " : ""}${screen.name}${variantDir ? `: ${variantDir}` : ""}`);
  };
  return (
    <>
      <div className="sec">
        <h2><InlineText value={screen.name} onCommit={(name) => addChange({ op: "rename-screen", screenId: screen.id, name })} /></h2>
        <div className="small" style={{ color: "var(--ink-2)", lineHeight: 1.45 }}><InlineText multiline value={screen.purpose} placeholder="What this screen is for" onCommit={(purpose) => addChange({ op: "update-screen-purpose", screenId: screen.id, purpose })} /></div>
        <div className="muted small" style={{ marginTop: 4 }}>Edits here queue as changes. Apply them from the Claude panel.</div>
        <div className="row mono muted">{screen.file}</div>
      </div>
      <div className="sec">
        <div className="row"><h3 style={{ flex: 1, margin: 0 }}>States</h3><button className="btn sm ghost" onClick={async () => { const nm = await ask("New state", { placeholder: "Loading, Empty, Error…" }); if (nm?.trim()) addChange({ op: "add-state", screenId: screen.id, name: nm.trim(), description: "" }); }}>+ Add</button></div>
        <div className="list">
          {screen.states.map((st) => (
            <div key={st.id} className="item">
              <span className={`pill ${st.isDefault ? "" : "grey"}`}>{st.isDefault ? "default" : st.id}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{st.name}</b>{st.description && <div className="muted">{st.description}</div>}</span>
              {!st.isDefault && <button className="x" title="Remove state" onClick={() => addChange({ op: "remove-state", screenId: screen.id, stateId: st.id })}>×</button>}
            </div>
          ))}
        </div>
      </div>
      <div className="sec">
        <h3>Elements</h3>
        <div className="list">
          {screen.elements.map((el) => (
            <div key={el.id} className={`item clickable`} style={{ borderColor: highlight?.elementId === el.id && highlight.screenId === screen.id ? "var(--magic)" : pickedHere?.elementId === el.id ? "var(--accent)" : undefined }}
              onMouseEnter={() => setHighlight({ screenId: screen.id, elementId: el.id })} onMouseLeave={() => setHighlight(null)}
              onClick={() => useFlow.getState().setPicked({ screenId: screen.id, elementId: el.id, label: el.label })}>
              <span className="mono muted">{el.id}</span><span style={{ flex: 1 }}>{el.label}</span><span className="pill grey">{el.role}</span>
            </div>
          ))}
          {screen.elements.length === 0 && <div className="muted small">No elements declared.</div>}
        </div>
      </div>
      <div className="sec">
        <h3>Transitions</h3>
        <div className="list">
          {outs.map((t) => <div key={t.id} className="item clickable" onClick={() => select({ kind: "transition", id: t.id })}><span>→</span><span style={{ flex: 1 }}>{t.trigger}{t.condition && <span className="muted"> · if {t.condition}</span>}</span><span className="muted">{spec.screens.find((s) => s.id === t.to.screenId)?.name}{t.to.stateId ? `#${t.to.stateId}` : ""}</span></div>)}
          {ins.map((t) => <div key={t.id} className="item clickable" onClick={() => select({ kind: "transition", id: t.id })}><span>←</span><span style={{ flex: 1 }}>{t.trigger}</span><span className="muted">from {spec.screens.find((s) => s.id === t.from.screenId)?.name}</span></div>)}
          {outs.length + ins.length === 0 && <div className="muted small">No transitions. In flow view, drag from this screen's right handle to another screen.</div>}
        </div>
      </div>
      <div className="sec">
        <div className="row"><h3 style={{ flex: 1, margin: 0 }}>Edge cases</h3><button className="btn sm ghost" onClick={async () => { const sc = await ask("Edge case", { placeholder: "Scenario" }); if (!sc?.trim()) return; const h = (await ask("Handling", { placeholder: "How is it handled?" })) ?? ""; addChange({ op: "add-edge-case", attachedTo: { screenId: screen.id }, scenario: sc.trim(), handling: h.trim(), severity: "medium" }); }}>+ Add</button></div>
        <div className="list">
          {ecs.map((e) => <div key={e.id} className="item clickable" onClick={() => select({ kind: "node", id: `edgecase:${e.id}` })}><span className={`pill ${e.severity === "high" ? "err" : e.severity === "low" ? "grey" : "warn"}`}>{e.severity}</span><span style={{ flex: 1 }}>{e.scenario}</span></div>)}
          {ecs.length === 0 && <div className="muted small">None yet.</div>}
        </div>
      </div>
      <div className="sec">
        <h3>Variants</h3>
        <div className="muted small" style={{ marginBottom: 6 }}>{pickedHere ? <>Target: element <b>{pickedHere.elementId}</b>. Clear the pick to target the whole screen.</> : <>Target: the whole screen. Press <span className="kbd">P</span> and click inside the prototype to target one element.</>}</div>
        <div className="field"><label>Direction (optional)</label><input className="input" value={variantDir} onChange={(e) => setVariantDir(e.target.value)} placeholder="warmer, more editorial, denser…" /></div>
        <div className="row"><select className="input" style={{ width: 70 }} value={variantCount} onChange={(e) => setVariantCount(Number(e.target.value))}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select><button className="btn primary" disabled={running || !screen.file} onClick={requestVariants}>Generate variants</button></div>
      </div>
      <div className="sec">
        <h3>Influences</h3>
        {screen.provenance.length === 0 && <div className="muted small">No references recorded for this screen yet.</div>}
        <div className="list">{screen.provenance.map((p, i) => { const src = canvas.nodes.find((n) => n.id === p.sourceNodeId); const title = src ? ("title" in src ? src.title : src.type) : p.sourceNodeId; const rel = p.relation as MagicRelation; return <div key={i} className="item clickable" onClick={() => select({ kind: "node", id: p.sourceNodeId })}><span className="pill magic">{MAGIC_RELATION_LABELS[rel]?.label ?? p.relation}</span><span style={{ flex: 1 }}>{title}</span></div>; })}</div>
      </div>
      <div className="sec" style={{ display: "grid", gap: 6 }}>
        <button className="btn" onClick={() => { setComposerDraft(`On the ${screen.name} screen, `); useFlow.getState().setPanel("claude"); }}>Ask Claude about this screen</button>
        <button className="btn ghost" onClick={() => useFlow.getState().setPanel("history")}>{touched.length} version{touched.length === 1 ? "" : "s"} touched this screen</button>
        <button className="btn danger ghost" onClick={async () => (await confirm(`Remove "${screen.name}"?`, "Queued as a change. Nothing is rewritten until you apply.")) && addChange({ op: "remove-screen", screenId: screen.id })}>Remove screen</button>
      </div>
    </>
  );
}

function TransitionPanel({ t }: { t: TransitionSpec }) {
  const spec = useFlow((s) => s.bundle!.spec);
  const canvas = useFlow((s) => s.bundle!.canvas);
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const addChange = useFlow((s) => s.addChange);
  const select = useFlow((s) => s.select);
  const isMain = mainMoves(spec, canvas.primaryMoves).get(t.from.screenId) === t.id;
  const isForward = classifyTransition(t) === "forward";
  const from = spec.screens.find((s) => s.id === t.from.screenId);
  const to = spec.screens.find((s) => s.id === t.to.screenId);
  const ecs = spec.edgeCases.filter((e) => e.attachedTo.transitionId === t.id);
  return (
    <>
      <div className="sec"><span className="pill">Transition</span><h2 style={{ marginTop: 6 }}>{t.trigger}</h2><div className="mono muted">{t.id}</div></div>
      <div className="sec">
        <div className="row"><span className="muted">From</span><span className="grow" style={{ cursor: "pointer" }} onClick={() => from && select({ kind: "node", id: `screen:${from.id}` })}>{from?.name}{t.from.elementId && <span className="mono muted"> · {t.from.elementId}</span>}</span></div>
        <div className="row"><span className="muted">To</span><span className="grow" style={{ cursor: "pointer" }} onClick={() => to && select({ kind: "node", id: `screen:${to.id}` })}>{to?.name}{t.to.stateId && <span className="mono muted"> #{t.to.stateId}</span>}</span></div>
        <div className="row"><span className="muted">Trigger</span><span className="grow"><InlineText value={t.trigger} onCommit={(trigger) => addChange({ op: "update-transition", transitionId: t.id, patch: { trigger } })} /></span></div>
        <div className="row"><span className="muted">Condition</span><span className="grow"><InlineText allowEmpty value={t.condition ?? ""} placeholder="none · click to add a branch condition" onCommit={(condition) => addChange({ op: "update-transition", transitionId: t.id, patch: { condition: condition || null } })} /></span></div>
        <div className="row"><span className="muted">Animation</span>
          <select className="input" style={{ width: 110 }} value={t.animation} onChange={(e) => addChange({ op: "update-transition", transitionId: t.id, patch: { animation: e.target.value as Animation } })}>
            {["push", "pop", "fade", "modal", "none"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <div className="sec">
        <div className="row"><h3 style={{ flex: 1, margin: 0 }}>Edge cases</h3><button className="btn sm ghost" onClick={async () => { const sc = await ask("Edge case", { placeholder: "Scenario" }); if (!sc?.trim()) return; const h = (await ask("Handling", { placeholder: "How is it handled?" })) ?? ""; addChange({ op: "add-edge-case", attachedTo: { transitionId: t.id }, scenario: sc.trim(), handling: h.trim(), severity: "medium" }); }}>+ Add</button></div>
        <div className="list">{ecs.map((e) => <div key={e.id} className="item clickable" onClick={() => select({ kind: "node", id: `edgecase:${e.id}` })}><span className={`pill ${e.severity === "high" ? "err" : "warn"}`}>{e.severity}</span><span style={{ flex: 1 }}>{e.scenario}</span></div>)}{ecs.length === 0 && <div className="muted small">None.</div>}</div>
      </div>
      {isForward && (
        <div className="sec">
          {isMain ? <div className="muted small">This is the main move from {from?.name}. It is drawn on the map; the others show when the screen is focused.</div>
            : <button className="btn" style={{ width: "100%" }} onClick={() => updateCanvas((c) => ({ ...c, primaryMoves: { ...c.primaryMoves, [t.from.screenId]: t.id } }))}>Make this the main move from {from?.name}</button>}
        </div>
      )}
      <div className="sec"><button className="btn danger ghost" style={{ width: "100%" }} onClick={() => addChange({ op: "remove-transition", transitionId: t.id })}>Remove transition</button></div>
    </>
  );
}

function EdgeCasePanel({ node }: { node: Extract<CanvasNode, { type: "edgeCase" }> }) {
  const spec = useFlow((s) => s.bundle!.spec);
  const addChange = useFlow((s) => s.addChange);
  const select = useFlow((s) => s.select);
  const ec = spec.edgeCases.find((e) => e.id === node.edgeCaseId) as EdgeCaseSpec | undefined;
  if (!ec) return <div className="empty">Edge case missing.</div>;
  const edit = async (field: "scenario" | "handling") => { const v = await ask(field === "scenario" ? "Scenario" : "Handling", { initial: ec[field], multiline: true }); if (v && v.trim() && v !== ec[field]) addChange({ op: "update-edge-case", edgeCaseId: ec.id, patch: { [field]: v.trim() } }); };
  return (
    <>
      <div className="sec"><span className={`pill ${ec.severity === "high" ? "err" : ec.severity === "low" ? "grey" : "warn"}`}>Edge case · {ec.severity}</span><h2 style={{ marginTop: 6 }}>{ec.scenario}</h2></div>
      <div className="sec">
        <div className="row"><span className="muted">Scenario</span><span className="grow" style={{ whiteSpace: "normal" }}>{ec.scenario}</span><button className="btn sm ghost" onClick={() => edit("scenario")}>Edit</button></div>
        <div className="row"><span className="muted">Handling</span><span className="grow" style={{ whiteSpace: "normal" }}>{ec.handling}</span><button className="btn sm ghost" onClick={() => edit("handling")}>Edit</button></div>
        <div className="row"><span className="muted">Severity</span><select className="input" style={{ width: 100 }} value={ec.severity} onChange={(e) => addChange({ op: "update-edge-case", edgeCaseId: ec.id, patch: { severity: e.target.value as Severity } })}>{["low", "medium", "high"].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="row"><span className="muted">Attached to</span><span className="grow" style={{ cursor: "pointer" }} onClick={() => ec.attachedTo.screenId ? select({ kind: "node", id: `screen:${ec.attachedTo.screenId}` }) : ec.attachedTo.transitionId && select({ kind: "transition", id: ec.attachedTo.transitionId })}>{ec.attachedTo.screenId ? spec.screens.find((s) => s.id === ec.attachedTo.screenId)?.name : `transition ${ec.attachedTo.transitionId}`}</span></div>
      </div>
      <div className="sec"><button className="btn danger ghost" style={{ width: "100%" }} onClick={() => addChange({ op: "remove-edge-case", edgeCaseId: ec.id })}>Remove edge case</button></div>
    </>
  );
}

function InspirationPanel({ node }: { node: Extract<CanvasNode, { type: "inspiration" }> }) {
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const run = useFlow((s) => s.run);
  const running = useFlow((s) => s.agent.running);
  const canvas = useFlow((s) => s.bundle!.canvas);
  const spec = useFlow((s) => s.bundle!.spec);
  const [caption, setCaption] = useState(node.caption);
  useEffect(() => setCaption(node.caption), [node.caption]);
  const save = () => updateCanvas((c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === node.id && n.type === "inspiration" ? { ...n, caption } : n)) }));
  const targets = canvas.edges.filter((e) => e.type === "magic" && e.source === node.id);
  return (
    <>
      <div className="sec"><span className="pill magic">{node.kind}</span><h2 style={{ marginTop: 6 }}>{node.title}</h2></div>
      <div className="sec"><div className="field"><label>Caption</label><textarea className="input" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={save} placeholder="What you like about it, in your words" /></div></div>
      <div className="sec">
        <h3>Description</h3>
        <div className="small" style={{ lineHeight: 1.5, color: "var(--ink-2)" }}>{node.description || <span className="muted">Not described yet.</span>}</div>
        {node.kind === "image" && <button className="btn sm" style={{ marginTop: 8 }} disabled={running} onClick={() => run("describe", { nodeId: node.id }, `Describe "${node.title}"`)}>Describe with Claude</button>}
      </div>
      <div className="sec">
        <h3>Influences</h3>
        <div className="list">{targets.map((e) => { const t = canvas.nodes.find((n) => n.id === e.target); const name = t?.type === "screen" ? spec.screens.find((s) => s.id === t.screenId)?.name : t?.type === "prompt" ? "the whole project" : t?.type; return <div key={e.id} className="item"><span className="pill magic">{MAGIC_RELATION_LABELS[(e.relation ?? "free-text") as MagicRelation].label}</span><span style={{ flex: 1 }}>{name}</span></div>; })}{targets.length === 0 && <div className="muted small">Not connected. Drag from the node's right handle to a screen or the brief.</div>}</div>
      </div>
      <div className="sec"><button className="btn danger ghost" style={{ width: "100%" }} onClick={() => { updateCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== node.id), edges: c.edges.filter((e) => e.source !== node.id && e.target !== node.id) })); useFlow.getState().select(null); }}>Remove from canvas</button></div>
    </>
  );
}

function SkillPanel({ node }: { node: Extract<CanvasNode, { type: "skill" }> }) {
  const projectId = useFlow((s) => s.projectId)!;
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const [text, setText] = useState("");
  useEffect(() => { fetch(api.fileUrl(projectId, node.path)).then((r) => r.text()).then(setText).catch(() => setText("")); }, [projectId, node.path]);
  return (
    <>
      <div className="sec"><span className="pill magic">Skill</span><h2 style={{ marginTop: 6 }}>{node.title}</h2><div className="mono muted">{node.path}</div></div>
      <div className="sec"><pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 400, overflow: "auto", color: "var(--ink-2)" }}>{text}</pre></div>
      <div className="sec"><button className="btn danger ghost" style={{ width: "100%" }} onClick={() => { updateCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== node.id), edges: c.edges.filter((e) => e.source !== node.id && e.target !== node.id) })); useFlow.getState().select(null); }}>Remove from canvas</button></div>
    </>
  );
}

function PromptPanel({ node }: { node: Extract<CanvasNode, { type: "prompt" }> }) {
  const addChange = useFlow((s) => s.addChange);
  const spec = useFlow((s) => s.bundle!.spec);
  return (
    <>
      <div className="sec"><span className="pill">{node.kind}</span><h2 style={{ marginTop: 6 }}>{node.kind === "brief" ? "Project brief" : node.kind === "record" ? "Generation record" : "Instruction"}</h2></div>
      <div className="sec small" style={{ lineHeight: 1.5, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{node.text}</div>
      {node.kind === "brief" && spec.screens.length > 0 && <div className="sec"><button className="btn" style={{ width: "100%" }} onClick={() => addChange({ op: "update-brief", brief: spec.brief })}>Queue a full regeneration from this brief</button><div className="muted small" style={{ marginTop: 6 }}>Rewrites every screen. Use sparingly; prefer targeted changes.</div></div>}
    </>
  );
}

function VariantPanel({ node }: { node: Extract<CanvasNode, { type: "variantPanel" }> }) {
  const run = useFlow((s) => s.run);
  const running = useFlow((s) => s.agent.running);
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const [dir, setDir] = useState(node.direction);
  return (
    <>
      <div className="sec"><span className="pill">Variants</span><h2 style={{ marginTop: 6 }}>{node.target.elementId ?? node.target.token ?? node.target.screenId}</h2><div className="muted small">{node.options.length} options{node.appliedId ? ` · applied ${node.appliedId}` : ""}</div></div>
      <div className="sec">
        <div className="field"><label>Direction</label><input className="input" value={dir} onChange={(e) => setDir(e.target.value)} /></div>
        <button className="btn primary" disabled={running} onClick={() => run("variants", { target: node.target, count: 3, direction: dir, nodeId: node.id }, `More variants: ${dir || "same direction"}`)}>Generate 3 more</button>
      </div>
      <div className="sec"><button className="btn danger ghost" style={{ width: "100%" }} onClick={() => { updateCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== node.id), edges: c.edges.filter((e) => e.source !== node.id && e.target !== node.id) })); useFlow.getState().select(null); }}>Remove panel</button></div>
    </>
  );
}

function VersionPinPanel({ node }: { node: Extract<CanvasNode, { type: "versionPin" }> }) {
  const setPreviewVersion = useFlow((s) => s.setPreviewVersion);
  const restoreVersion = useFlow((s) => s.restoreVersion);
  return (
    <>
      <div className="sec"><span className="pill">Pinned version</span><h2 style={{ marginTop: 6 }}>{node.label}</h2><div className="mono muted">{node.versionId}</div></div>
      <div className="sec" style={{ display: "grid", gap: 6 }}><button className="btn" onClick={() => setPreviewVersion(node.versionId)}>Preview</button><button className="btn" onClick={async () => (await confirm("Restore this version?", "The current state stays in history as its own version.")) && restoreVersion(node.versionId)}>Restore</button></div>
    </>
  );
}

function GenericPanel({ title, node }: { title: string; node: CanvasNode }) {
  const updateCanvas = useFlow((s) => s.updateCanvas);
  return (
    <>
      <div className="sec"><span className="pill grey">{title}</span></div>
      <div className="sec"><button className="btn danger ghost" style={{ width: "100%" }} onClick={() => { updateCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== node.id), edges: c.edges.filter((e) => e.source !== node.id && e.target !== node.id) })); useFlow.getState().select(null); }}>Remove</button></div>
    </>
  );
}

function EdgePanel({ e }: { e: CanvasEdge }) {
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const canvas = useFlow((s) => s.bundle!.canvas);
  const spec = useFlow((s) => s.bundle!.spec);
  const src = canvas.nodes.find((n) => n.id === e.source);
  const tgt = canvas.nodes.find((n) => n.id === e.target);
  const name = (n?: CanvasNode) => (!n ? "?" : n.type === "screen" ? spec.screens.find((s) => s.id === n.screenId)?.name ?? n.screenId : "title" in n ? n.title : n.type);
  const patch = (p: Partial<CanvasEdge>) => updateCanvas((c) => ({ ...c, edges: c.edges.map((x) => (x.id === e.id ? { ...x, ...p } : x)) }));
  return (
    <>
      <div className="sec"><span className={`pill ${e.type === "magic" ? "magic" : ""}`}>{e.type === "magic" ? "Magic line" : "Variant link"}</span><h2 style={{ marginTop: 6 }}>{name(src)} → {name(tgt)}{e.targetElementId ? ` · ${e.targetElementId}` : ""}</h2></div>
      {e.type === "magic" && (
        <div className="sec">
          <div className="field"><label>Relation</label><select className="input" value={e.relation ?? "free-text"} onChange={(ev) => patch({ relation: ev.target.value as MagicRelation })}>{(Object.keys(MAGIC_RELATION_LABELS) as MagicRelation[]).map((r) => <option key={r} value={r}>{MAGIC_RELATION_LABELS[r].label}</option>)}</select></div>
          <div className="field"><label>Note</label><textarea className="input" defaultValue={e.note} onBlur={(ev) => patch({ note: ev.target.value })} placeholder="Anything specific about how to apply it" /></div>
        </div>
      )}
      <div className="sec"><button className="btn danger ghost" style={{ width: "100%" }} onClick={() => { updateCanvas((c) => ({ ...c, edges: c.edges.filter((x) => x.id !== e.id) })); useFlow.getState().select(null); }}>Remove line</button></div>
    </>
  );
}
