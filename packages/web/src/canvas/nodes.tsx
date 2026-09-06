import React, { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, useConnection, useNodeId, type NodeProps } from "@xyflow/react";
import { ask } from "../components/Dialog";
import { classifyTransition, mainMoves, type CanvasNode, type DesignSpec, type EdgeCaseSpec, type ScreenSpec } from "@flow/shared";
import { api } from "../api";
import { useFlow, useHeadVersion, type Picked } from "../store";
import { Icon } from "../components/Icon";

type N<T extends CanvasNode["type"]> = NodeProps & { data: { node: Extract<CanvasNode, { type: T }>; spec: DesignSpec } };

/** While a connection is being dragged, the whole node becomes a drop target, so lines can land anywhere on it. */
function DropTarget() {
  const fromId = useConnection((c) => (c.inProgress ? c.fromNode?.id ?? "" : null));
  const id = useNodeId();
  if (fromId == null || fromId === id) return null;
  return <Handle type="target" position={Position.Left} id="drop" className="drop-target" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "none", borderRadius: 10, background: "rgba(184,54,139,.08)", border: "2px dashed var(--magic)", zIndex: 20, opacity: 1 }} />;
}

/* ---------- Screen node (prototype view): a live device frame running the runtime shell ---------- */
export const ScreenNode = memo(function ScreenNode({ data, selected }: N<"screen">) {
  const { node, spec } = data;
  const screen = spec.screens.find((s) => s.id === node.screenId);
  const projectId = useFlow((s) => s.projectId)!;
  const head = useHeadVersion();
  const frame = useFlow((s) => s.frames[node.screenId]);
  const setFrame = useFlow((s) => s.setFrame);
  const picker = useFlow((s) => s.picker.enabled);
  const picked = useFlow((s) => s.picker.picked);
  const setPicked = useFlow((s) => s.setPicked);
  const highlight = useFlow((s) => s.highlight);
  const preview = useFlow((s) => s.preview);
  const walk = useFlow((s) => s.walk);
  const setWalk = useFlow((s) => s.setWalk);
  const select = useFlow((s) => s.select);
  const ref = useRef<HTMLIFrameElement>(null);
  const [missing, setMissing] = useState(false);

  const post = (msg: Record<string, unknown>) => ref.current?.contentWindow?.postMessage({ source: "flow-host", ...msg }, "*");

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (!ref.current || ev.source !== ref.current.contentWindow) return;
      const d = ev.data;
      if (!d || d.source !== "flow-shell") return;
      if (d.type === "flow:navigated") { setFrame(node.screenId, { screenId: d.screenId, stateId: d.stateId }); setMissing(false); if (walk.active) setWalk({ screenId: d.screenId, stateId: d.stateId, lastTransitionId: d.transitionId ?? walk.lastTransitionId }); }
      else if (d.type === "flow:missing") setMissing(true);
      else if (d.type === "flow:picked") { setPicked({ screenId: d.screenId, elementId: d.elementId, label: d.label, rect: d.rect }); }
      else if (d.type === "flow:transition") { if (walk.active) setWalk({ lastTransitionId: d.transitionId }); }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [node.screenId, setFrame, setPicked, walk.active, walk.lastTransitionId, setWalk]);

  useEffect(() => { post({ type: "flow:picker", enabled: picker }); }, [picker]);
  useEffect(() => {
    const cur = frame?.screenId ?? node.screenId;
    post({ type: "flow:highlight", elementId: highlight && highlight.screenId === cur ? highlight.elementId : null });
  }, [highlight, frame?.screenId, node.screenId]);
  useEffect(() => {
    const cur = frame?.screenId ?? node.screenId;
    if (preview?.css !== undefined) post({ type: "flow:preview-tokens", css: preview.css });
    else if (preview && preview.screenId === cur && preview.elementId) post({ type: "flow:preview", elementId: preview.elementId, html: preview.html ?? null });
    else { post({ type: "flow:preview", elementId: null, html: null }); post({ type: "flow:preview-tokens", css: "" }); }
  }, [preview, frame?.screenId, node.screenId]);

  if (!screen) return null;
  const showing = spec.screens.find((s) => s.id === (frame?.screenId ?? node.screenId)) ?? screen;
  const edgeCases = spec.edgeCases.filter((e) => e.attachedTo.screenId === screen.id || spec.transitions.some((t) => t.id === e.attachedTo.transitionId && t.from.screenId === screen.id));
  const w = node.width ?? spec.device.width;
  const h = (node.height ?? spec.device.height) + 36;
  const isWalkHere = walk.active && walk.screenId === screen.id;

  return (
    <div className="screen-frame" style={{ width: w, height: h, outline: isWalkHere ? "3px solid var(--accent)" : undefined }}>
      <DropTarget />
      <Handle type="target" position={Position.Left} id="in" className="magic" style={{ top: 18 }} />
      <Handle type="source" position={Position.Right} id="out" className="magic" style={{ top: 18 }} />
      <div className="hdr" onDoubleClick={() => select({ kind: "node", id: node.id })}>
        <span className="name">{screen.name}</span>
        {showing.id !== screen.id && <button className="btn sm ghost" onClick={() => post({ type: "flow:goto", screenId: screen.id })} title="Back to this screen">↩ {showing.name}</button>}
        {edgeCases.length > 0 && <span className="pill warn" title={edgeCases.map((e) => e.scenario).join("\n")}>{edgeCases.length} edge {edgeCases.length === 1 ? "case" : "cases"}</span>}
        <div className="state">
          {showing.states.length > 0 && (
            <select className="nodrag" value={frame?.stateId ?? showing.states.find((s) => s.isDefault)?.id ?? ""} onChange={(e) => post({ type: "flow:setState", stateId: e.target.value })} title="State">
              {showing.states.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          )}
        </div>
        <button className="icon nodrag" title="Reload" onClick={() => post({ type: "flow:reload" })}>↻</button>
      </div>
      <div className="nodrag nowheel nopan" style={{ position: "relative", height: h - 36 }}>
        <iframe ref={ref} key={head} title={screen.name} src={api.shellUrl(projectId, screen.id)} />
        {missing && (
          <div className="empty" style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.92)" }}>
            <div>This screen has no file yet, or it could not be loaded.<br /><button className="btn sm" style={{ marginTop: 8 }} onClick={() => { setMissing(false); post({ type: "flow:reload" }); }}>Retry</button></div>
          </div>
        )}

      </div>
    </div>
  );
});

/** Floating editor on the picked element: say what should change, Claude edits only this screen. Rendered in screen space by the canvas. */
export function PickBubble({ picked, style }: { picked: Picked; style: React.CSSProperties }) {
  const [text, setText] = useState("");
  const running = useFlow((s) => s.agent.running);
  const editPicked = useFlow((s) => s.editPicked);
  const setPicked = useFlow((s) => s.setPicked);
  const run = useFlow((s) => s.run);
  const canvas = useFlow((s) => s.bundle!.canvas);
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const screenNodeId = `screen:${picked.screenId}`;
  const refs = canvas.nodes.filter((n) => n.type === "inspiration" || n.type === "skill");
  const attached = canvas.edges.filter((e) => e.type === "magic" && e.target === screenNodeId && e.targetElementId === picked.elementId);
  const attach = (nodeId: string) => {
    if (!nodeId || attached.some((e) => e.source === nodeId)) return;
    const src = refs.find((n) => n.id === nodeId);
    updateCanvas((c) => ({ ...c, edges: [...c.edges, { id: `magic-${Date.now().toString(36)}`, type: "magic", source: nodeId, target: screenNodeId, targetElementId: picked.elementId, relation: src?.type === "skill" ? "apply-skill" : "match-style", note: "" }] }));
  };
  const detach = (edgeId: string) => updateCanvas((c) => ({ ...c, edges: c.edges.filter((e) => e.id !== edgeId) }));
  const titleOf = (id: string) => { const n = refs.find((x) => x.id === id); return n ? n.title : id; };
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, [picked.elementId]);
  const send = () => { if (!text.trim() || running) return; editPicked(text); setText(""); };
  return (
    <div className="pick-bubble" style={style} onClick={(e) => e.stopPropagation()}>
      <div className="pb-head"><span className="mono">{picked.elementId}</span><span className="pb-label">{picked.label}</span><button className="btn sm icon ghost" onClick={() => setPicked(null)} aria-label="Dismiss"><Icon name="x" size={12} /></button></div>
      <textarea ref={ref} className="input" rows={2} value={text} placeholder="What should change here?" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === "Escape") setPicked(null); }} />
      {(attached.length > 0 || refs.length > 0) && (
        <div className="pb-refs">
          {attached.map((e) => <span key={e.id} className="ref-chip"><Icon name="sparkles" size={10} /> {titleOf(e.source)}<button onClick={() => detach(e.id)} aria-label="Remove reference"><Icon name="x" size={10} /></button></span>)}
          {refs.some((r) => !attached.some((e) => e.source === r.id)) && (
            <select className="ref-add" value="" onChange={(e) => attach(e.target.value)} aria-label="Attach a reference">
              <option value="">+ Attach reference</option>
              {refs.filter((r) => !attached.some((e) => e.source === r.id)).map((r) => <option key={r.id} value={r.id}>{r.type === "skill" ? "Skill: " : ""}{r.title}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="pb-actions">
        <button className="btn sm ghost" disabled={running} onClick={() => run("variants", { target: { screenId: picked.screenId, elementId: picked.elementId }, count: 3, direction: text.trim() }, `Variants of ${picked.elementId}${text.trim() ? `: ${text.trim()}` : ""}`)} title="Ask for three alternative treatments of this element"><Icon name="wand" size={12} /> Variants</button>
        <span style={{ flex: 1 }} />
        <button className="btn sm primary" disabled={running || !text.trim()} onClick={send}><Icon name="send" size={12} /> Edit with Claude</button>
      </div>
    </div>
  );
}

/* ---------- Screen card (flow view) ----------
 * Map level: thumbnail, name, purpose, then one row per forward move. Each row is where that move's line starts,
 * so the line never needs a floating label. Focus level (selected): states, edge cases, and return moves inline.
 */
export const ScreenCardNode = memo(function ScreenCardNode({ data }: N<"screen"> & { data: { expanded?: boolean; primaryMoves?: Record<string, string> } }) {
  const { node, spec } = data;
  const expanded = !!data.expanded;
  const mainId = mainMoves(spec, data.primaryMoves ?? {}).get(node.screenId);
  const screen = spec.screens.find((s) => s.id === node.screenId);
  const projectId = useFlow((s) => s.projectId)!;
  const head = useHeadVersion();
  const walk = useFlow((s) => s.walk);
  const selection = useFlow((s) => s.selection);
  const addChange = useFlow((s) => s.addChange);
  const select = useFlow((s) => s.select);
  if (!screen) return null;
  const outs = spec.transitions.filter((t) => t.from.screenId === screen.id);
  const forwards = outs.filter((t) => classifyTransition(t) === "forward");
  const backs = outs.filter((t) => classifyTransition(t) === "back");
  const stateMoves = outs.filter((t) => classifyTransition(t) === "state");
  const ecs = spec.edgeCases.filter((e) => e.attachedTo.screenId === screen.id || outs.some((t) => t.id === e.attachedTo.transitionId));
  const thumbW = 56;
  const scale = thumbW / spec.device.width;
  const thumbH = Math.round(Math.min(spec.device.height, spec.device.width * 1.6) * scale);
  const isWalkHere = walk.active && walk.screenId === screen.id;
  const nameOf = (id: string) => spec.screens.find((s) => s.id === id)?.name ?? id;
  const selectedTransition = selection?.kind === "transition" ? selection.id : null;
  const addState = async () => { const name = await ask("New state", { placeholder: "Loading, Empty, Error…" }); if (name?.trim()) addChange({ op: "add-state", screenId: screen.id, name: name.trim(), description: "" }); };
  const addEdgeCase = async () => {
    const sc = await ask("Edge case scenario", { placeholder: "What goes wrong or is unusual?" }); if (!sc?.trim()) return;
    const h = (await ask("How should the design handle it?", { multiline: true })) ?? "";
    addChange({ op: "add-edge-case", attachedTo: { screenId: screen.id }, scenario: sc.trim(), handling: h.trim(), severity: "medium" });
  };
  const port = { width: 8, height: 8, border: "2px solid var(--surface)", background: "var(--accent)" } as const;
  const moveRow = (t: (typeof outs)[number], back: boolean) => (
    <div key={t.id} className={`move ${back ? "back" : ""} ${t.id === mainId ? "main" : ""} ${selectedTransition === t.id ? "selected" : ""} nodrag`} onClick={(ev) => { ev.stopPropagation(); select({ kind: "transition", id: t.id }); }} title={t.id === mainId ? "Main move" : t.id}>
      <span className="trig">{back ? "↩ " : ""}{t.trigger}</span>
      <span className="to">{nameOf(t.to.screenId)}{t.to.stateId ? ` · ${t.to.stateId}` : ""}{t.condition && <span className="cond"> · if {t.condition}</span>}</span>
      <Handle type="source" position={Position.Right} id={`out:${t.id}`} style={{ ...port, top: "50%", transform: "translate(50%, -50%)", background: back ? "var(--ink-3)" : "var(--accent)" }} />
    </div>
  );
  return (
    <div className={`screen-card ${expanded ? "expanded" : ""}`} style={{ outline: isWalkHere ? "3px solid var(--accent)" : undefined }}>
      <DropTarget />
      <Handle type="target" position={Position.Left} id="in" style={{ ...port, top: 26, transform: "translate(-50%, -50%)" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ opacity: 0, width: 6, height: 6, top: 26 }} />
      <div className="hdr" onDoubleClick={() => select({ kind: "node", id: node.id })}>
        <div className="thumb" style={{ width: thumbW, height: thumbH }}>
          <iframe key={head} title="" tabIndex={-1} src={api.shellUrl(projectId, screen.id, { follow: false })} style={{ width: spec.device.width, height: spec.device.height, transform: `scale(${scale})` }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="name">{screen.name}</div>
          <div className="purpose">{screen.purpose}</div>
          <div className="counts">
            <span>{screen.states.length} {screen.states.length === 1 ? "state" : "states"}</span>
            {ecs.length > 0 && <span className={ecs.some((e) => e.severity === "high") ? "warn" : ""}>{ecs.length} edge {ecs.length === 1 ? "case" : "cases"}</span>}
            {backs.length > 0 && !expanded && <span title={backs.map((t) => `${t.trigger} → ${nameOf(t.to.screenId)}`).join("\n")}>↩ {backs.length}</span>}
          </div>
        </div>
      </div>
      <div className="moves">
        {expanded
          ? [...forwards].sort((a, b) => (a.id === mainId ? -1 : b.id === mainId ? 1 : 0)).map((t) => moveRow(t, false))
          : forwards.filter((t) => t.id === mainId).map((t) => moveRow(t, false))}
        {!expanded && forwards.length > 1 && <div className="move more">{forwards.length - 1} more {forwards.length - 1 === 1 ? "move" : "moves"}</div>}
        {forwards.length === 0 && <div className="move none">No onward moves</div>}
      </div>
      {expanded && (
        <div className="detail nowheel">
          <div className="sec">
            <h5>States</h5>
            {screen.states.map((st) => {
              const into = stateMoves.filter((t) => t.to.stateId === st.id);
              return (
                <div key={st.id} className={`state ${st.isDefault ? "default" : ""} ${isWalkHere && (walk.stateId === st.id || (!walk.stateId && st.isDefault)) ? "active" : ""}`}>
                  <Handle type="target" position={Position.Left} id={`in:${st.id}`} style={{ ...port, top: "50%", transform: "translate(-50%, -50%)" }} />
                  <span className="dot" />
                  <span className="nm">{st.name}</span>
                  <span className="tr" title={st.trigger}>{st.trigger}</span>
                  {into.map((t) => <span key={t.id} className="into nodrag" title={t.condition ? `if ${t.condition}` : ""} onClick={(e) => { e.stopPropagation(); select({ kind: "transition", id: t.id }); }}>← {t.trigger}{t.condition ? ` · if ${t.condition}` : ""}</span>)}
                </div>
              );
            })}
            {screen.states.length === 0 && <div className="muted small">No states declared</div>}
          </div>
          {ecs.length > 0 && (
            <div className="sec">
              <h5>Edge cases</h5>
              {ecs.map((e) => (
                <div key={e.id} className="ec nodrag" onClick={(ev) => { ev.stopPropagation(); select({ kind: "node", id: `edgecase:${e.id}` }); }}>
                  <span className={`sev ${e.severity}`} /><span className="sc">{e.scenario}</span>
                </div>
              ))}
            </div>
          )}
          {backs.length > 0 && (
            <div className="sec">
              <h5>Returns</h5>
              <div className="moves inset">{backs.map((t) => moveRow(t, true))}</div>
            </div>
          )}
          <div className="foot">
            <button className="add nodrag" onClick={addState}>+ state</button>
            <button className="add nodrag" onClick={addEdgeCase}>+ edge case</button>
            <span className="muted small" style={{ marginLeft: "auto" }}>{outs.length} out · {spec.transitions.filter((t) => t.to.screenId === screen.id && t.from.screenId !== screen.id).length} in</span>
          </div>
        </div>
      )}
    </div>
  );
});

/* ---------- Edge case ---------- */
export const EdgeCaseNode = memo(function EdgeCaseNode({ data }: N<"edgeCase">) {
  const ec = data.spec.edgeCases.find((e) => e.id === data.node.edgeCaseId) as EdgeCaseSpec | undefined;
  if (!ec) return null;
  const host = ec.attachedTo.transitionId ? `on transition ${ec.attachedTo.transitionId}` : "";
  return (
    <div className={`node-card edge-case ${ec.severity}`}>
      <DropTarget />
      <Handle type="target" position={Position.Left} id="in" className="magic" />
      <div className="hdr"><span className="kind">Edge case</span><span className={`pill ${ec.severity === "high" ? "err" : ec.severity === "low" ? "grey" : "warn"}`}>{ec.severity}</span></div>
      <div className="body" title={`${ec.scenario}\n\n${ec.handling}`}><b>{ec.scenario}</b><div className="handling">{ec.handling}</div>{host && <div className="muted small" style={{ marginTop: 4 }}>{host}</div>}</div>
    </div>
  );
});

/* ---------- Inspiration ---------- */
export const InspirationNode = memo(function InspirationNode({ data }: N<"inspiration">) {
  const n = data.node;
  const projectId = useFlow((s) => s.projectId)!;
  return (
    <div className="node-card inspiration" style={{ width: n.width ?? 240 }}>
      <DropTarget />
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <Handle type="target" position={Position.Left} id="in" className="magic" />
      <div className="hdr"><span className="kind">{n.kind === "url" ? "Web" : n.kind === "style" ? "Style" : n.kind === "text" ? "Text" : "Image"}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span></div>
      {n.kind === "image" && n.path && <img src={api.fileUrl(projectId, n.path)} alt={n.caption || n.title} draggable={false} />}
      {n.kind === "style" && n.text && <div className="body" style={{ display: "flex", gap: 8, alignItems: "center" }}>{/^#[0-9a-f]{3,8}$/i.test(n.text) && <span style={{ width: 28, height: 28, borderRadius: 6, background: n.text, border: "1px solid var(--line)" }} />}<span className="mono">{n.text}</span></div>}
      {n.kind === "text" && <div className="body" style={{ maxHeight: 160, overflow: "hidden" }}>{n.text}</div>}
      {n.kind === "url" && <div className="body"><a href={n.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{n.url}</a></div>}
      {(n.caption || n.description) && <div className="body muted small" style={{ borderTop: "1px solid var(--line-soft)" }}>{n.caption || n.description}</div>}
    </div>
  );
});

/* ---------- Skill ---------- */
export const SkillNode = memo(function SkillNode({ data }: N<"skill">) {
  const n = data.node;
  const projectId = useFlow((s) => s.projectId)!;
  const [text, setText] = useState("");
  useEffect(() => { fetch(api.fileUrl(projectId, n.path)).then((r) => r.text()).then(setText).catch(() => setText("")); }, [projectId, n.path]);
  return (
    <div className="node-card skill">
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <div className="hdr"><span className="kind">Skill</span>{n.title}</div>
      <div className="body">{text.slice(0, 600)}</div>
    </div>
  );
});

/* ---------- Prompt (brief or record) ---------- */
export const PromptNode = memo(function PromptNode({ data }: N<"prompt">) {
  const n = data.node;
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const saveSpec = useFlow((s) => s.saveSpec);
  const spec = data.spec;
  const [text, setText] = useState(n.text);
  useEffect(() => setText(n.text), [n.text]);
  if (n.kind === "record") {
    return (
      <div className="node-card prompt record">
        <Handle type="target" position={Position.Left} id="in" className="magic" />
        <div className="hdr"><span className="kind">Run</span><span className="mono muted">{n.runId}</span></div>
        <div className="body">{n.text}</div>
      </div>
    );
  }
  const commit = () => {
    if (text === n.text) return;
    updateCanvas((c) => ({ ...c, nodes: c.nodes.map((x) => (x.id === n.id && x.type === "prompt" ? { ...x, text } : x)) }));
    if (spec.screens.length === 0 || n.kind === "brief") void saveSpec((s) => ({ ...s, brief: text }), "Edited the brief");
  };
  return (
    <div className="node-card prompt">
      <DropTarget />
      <Handle type="target" position={Position.Left} id="in" className="magic" />
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <div className="hdr"><span className="kind">{n.kind === "brief" ? "Brief" : "Instruction"}</span>{n.kind === "brief" ? spec.name : ""}</div>
      <div className="body"><textarea className="nodrag nowheel" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} placeholder="Describe who this is for, what they need to do, and how it should feel." /></div>
    </div>
  );
});

/* ---------- Variant panel ---------- */
export const VariantPanelNode = memo(function VariantPanelNode({ data }: N<"variantPanel">) {
  const n = data.node;
  const spec = data.spec;
  const projectId = useFlow((s) => s.projectId)!;
  const head = useHeadVersion();
  const refresh = useFlow((s) => s.refresh);
  const showToast = useFlow((s) => s.showToast);
  const setPreview = useFlow((s) => s.setPreview);
  const [fragments, setFragments] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const files = [...n.options.map((o) => ({ id: o.id, file: o.file })), ...(n.originalFile ? [{ id: "original", file: n.originalFile }] : [])];
    Promise.all(files.map((o) => fetch(api.fileUrl(projectId, o.file)).then((r) => r.text()).then((t) => [o.id, t] as const).catch(() => [o.id, ""] as const)))
      .then((pairs) => { if (!cancelled) setFragments(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [n.options, n.originalFile, projectId, head]);
  const hoverIn = (o: { id: string; file: string }) => {
    const body = fragments[o.id];
    if (!body) return;
    if (o.file.endsWith(".css")) setPreview({ css: body });
    else if (n.target.elementId) setPreview({ screenId: n.target.screenId, elementId: n.target.elementId, html: body });
  };
  const hoverOut = () => setPreview(null);
  const screen = spec.screens.find((s) => s.id === n.target.screenId);
  const targetLabel = n.target.token ? `tokens: ${n.target.token}` : n.target.elementId ? `${screen?.name ?? n.target.screenId} · ${n.target.elementId}` : screen?.name ?? "project";
  const apply = async (optionId: string) => {
    try { await api.applyVariant(projectId, n.id, optionId); showToast("Variant applied. A new version was recorded."); await refresh(); }
    catch (e) { showToast(`Could not apply: ${(e as Error).message}`); }
  };
  return (
    <div className="node-card variant" style={{ width: n.width ?? 640 }}>
      <DropTarget />
      <Handle type="source" position={Position.Right} id="out" className="flow" />
      <Handle type="target" position={Position.Left} id="in" className="magic" />
      <div className="hdr"><span className="kind">Variants</span>{targetLabel}{n.direction && <span className="muted" style={{ fontWeight: 500 }}>· {n.direction}</span>}</div>
      {n.options.length === 0 && <div className="body muted">No options yet. Claude is working, or the run failed. Check the Claude panel.</div>}
      <div className="options">
        {n.originalFile && (
          <div className={`opt original ${!n.appliedId ? "applied" : ""}`} onMouseEnter={() => { const body = fragments.original; if (!body) return; if (n.originalFile!.endsWith(".css")) setPreview({ css: body }); else if (n.target.elementId) setPreview({ screenId: n.target.screenId, elementId: n.target.elementId, html: body }); }} onMouseLeave={hoverOut} title="What was there before any variant was applied">
            <VariantPreview projectId={projectId} head={head} spec={spec} screen={screen} elementId={n.target.elementId} file={n.originalFile} />
            <div className="meta">
              <b>Original</b>
              <div className="r">Before any variant was applied.</div>
              <button className={`btn sm ${!n.appliedId ? "" : "primary"} nodrag`} onClick={() => apply("original")} disabled={!n.appliedId}>{!n.appliedId ? "In place" : "Restore"}</button>
            </div>
          </div>
        )}
        {n.options.map((o) => (
          <div key={o.id} className={`opt ${n.appliedId === o.id ? "applied" : ""}`} onMouseEnter={() => hoverIn(o)} onMouseLeave={hoverOut} title="Hover to preview in the prototype">
            <VariantPreview projectId={projectId} head={head} spec={spec} screen={screen} elementId={n.target.elementId} file={o.file} />
            <div className="meta">
              <b>{o.label}</b>
              <div className="r">{o.rationale}</div>
              <button className={`btn sm ${n.appliedId === o.id ? "" : "primary"} nodrag`} onClick={() => apply(o.id)} disabled={n.appliedId === o.id}>{n.appliedId === o.id ? "Applied" : "Apply"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

function VariantPreview({ projectId, head, spec, screen, elementId, file }: { projectId: string; head: string; spec: DesignSpec; screen?: ScreenSpec; elementId?: string; file: string }) {
  const [doc, setDoc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const frag = await fetch(api.fileUrl(projectId, file)).then((r) => r.text()).catch(() => "");
      if (cancelled) return;
      if (file.endsWith(".css")) {
        // token variant: show the palette swatches
        const vars = [...frag.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)];
        setDoc(`<!doctype html><body style="margin:0;padding:10px;font:12px system-ui;display:grid;gap:6px">${vars.map((m) => `<div style="display:flex;gap:8px;align-items:center"><span style="width:22px;height:22px;border-radius:5px;background:${m[2]};border:1px solid #ddd"></span>${m[1]}</div>`).join("")}</body>`);
      } else if (elementId && screen) {
        const full = await fetch(api.fileUrl(projectId, screen.file)).then((r) => r.text()).catch(() => "");
        if (cancelled) return;
        const base = `<base href="${location.origin}${api.fileUrl(projectId, "screens/")}">`;
        // Show the fragment alone on the screen's stylesheet so it reads at full size.
        const head = full.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '<link rel="stylesheet" href="../tokens.css">';
        setDoc(`<!doctype html><html><head>${base}${head}<style>body{padding:12px;}</style></head><body>${frag}</body></html>`);
      } else {
        const base = `<base href="${location.origin}${api.fileUrl(projectId, "screens/")}">`;
        setDoc(frag.replace(/<head[^>]*>/i, (m) => m + base));
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, head, file, elementId, screen]);
  if (doc == null) return <div className="muted small" style={{ padding: 8 }}>Loading…</div>;
  const scale = elementId ? 0.6 : 180 / spec.device.width;
  return <div className="nodrag nowheel" style={{ overflow: "hidden", position: "relative" }}><iframe title="variant" srcDoc={doc} sandbox="allow-same-origin" style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none" }} /></div>;
}

/* ---------- Note ---------- */
export const NoteNode = memo(function NoteNode({ data }: N<"note">) {
  const n = data.node;
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const [text, setText] = useState(n.text);
  useEffect(() => setText(n.text), [n.text]);
  return (
    <div className="node-card note" style={{ width: n.width ?? 240 }}>
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <div className="body"><textarea className="nodrag nowheel" value={text} placeholder="Note" onChange={(e) => setText(e.target.value)} onBlur={() => text !== n.text && updateCanvas((c) => ({ ...c, nodes: c.nodes.map((x) => (x.id === n.id && x.type === "note" ? { ...x, text } : x)) }))} /></div>
    </div>
  );
});

/* ---------- Version pin ---------- */
export const VersionPinNode = memo(function VersionPinNode({ data }: N<"versionPin">) {
  const n = data.node;
  const setPreviewVersion = useFlow((s) => s.setPreviewVersion);
  return (
    <div className="node-card version-pin">
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <div className="hdr"><span className="kind">Version</span>{n.label}</div>
      <div className="body"><span className="mono muted">{n.versionId.slice(0, 8)}</span> <button className="btn sm nodrag" style={{ marginLeft: 8 }} onClick={() => setPreviewVersion(n.versionId)}>Preview</button></div>
    </div>
  );
});

/* ---------- Group ---------- */
export const GroupNode = memo(function GroupNode({ data }: N<"group">) {
  const n = data.node;
  return (
    <div className="node-card group" style={{ width: n.width, height: n.height }}>
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <div className="hdr">{n.title}</div>
    </div>
  );
});

export const nodeTypes = {
  screen: ScreenNode,
  screenCard: ScreenCardNode,
  edgeCase: EdgeCaseNode,
  inspiration: InspirationNode,
  skill: SkillNode,
  prompt: PromptNode,
  variantPanel: VariantPanelNode,
  note: NoteNode,
  versionPin: VersionPinNode,
  group: GroupNode
};
