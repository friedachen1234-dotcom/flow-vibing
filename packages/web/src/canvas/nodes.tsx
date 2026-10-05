import React, { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, useConnection, useNodeId, type NodeProps } from "@xyflow/react";
import { classifyTransition, mainMoves, type CanvasNode, type DesignSpec, type EdgeCaseSpec, type ScreenSpec } from "@flow/shared";
import { api } from "../api";
import { useFlow, useHeadVersion } from "../store";
import { Icon } from "../components/Icon";

type N<T extends CanvasNode["type"]> = NodeProps & { data: { node: Extract<CanvasNode, { type: T }>; spec: DesignSpec } };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Where the line to a screen's exploration leaves and lands: the same x on the screen and on the panel below it, right of the edge-case stack. */
export const RAIL_X = 282;

/** While a connection is being dragged, the whole node becomes a drop target, so lines can land anywhere on it. */
function DropTarget() {
  const fromId = useConnection((c) => (c.inProgress ? c.fromNode?.id ?? "" : null));
  const id = useNodeId();
  if (fromId == null || fromId === id) return null;
  return <Handle type="target" position={Position.Left} id="drop" className="drop-target" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "none", borderRadius: 14, background: "rgba(44,79,219,.06)", border: "2px dashed var(--accent)", zIndex: 20, opacity: 1 }} />;
}

/** A screen's first viewport, scaled into a small dark tile. Used on cards, edge cases, and chips. */
function Thumb({ screenId, width, aspect = 1.45, className }: { screenId: string; width: number; aspect?: number; className?: string }) {
  const projectId = useFlow((s) => s.projectId)!;
  const spec = useFlow((s) => s.bundle!.spec);
  const head = useHeadVersion();
  const scale = width / spec.device.width;
  const h = Math.round(Math.min(spec.device.height, spec.device.width * aspect) * scale);
  return (
    <div className={`thumb ${className ?? ""}`} style={{ width, height: h }}>
      <iframe key={head} title="" tabIndex={-1} loading="lazy" src={api.shellUrl(projectId, screenId, { follow: false })} style={{ width: spec.device.width, height: spec.device.height, transform: `scale(${scale})` }} />
    </div>
  );
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
  const setPanel = useFlow((s) => s.setPanel);
  const ref = useRef<HTMLIFrameElement>(null);
  const [missing, setMissing] = useState(false);

  const post = (msg: Record<string, unknown>) => ref.current?.contentWindow?.postMessage({ source: "flow-host", ...msg }, "*");
  const cur = frame?.screenId ?? node.screenId;
  // The picked element stays framed while it is the target; a hover elsewhere in the app takes over temporarily.
  const framed = highlight && highlight.screenId === cur ? highlight.elementId : picked && picked.screenId === cur ? picked.elementId : null;

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (!ref.current || ev.source !== ref.current.contentWindow) return;
      const d = ev.data;
      if (!d || d.source !== "flow-shell") return;
      if (d.type === "flow:ready") { post({ type: "flow:scroll-mode", mode: selected ? "scroll" : "pan" }); post({ type: "flow:picker", enabled: picker }); post({ type: "flow:highlight", elementId: framed }); }
      else if (d.type === "flow:navigated") { setFrame(node.screenId, { screenId: d.screenId, stateId: d.stateId }); setMissing(false); if (walk.active) setWalk({ screenId: d.screenId, stateId: d.stateId, lastTransitionId: d.transitionId ?? walk.lastTransitionId }); }
      else if (d.type === "flow:missing") setMissing(true);
      else if (d.type === "flow:picked") { setPicked({ screenId: d.screenId, elementId: d.elementId, label: d.label, rect: d.rect }); }
      else if (d.type === "flow:wheel") {
        // The frame is scaled by the viewport, so its own pixels map onto the page through its rendered box.
        const box = ref.current.getBoundingClientRect();
        const k = box.width / (ref.current.offsetWidth || box.width);
        window.dispatchEvent(new CustomEvent("flow:canvas-wheel", { detail: { deltaX: d.deltaX, deltaY: d.deltaY, deltaMode: d.deltaMode, zoom: !!(d.ctrlKey || d.metaKey), pinch: !!d.ctrlKey, clientX: box.left + d.x * k, clientY: box.top + d.y * k } }));
      }
      else if (d.type === "flow:transition") { if (walk.active) setWalk({ lastTransitionId: d.transitionId }); }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [node.screenId, setFrame, setPicked, walk.active, walk.lastTransitionId, setWalk, selected, picker, framed]);

  useEffect(() => { post({ type: "flow:picker", enabled: picker }); }, [picker]);
  // Selected: plain scroll reaches the prototype. Otherwise the board pans under it, like any other node.
  useEffect(() => { post({ type: "flow:scroll-mode", mode: selected ? "scroll" : "pan" }); }, [selected]);
  useEffect(() => { post({ type: "flow:highlight", elementId: framed }); }, [framed]);
  useEffect(() => {
    if (preview?.css !== undefined) post({ type: "flow:preview-tokens", css: preview.css });
    else if (preview && preview.screenId === cur && preview.elementId) post({ type: "flow:preview", elementId: preview.elementId, html: preview.html ?? null });
    else { post({ type: "flow:preview", elementId: null, html: null }); post({ type: "flow:preview-tokens", css: "" }); }
  }, [preview, cur]);

  if (!screen) return null;
  const showing = spec.screens.find((s) => s.id === cur) ?? screen;
  const edgeCases = spec.edgeCases.filter((e) => e.attachedTo.screenId === screen.id || spec.transitions.some((t) => t.id === e.attachedTo.transitionId && t.from.screenId === screen.id));
  const w = node.width ?? spec.device.width;
  const h = (node.height ?? spec.device.height) + 40;
  const isWalkHere = walk.active && walk.screenId === screen.id;
  const inspect = () => { select({ kind: "node", id: node.id }); setPanel("inspect"); };

  return (
    <div className={`screen-frame ${selected ? "selected" : ""}`} style={{ width: w, height: h, outline: isWalkHere ? "3px solid var(--accent)" : undefined }}>
      <DropTarget />
      <Handle type="target" position={Position.Left} id="in" className="magic side" />
      <Handle type="source" position={Position.Right} id="out" className="magic side" />
      <Handle type="source" position={Position.Bottom} id="below" className="ec-port" style={{ left: RAIL_X }} />
      <div className="hdr" onDoubleClick={() => select({ kind: "node", id: node.id })}>
        {showing.id !== screen.id
          ? <button className="icon nodrag" onClick={() => post({ type: "flow:goto", screenId: screen.id })} title={`Back to ${screen.name}`} aria-label="Back"><Icon name="arrow-left" size={14} /></button>
          : <span className="icon dim" aria-hidden="true"><Icon name="arrow-left" size={14} /></span>}
        <span className="name">{showing.id !== screen.id ? showing.name : screen.name}</span>
        <span className="pill ok live"><span className="pill-dot" /> Live</span>
        {edgeCases.length > 0 && <button className="pill warn nodrag" title={edgeCases.map((e) => e.scenario).join("\n") + "\n\nClick to inspect"} onClick={inspect}>{edgeCases.length} edge {edgeCases.length === 1 ? "case" : "cases"}</button>}
        <span style={{ flex: 1 }} />
        {showing.states.length > 0 && (
          <label className="state-select nodrag">
            <select value={frame?.stateId ?? showing.states.find((s) => s.isDefault)?.id ?? ""} onChange={(e) => post({ type: "flow:setState", stateId: e.target.value })} title="State">
              {showing.states.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <Icon name="chevron-down" size={12} />
          </label>
        )}
        <button className="icon nodrag" title="Reload" aria-label="Reload" onClick={() => post({ type: "flow:reload" })}><Icon name="rotate-ccw" size={13} /></button>
        <button className="icon nodrag" title="Inspect" aria-label="Inspect" onClick={inspect}><Icon name="more-horizontal" size={15} /></button>
      </div>
      <div className="nodrag nowheel nopan" style={{ position: "relative", height: h - 40 }}>
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

/* ---------- Start marker (flow view): where the product opens ---------- */
export const StartNode = memo(function StartNode() {
  return (
    <div className="start-node">
      Start
      <Handle type="source" position={Position.Right} id="out" style={{ opacity: 0, right: 0 }} />
    </div>
  );
});

/* ---------- Screen card (flow view) ----------
 * Thumbnail, name, purpose, and the state and edge-case counts; then one row per interaction, each the start of its
 * own line, so the line never needs to be traced back to find out what fires it.
 */
export const ScreenCardNode = memo(function ScreenCardNode({ data, selected }: N<"screen"> & { data: { primaryMoves?: Record<string, string> } }) {
  const { node, spec } = data;
  const mainId = mainMoves(spec, data.primaryMoves ?? {}).get(node.screenId);
  const screen = spec.screens.find((s) => s.id === node.screenId);
  const walk = useFlow((s) => s.walk);
  const selection = useFlow((s) => s.selection);
  const select = useFlow((s) => s.select);
  const setPanel = useFlow((s) => s.setPanel);
  const showToast = useFlow((s) => s.showToast);
  if (!screen) return null;
  const outs = spec.transitions.filter((t) => t.from.screenId === screen.id);
  const forwards = outs.filter((t) => classifyTransition(t) === "forward");
  const backs = outs.filter((t) => classifyTransition(t) === "back");
  const ecs = spec.edgeCases.filter((e) => e.attachedTo.screenId === screen.id || outs.some((t) => t.id === e.attachedTo.transitionId));
  const isWalkHere = walk.active && walk.screenId === screen.id;
  const nameOf = (id: string) => spec.screens.find((s) => s.id === id)?.name ?? id;
  const selectedTransition = selection?.kind === "transition" ? selection.id : null;
  const defaultState = screen.states.find((s) => s.isDefault) ?? screen.states[0];
  const inspect = (ev: React.MouseEvent) => { ev.stopPropagation(); select({ kind: "node", id: node.id }); setPanel("inspect"); };
  const rows = [...forwards].sort((a, b) => (a.id === mainId ? -1 : b.id === mainId ? 1 : 0)).concat(backs);
  const moveRow = (t: (typeof outs)[number]) => {
    const back = classifyTransition(t) === "back";
    return (
      <div key={t.id} className={`move ${back ? "back" : ""} ${t.id === mainId ? "main" : ""} ${selectedTransition === t.id ? "selected" : ""} nodrag`} onClick={(ev) => { ev.stopPropagation(); select({ kind: "transition", id: t.id }); }} title={t.id === mainId ? "Main move. Click to inspect." : "Click to inspect"}>
        <span className="dot" />
        <span className="trig">{cap(t.trigger)}</span>
        <span className="to"><Icon name="arrow-right" size={11} /> {nameOf(t.to.screenId)}{t.to.stateId ? ` · ${t.to.stateId}` : ""}{t.condition && <span className="cond"> if {t.condition}</span>}</span>
        <span className="port" aria-hidden="true" />
        <Handle type="source" position={Position.Right} id={`out:${t.id}`} className="row-port" />
      </div>
    );
  };
  return (
    <div className={`screen-card ${selected ? "selected" : ""}`} style={{ outline: isWalkHere ? "3px solid var(--accent)" : undefined }}>
      <DropTarget />
      <Handle type="target" position={Position.Left} id="in" className="card-in" />
      <Handle type="source" position={Position.Bottom} id="ec" className="ec-port" style={{ left: 18 }} />
      <Handle type="source" position={Position.Bottom} id="below" className="ec-port" style={{ left: RAIL_X }} />
      <div className="hdr" onDoubleClick={() => select({ kind: "node", id: node.id })}>
        <Thumb screenId={screen.id} width={84} />
        <div className="hdr-text">
          <div className="name-row"><div className="name">{screen.name}</div><button className="icon nodrag" onClick={inspect} title="Inspect" aria-label="Inspect"><Icon name="more-horizontal" size={16} /></button></div>
          <div className="purpose">{screen.purpose}</div>
          <div className="chips">
            {defaultState && <span className="pill blue">{screen.states.length > 1 ? `${screen.states.length} states` : defaultState.name}</span>}
            {ecs.length > 0 && <button className="pill warn nodrag" onClick={(ev) => { ev.stopPropagation(); select({ kind: "node", id: `edgecase:${ecs[0].id}` }); }} title={ecs.map((e) => e.scenario).join("\n")}>{ecs.length} edge {ecs.length === 1 ? "case" : "cases"}</button>}
          </div>
        </div>
      </div>
      <div className="moves">
        {rows.map(moveRow)}
        <div className="move add nodrag" onClick={(ev) => { ev.stopPropagation(); showToast("Drag from the circle on this row to another screen to add an interaction."); }} title="Drag from the circle to another screen">
          <Icon name="plus" size={13} />
          <span className="trig">Add interaction</span>
          <span className="port" aria-hidden="true" />
          <Handle type="source" position={Position.Right} id="out" className="row-port" />
        </div>
      </div>
    </div>
  );
});

/* ---------- Edge case (flow view): what goes wrong, and how the design answers ---------- */
export const EdgeCaseNode = memo(function EdgeCaseNode({ data, selected }: N<"edgeCase">) {
  const spec = data.spec;
  const ec = spec.edgeCases.find((e) => e.id === data.node.edgeCaseId) as EdgeCaseSpec | undefined;
  const select = useFlow((s) => s.select);
  const setPanel = useFlow((s) => s.setPanel);
  if (!ec) return null;
  const via = ec.attachedTo.transitionId ? spec.transitions.find((t) => t.id === ec.attachedTo.transitionId) : undefined;
  const hostId = ec.attachedTo.screenId ?? via?.from.screenId;
  const inspect = (ev: React.MouseEvent) => { ev.stopPropagation(); select({ kind: "node", id: data.node.id }); setPanel("inspect"); };
  const preview = (ev: React.MouseEvent) => { ev.stopPropagation(); select({ kind: "node", id: data.node.id }); setPanel("preview"); };
  return (
    <div className={`edge-case-card ${ec.severity} ${selected ? "selected" : ""}`}>
      <DropTarget />
      <Handle type="target" position={Position.Left} id="ec-in" className="ec-port" style={{ top: 30 }} />
      <Handle type="target" position={Position.Left} id="in" className="magic" style={{ top: "60%" }} />
      <div className="hdr">
        {hostId && <Thumb screenId={hostId} width={56} aspect={1.2} className="dim" />}
        <div className="hdr-text">
          <div className="name-row"><div className="name">{ec.scenario}</div><button className="icon nodrag" onClick={inspect} title="Inspect" aria-label="Inspect"><Icon name="more-horizontal" size={16} /></button></div>
          <div className="handling">{ec.handling}</div>
        </div>
      </div>
      <div className="rows">
        <div className="row"><span className="k">Severity</span><span className={`pill ${ec.severity === "high" ? "err" : ec.severity === "low" ? "grey" : "warn"}`}>{ec.severity}</span></div>
        <div className="row"><span className="k">{via ? "On" : "Screen"}</span><span className="v">{via ? `${cap(via.trigger)} → ${spec.screens.find((s) => s.id === via.to.screenId)?.name ?? via.to.screenId}` : spec.screens.find((s) => s.id === hostId)?.name ?? "—"}</span></div>
      </div>
      <button className="btn ec-btn nodrag" onClick={preview}><Icon name="play" size={12} /> Preview</button>
    </div>
  );
});

/* ---------- Inspiration: a reference that can be pointed at a screen ---------- */
export const InspirationNode = memo(function InspirationNode({ data, selected }: N<"inspiration">) {
  const n = data.node;
  const projectId = useFlow((s) => s.projectId)!;
  const select = useFlow((s) => s.select);
  const setPanel = useFlow((s) => s.setPanel);
  const kind = n.kind === "url" ? "Web reference" : n.kind === "style" ? "Style token" : n.kind === "text" ? "Text reference" : "Style reference";
  return (
    <div className={`ref-card ${selected ? "selected" : ""}`} style={{ width: n.width ?? 224 }}>
      <DropTarget />
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <Handle type="target" position={Position.Left} id="in" className="magic" />
      <div className="hdr"><Icon name="image" size={14} /><span className="kind">{kind}</span><span style={{ flex: 1 }} /><button className="icon nodrag" onClick={(ev) => { ev.stopPropagation(); select({ kind: "node", id: n.id }); setPanel("inspect"); }} title="Inspect" aria-label="Inspect"><Icon name="more-horizontal" size={16} /></button></div>
      {n.kind === "image" && n.path && <img src={api.fileUrl(projectId, n.path)} alt={n.caption || n.title} draggable={false} />}
      {n.kind === "style" && n.text && <div className="swatch">{/^#[0-9a-f]{3,8}$/i.test(n.text) && <span className="chip" style={{ background: n.text }} />}<span className="mono">{n.text}</span></div>}
      {n.kind === "text" && <div className="text">{n.text}</div>}
      {n.kind === "url" && <div className="text"><a href={n.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{n.url}</a></div>}
      <div className="body">
        <div className="title">{n.title}</div>
        {(n.caption || n.description) && <div className="caption">{n.caption || n.description}</div>}
      </div>
    </div>
  );
});

/* ---------- Skill ---------- */
export const SkillNode = memo(function SkillNode({ data, selected }: N<"skill">) {
  const n = data.node;
  const projectId = useFlow((s) => s.projectId)!;
  const [text, setText] = useState("");
  useEffect(() => { fetch(api.fileUrl(projectId, n.path)).then((r) => r.text()).then(setText).catch(() => setText("")); }, [projectId, n.path]);
  return (
    <div className={`ref-card skill ${selected ? "selected" : ""}`}>
      <Handle type="source" position={Position.Right} id="out" className="magic" />
      <div className="hdr"><Icon name="sticky-note" size={14} /><span className="kind">Skill</span></div>
      <div className="body"><div className="title">{n.title}</div><div className="code">{text.slice(0, 600)}</div></div>
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

/* ---------- Variant panel: alternatives of one element, side by side, each one click from being the real thing ---------- */
export const VariantPanelNode = memo(function VariantPanelNode({ data, selected }: N<"variantPanel">) {
  const n = data.node;
  const spec = data.spec;
  const projectId = useFlow((s) => s.projectId)!;
  const head = useHeadVersion();
  const refresh = useFlow((s) => s.refresh);
  const showToast = useFlow((s) => s.showToast);
  const setPreview = useFlow((s) => s.setPreview);
  const select = useFlow((s) => s.select);
  const setPanel = useFlow((s) => s.setPanel);
  const [fragments, setFragments] = useState<Record<string, string>>({});
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const files = [...n.options.map((o) => ({ id: o.id, file: o.file })), ...(n.originalFile ? [{ id: "original", file: n.originalFile }] : [])];
    Promise.all(files.map((o) => fetch(api.fileUrl(projectId, o.file)).then((r) => r.text()).then((t) => [o.id, t] as const).catch(() => [o.id, ""] as const)))
      .then((pairs) => { if (!cancelled) setFragments(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [n.options, n.originalFile, projectId, head]);
  const hoverIn = (id: string, file: string) => {
    setHover(id);
    const body = fragments[id];
    if (!body) return;
    if (file.endsWith(".css")) setPreview({ css: body });
    else if (n.target.elementId) setPreview({ screenId: n.target.screenId, elementId: n.target.elementId, html: body });
  };
  const hoverOut = () => { setHover(null); setPreview(null); };
  const screen = spec.screens.find((s) => s.id === n.target.screenId);
  const element = screen?.elements.find((e) => e.id === n.target.elementId);
  const subject = n.target.token ? `Tokens · ${n.target.token}` : element?.label ?? n.target.elementId ?? screen?.name ?? "Project";
  const apply = async (optionId: string) => {
    try { await api.applyVariant(projectId, n.id, optionId); showToast(`Variant applied to ${screen?.name ?? "the project"} · Original preserved`); await refresh(); }
    catch (e) { showToast(`Could not apply: ${(e as Error).message}`); }
  };
  const options = [...(n.originalFile ? [{ id: "original", label: "Original", rationale: "Before any variant was applied.", file: n.originalFile }] : []), ...n.options];
  const current = n.appliedId ?? (n.originalFile ? "original" : undefined);
  return (
    <div className={`variant-panel ${selected ? "selected" : ""}`} style={{ width: n.width ?? Math.min(900, 14 + Math.max(1, options.length) * 206) }}>
      <DropTarget />
      <Handle type="source" position={Position.Right} id="out" className="flow" />
      <Handle type="target" position={Position.Left} id="in" className="magic" style={{ top: 24 }} />
      <Handle type="target" position={Position.Top} id="top" className="ec-port" style={{ left: RAIL_X }} />
      <div className="hdr">
        <span className="vp-mark"><Icon name="hexagon" size={16} strokeWidth={2} /></span>
        <span className="name">{subject} exploration</span>
        <span className="pill blue">{n.options.length} variant{n.options.length === 1 ? "" : "s"}</span>
        <span style={{ flex: 1 }} />
        {n.direction && <span className="direction" title={n.direction}>{n.direction}</span>}
        <button className="icon nodrag" onClick={(ev) => { ev.stopPropagation(); select({ kind: "node", id: n.id }); setPanel("inspect"); }} title="Inspect" aria-label="Inspect"><Icon name="more-horizontal" size={16} /></button>
      </div>
      {n.options.length === 0 && <div className="vp-empty muted">No options yet. Claude is working, or the run failed. Check the Claude panel.</div>}
      {options.length > 0 && (
        <div className="options nowheel">
          {options.map((o) => {
            const applied = current === o.id;
            const focus = hover === o.id;
            return (
              <div key={o.id} className={`opt ${applied ? "applied" : ""} ${focus ? "focus" : ""} ${o.id === "original" ? "original" : ""}`} onMouseEnter={() => hoverIn(o.id, o.file)} onMouseLeave={hoverOut} title={o.id === "original" ? "What was there before" : "Hover to preview in the prototype"}>
                <VariantPreview projectId={projectId} head={head} spec={spec} screen={screen} elementId={n.target.elementId} file={o.file} />
                <div className="meta">
                  <b>{o.label}</b>
                  <div className="r">{o.rationale}</div>
                  <button className={`btn sm ${focus && !applied ? "primary" : ""} nodrag`} onClick={() => apply(o.id)} disabled={applied}>{applied ? (o.id === "original" ? "In place" : "Applied") : focus && screen ? `Apply to ${screen.name}` : o.id === "original" ? "Restore" : "Apply"}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const scale = elementId ? 0.55 : 196 / spec.device.width;
  return <div className="nodrag nowheel shot"><iframe title="variant" srcDoc={doc} sandbox="allow-same-origin" style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none" }} /></div>;
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
  start: StartNode,
  edgeCase: EdgeCaseNode,
  inspiration: InspirationNode,
  skill: SkillNode,
  prompt: PromptNode,
  variantPanel: VariantPanelNode,
  note: NoteNode,
  versionPin: VersionPinNode,
  group: GroupNode
};
