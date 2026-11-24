import { useEffect, useState } from "react";
import { MAGIC_RELATION_LABELS, classifyTransition, mainMoves, type CanvasDoc, type CanvasEdge, type CanvasNode, type MagicRelation, type ScreenSpec, type TransitionSpec, type EdgeCaseSpec, type Severity, type Animation } from "@flow/shared";
import { api } from "../api";
import { useFlow } from "../store";
import { ask, confirm } from "../components/Dialog";
import { Icon } from "./Icon";
import { PreviewPanel } from "./PreviewPanel";

export function Inspector() {
  const bundle = useFlow((s) => s.bundle)!;
  const selection = useFlow((s) => s.selection);
  const { spec, canvas } = bundle;
  const view = useFlow((s) => s.view);
  // In flow view the cards are too small to read a screen, so Details opens with it running.
  const previewable = view === "flow" && selection?.kind === "node" && (selection.id.startsWith("screen:") || selection.id.startsWith("edgecase:"));
  void spec; void canvas;
  return <div className="inspector">{previewable && <div className="ins-preview"><PreviewPanel embedded /></div>}<InspectorBody /></div>;
}

/**
 * The top of the panel, the same for every tab: a way back, where you are, and what is selected. The tabs below are
 * views of this one subject, so none of them repeats it.
 */
export function PanelHeader({ onClose }: { onClose: () => void }) {
  const bundle = useFlow((s) => s.bundle)!;
  const selection = useFlow((s) => s.selection);
  const select = useFlow((s) => s.select);
  const addChange = useFlow((s) => s.addChange);
  const { spec, canvas } = bundle;
  const screenName = (id?: string) => spec.screens.find((x) => x.id === id)?.name;
  const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
  const deviceIcon = spec.device.kind === "desktop" ? "frame" : spec.device.kind === "tablet" ? "square" : "smartphone";
  // Subject: icon, title, one line, an optional control on the right, and the screen it belongs to (for the breadcrumb).
  let head: { icon: string; tone?: string; title: React.ReactNode; sub: string; right?: React.ReactNode; parent?: string } = { icon: "hexagon", title: spec.name, sub: `Project · ${cap(spec.device.kind)} · ${spec.device.width} × ${spec.device.height}` };
  if (selection?.kind === "transition") {
    const t = spec.transitions.find((x) => x.id === selection.id);
    if (t) head = { icon: "arrow-right", title: <InlineText className="cap" value={t.trigger} onCommit={(trigger) => addChange({ op: "update-transition", transitionId: t.id, patch: { trigger } })} />, sub: `Connection · ${screenName(t.from.screenId)} → ${screenName(t.to.screenId)}`, parent: t.from.screenId };
  } else if (selection?.kind === "edge") {
    const e = canvas.edges.find((x) => x.id === selection.id);
    if (e) head = { icon: "sparkles", tone: "magic", title: e.type === "magic" ? "Reference line" : "Exploration link", sub: "Line" };
  } else if (selection?.kind === "node") {
    const n = canvas.nodes.find((x) => x.id === selection.id);
    if (n?.type === "screen") {
      const sc = spec.screens.find((x) => x.id === n.screenId);
      if (sc) {
        head = {
          icon: deviceIcon, title: <InlineText value={sc.name} onCommit={(name) => addChange({ op: "rename-screen", screenId: sc.id, name })} />, sub: `Screen · ${cap(spec.device.kind)} · ${spec.device.width} × ${spec.device.height}`
        };
      }
    } else if (n?.type === "edgeCase") {
      const ec = spec.edgeCases.find((x) => x.id === n.edgeCaseId);
      const host = ec ? ec.attachedTo.screenId ?? spec.transitions.find((t) => t.id === ec.attachedTo.transitionId)?.from.screenId : undefined;
      if (ec) head = { icon: "alert", tone: ec.severity === "high" ? "err" : ec.severity === "low" ? "grey" : "warn", title: ec.scenario, sub: `Edge case · ${cap(ec.severity)}`, parent: host };
    } else if (n?.type === "inspiration") head = { icon: "image", tone: "magic", title: n.title, sub: `Reference · ${n.kind === "image" ? "Image" : cap(n.kind)}` };
    else if (n?.type === "skill") head = { icon: "sticky-note", tone: "magic", title: n.title, sub: "Skill" };
    else if (n?.type === "variantPanel") head = { icon: "sparkles", title: `${n.target.token ? `Tokens · ${n.target.token}` : spec.screens.find((x) => x.id === n.target.screenId)?.elements.find((e) => e.id === n.target.elementId)?.label ?? n.target.elementId ?? screenName(n.target.screenId) ?? "Project"}`, sub: `Exploration · ${n.options.length} variant${n.options.length === 1 ? "" : "s"}`, parent: n.target.screenId };
    else if (n?.type === "prompt") head = { icon: "sticky-note", title: n.kind === "brief" ? "Brief" : n.kind === "record" ? "Generation record" : "Instruction", sub: n.kind === "brief" ? spec.name : "Prompt" };
    else if (n?.type === "note") head = { icon: "sticky-note", tone: "warn", title: "Note", sub: "Sticky note" };
    else if (n?.type === "versionPin") head = { icon: "pin", tone: "grey", title: n.label, sub: "Pinned version" };
    else if (n?.type === "group") head = { icon: "frame", tone: "grey", title: "Group", sub: "Group" };
  }
  const parentName = head.parent ? screenName(head.parent) : undefined;
  return (
    <div className="ph">
      <div className="ph-nav">
        <BackLink />
        <nav className="ph-crumbs" aria-label="Where you are">
          {selection ? <button className="crumb" onClick={() => select(null)}>{spec.name}</button> : <span className="crumb here">{spec.name}</span>}
          {parentName && <><Icon name="chevron-right" size={12} className="sep" /><button className="crumb" onClick={() => select({ kind: "node", id: `screen:${head.parent}` })}>{parentName}</button></>}
        </nav>
        <span style={{ flex: 1 }} />
        <button className="rp-close" onClick={onClose} data-tip="Hide panel" data-key="I" aria-label="Hide panel"><Icon name="x" size={18} strokeWidth={2} /></button>
      </div>
      <Head icon={head.icon} tone={head.tone} title={head.title} sub={head.sub} right={head.right} />
    </div>
  );
}

/** What a selection is called, for the way back. */
function selectionName(sel: ReturnType<typeof useFlow.getState>["selection"], spec: ReturnType<typeof useFlow.getState>["bundle"] extends infer B ? B extends { spec: infer S } ? S : never : never, canvas: CanvasDoc): string | null {
  if (!sel) return spec.name;
  if (sel.kind === "transition") { const t = spec.transitions.find((x) => x.id === sel.id); return t ? t.trigger[0].toUpperCase() + t.trigger.slice(1) : null; }
  if (sel.kind === "edge") return canvas.edges.some((e) => e.id === sel.id) ? "Line" : null;
  const n = canvas.nodes.find((x) => x.id === sel.id);
  if (!n) return null;
  if (n.type === "screen") return spec.screens.find((x) => x.id === n.screenId)?.name ?? null;
  if (n.type === "edgeCase") return spec.edgeCases.find((e) => e.id === n.edgeCaseId)?.scenario ?? null;
  if (n.type === "inspiration" || n.type === "skill") return n.title;
  if (n.type === "variantPanel") return `${n.target.elementId ?? n.target.screenId ?? "Project"} exploration`;
  if (n.type === "prompt") return "Brief";
  if (n.type === "note") return "Note";
  return null;
}

/** Back to what was inspected before: the last stop on the trail that still exists. */
function BackLink() {
  const trail = useFlow((s) => s.trail);
  const back = useFlow((s) => s.back);
  const { spec, canvas } = useFlow((s) => s.bundle)!;
  // Skip stops that were deleted since.
  let i = trail.length - 1;
  while (i >= 0 && !selectionName(trail[i], spec, canvas)) i--;
  if (i < 0) return null;
  const go = () => { const st = useFlow.getState(); for (let k = trail.length - 1; k > i; k--) st.back(); st.back(); };
  return (
    <button className="ph-back" onClick={go} data-tip={`Back to ${selectionName(trail[i], spec, canvas)}`} aria-label="Back">
      <Icon name="arrow-left" size={15} />
    </button>
  );
}

function InspectorBody() {
  const bundle = useFlow((s) => s.bundle)!;
  const selection = useFlow((s) => s.selection);
  const { spec, canvas } = bundle;

  if (!selection) return <ProjectOverview />;
  if (selection.kind === "transition") {
    const t = spec.transitions.find((x) => x.id === selection.id);
    return t ? <TransitionPanel t={t} /> : <div className="empty">That transition no longer exists.</div>;
  }
  if (selection.kind === "edge") {
    const e = canvas.edges.find((x) => x.id === selection.id);
    return e ? <EdgePanel e={e} /> : <div className="empty">That line no longer exists.</div>;
  }
  const n = canvas.nodes.find((x) => x.id === selection.id);
  if (!n) return <div className="empty">Nothing selected.</div>;
  return (
    <>
      {n.type === "screen" && <ScreenPanel node={n} />}
      {n.type === "edgeCase" && <EdgeCasePanel node={n} />}
      {n.type === "inspiration" && <InspirationPanel node={n} />}
      {n.type === "skill" && <SkillPanel node={n} />}
      {n.type === "prompt" && <PromptPanel node={n} />}
      {n.type === "variantPanel" && <VariantPanel node={n} />}
      {n.type === "note" && <GenericPanel title="Note" node={n} />}
      {n.type === "versionPin" && <VersionPinPanel node={n} />}
      {n.type === "group" && <GenericPanel title="Group" node={n} />}
    </>
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

/** The panel's header: what is selected, as a tile with an icon, a name, and one line under it. */
function Head({ icon, tone = "", title, sub, right }: { icon: string; tone?: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="ins-head">
      <span className={`ins-tile ${tone}`}><Icon name={icon} size={18} /></span>
      <div className="ins-head-text"><div className="ins-title">{title}</div>{sub && <div className="ins-sub">{sub}</div>}</div>
      {right}
    </div>
  );
}
/** One section: a title with an optional count, and rows. */
function Section({ title, count, action, children, open = true, onToggle }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode; open?: boolean; onToggle?: () => void }) {
  return (
    <div className="ins-sec">
      <div className="ins-sec-head">
        <h3>{title}{count !== undefined && <span className="count"> · {count}</span>}</h3>
        <span style={{ flex: 1 }} />
        {action}
        {onToggle && <button className="ins-toggle" onClick={onToggle} aria-label={open ? "Collapse" : "Expand"}><Icon name={open ? "chevron-down" : "chevron-right"} size={15} /></button>}
      </div>
      {open && children}
    </div>
  );
}
/** A row that leads somewhere: a mark, a label, and a chevron. */
function Row({ mark, children, onClick, trailing }: { mark?: React.ReactNode; children: React.ReactNode; onClick?: () => void; trailing?: React.ReactNode }) {
  return (
    <div className={`ins-row ${onClick ? "go" : ""}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(e) => { if (onClick && e.key === "Enter") onClick(); }}>
      {mark}
      <span className="ins-row-text">{children}</span>
      {trailing ?? (onClick && <Icon name="chevron-right" size={15} className="chev" />)}
    </div>
  );
}
/** References pinned to a node: the images that shape it. */
function ReferenceTiles({ ids }: { ids: string[] }) {
  const canvas = useFlow((s) => s.bundle!.canvas);
  const projectId = useFlow((s) => s.projectId)!;
  const select = useFlow((s) => s.select);
  const refs = ids.map((id) => canvas.nodes.find((n) => n.id === id)).filter((n): n is Extract<CanvasNode, { type: "inspiration" }> => !!n && n.type === "inspiration");
  if (refs.length === 0) return <div className="ins-empty">None yet. Drag from a reference's right handle to this screen.</div>;
  return (
    <div className="ref-grid">
      {refs.map((r) => (
        <button key={r.id} className="ref-tile" onClick={() => select({ kind: "node", id: r.id })}>
          <span className="ref-tile-img">{r.kind === "image" && r.path ? <img src={api.fileUrl(projectId, r.path)} alt="" /> : <Icon name={r.kind === "url" ? "share" : r.kind === "text" ? "sticky-note" : "sliders"} size={18} />}</span>
          <span className="ref-tile-title">{r.title}</span>
          {(r.caption || r.description) && <span className="ref-tile-cap">{r.caption || r.description}</span>}
        </button>
      ))}
    </div>
  );
}

function ProjectOverview() {
  const bundle = useFlow((s) => s.bundle)!;
  const select = useFlow((s) => s.select);
  const { spec } = bundle;
  return (
    <>
      <Section title="Screens" count={spec.screens.length}>
        {spec.screens.map((sc) => <Row key={sc.id} mark={<span className="mark accent" />} onClick={() => select({ kind: "node", id: `screen:${sc.id}` })}>{sc.name}</Row>)}
        {spec.screens.length === 0 && <div className="ins-empty">No screens yet.</div>}
      </Section>
      <Section title="Brief">
        <div className="ins-text">{spec.brief || <span className="muted">No brief yet. Edit the Brief card on the canvas.</span>}</div>
      </Section>
    </>
  );
}

function ScreenPanel({ node }: { node: Extract<CanvasNode, { type: "screen" }> }) {
  const bundle = useFlow((s) => s.bundle)!;
  const addChange = useFlow((s) => s.addChange);
  const select = useFlow((s) => s.select);
  const frame = useFlow((s) => s.frames[node.screenId]);
  const { spec, canvas } = bundle;
  const screen = spec.screens.find((s) => s.id === node.screenId) as ScreenSpec | undefined;
  const [refsOpen, setRefsOpen] = useState(true);
  const [exploring, setExploring] = useState(false);
  const [direction, setDirection] = useState("");
  const [count, setCount] = useState(3);
  const run = useFlow((s) => s.run);
  const running = useFlow((s) => s.agent.running);
  const picked = useFlow((s) => s.picker.picked);
  if (!screen) return <div className="empty">Screen missing from the spec.</div>;
  const pickedHere = picked && picked.screenId === screen.id ? picked : null;
  const explorations = canvas.nodes.filter((n): n is Extract<CanvasNode, { type: "variantPanel" }> => n.type === "variantPanel" && n.target.screenId === screen.id);
  const subjectOf = (n: Extract<CanvasNode, { type: "variantPanel" }>) => n.target.token ? `Tokens · ${n.target.token}` : screen.elements.find((e) => e.id === n.target.elementId)?.label ?? n.target.elementId ?? screen.name;
  const explore = () => {
    const inspirationIds = canvas.edges.filter((e) => e.type === "magic" && e.target === node.id).map((e) => e.source);
    run("variants", { target: { screenId: screen.id, elementId: pickedHere?.elementId }, count, direction: direction.trim(), inspirationIds }, `Variants of ${pickedHere ? (pickedHere.label || pickedHere.elementId) + " on " : ""}${screen.name}${direction.trim() ? `: ${direction.trim()}` : ""}`);
    setExploring(false); setDirection("");
  };
  const outs = spec.transitions.filter((t) => t.from.screenId === screen.id && classifyTransition(t) !== "state");
  const mainId = mainMoves(spec, canvas.primaryMoves).get(screen.id);
  const ecs = spec.edgeCases.filter((e) => e.attachedTo.screenId === screen.id || outs.some((t) => t.id === e.attachedTo.transitionId));
  const refIds = Array.from(new Set([...canvas.edges.filter((e) => e.type === "magic" && e.target === node.id).map((e) => e.source), ...screen.provenance.map((p) => p.sourceNodeId)]));
  const nameOf = (id: string) => spec.screens.find((s) => s.id === id)?.name ?? id;
  const stateId = frame?.stateId ?? screen.states.find((st) => st.isDefault)?.id ?? screen.states[0]?.id ?? "";

  return (
    <>
      {screen.states.length > 1 && (
        <Section title="State" count={screen.states.length}>
          <div className="state-chips">
            {screen.states.map((st) => (
              <button key={st.id} className={`state-chip ${(frame?.stateId ?? screen.states.find((x) => x.isDefault)?.id) === st.id ? "on" : ""}`} onClick={() => window.dispatchEvent(new CustomEvent("flow:set-state", { detail: { screenId: screen.id, stateId: st.id } }))} title={st.description || st.name}>{st.name}</button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Connections" count={outs.length}>
        {outs.map((t) => {
          const back = classifyTransition(t) === "back";
          return (
            <Row key={t.id} mark={<span className={`mark ${t.id === mainId ? "accent" : back ? "grey" : "ok"}`} />} onClick={() => select({ kind: "transition", id: t.id })}>
              <b>{t.trigger[0].toUpperCase() + t.trigger.slice(1)}</b><Icon name="arrow-right" size={13} className="arrow" /><span className="to">{nameOf(t.to.screenId)}</span>
            </Row>
          );
        })}
        {outs.length === 0 && <div className="ins-empty">No connections yet. In flow view, drag from a row's circle to another screen.</div>}
      </Section>
      {ecs.length > 0 && (
        <Section title="Edge cases" count={ecs.length}>
          {ecs.map((e) => <Row key={e.id} mark={<span className={`mark ${e.severity === "high" ? "err" : e.severity === "low" ? "grey" : "warn"}`} />} onClick={() => select({ kind: "node", id: `edgecase:${e.id}` })}>{e.scenario}</Row>)}
        </Section>
      )}
      <Section title="Variants" count={explorations.length} action={<button className="ins-action" disabled={running || !screen.file} onClick={() => setExploring(!exploring)}><Icon name="sparkles" size={13} /> Explore</button>}>
        {explorations.map((n) => (
          <Row key={n.id} mark={<span className="mark accent" />} onClick={() => select({ kind: "node", id: n.id })}>
            <b>{subjectOf(n)}</b><span className="to">{n.options.length} variant{n.options.length === 1 ? "" : "s"}{n.appliedId ? " · applied" : ""}</span>
          </Row>
        ))}
        {explorations.length === 0 && !exploring && <div className="ins-empty">None yet. Explore gives you a few directions for {pickedHere ? "the picked element" : "this screen"} to compare on the canvas.</div>}
        {exploring && (
          <div className="ins-explore">
            <div className="ins-explore-target">{pickedHere ? <>Of <b>{pickedHere.label || pickedHere.elementId}</b> on {screen.name}</> : <>Of the whole screen · press <span className="kbd">P</span> and click to pick one element</>}</div>
            <input className="input" value={direction} autoFocus onChange={(e) => setDirection(e.target.value)} placeholder="Direction, optional: warmer, denser, more editorial…" onKeyDown={(e) => { if (e.key === "Enter") explore(); if (e.key === "Escape") setExploring(false); }} />
            <div className="ins-explore-row">
              <label className="ins-select small"><select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[2, 3, 4, 5, 6].map((k) => <option key={k} value={k}>{k} variants</option>)}</select><Icon name="chevron-down" size={13} /></label>
              <span style={{ flex: 1 }} />
              <button className="btn ghost sm" onClick={() => setExploring(false)}>Cancel</button>
              <button className="btn dark sm" disabled={running} onClick={explore}>Explore <Icon name="sparkles" size={13} /></button>
            </div>
          </div>
        )}
      </Section>
      <Section title="References" count={refIds.length} open={refsOpen} onToggle={() => setRefsOpen(!refsOpen)}>
        <ReferenceTiles ids={refIds} />
      </Section>
      <div className="ins-foot">
        <button className="link quiet" onClick={async () => (await confirm(`Remove "${screen.name}"?`, "Queued as a change. Nothing is rewritten until you apply.")) && addChange({ op: "remove-screen", screenId: screen.id })}>Remove screen</button>
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
  const addEdgeCase = async () => { const sc = await ask("Edge case", { placeholder: "What could go wrong here?" }); if (!sc?.trim()) return; const h = (await ask("Handling", { placeholder: "How does the design answer it?" })) ?? ""; addChange({ op: "add-edge-case", attachedTo: { transitionId: t.id }, scenario: sc.trim(), handling: h.trim(), severity: "medium" }); };
  return (
    <>
      <Section title="Route">
        <Row mark={<span className="mark grey" />} onClick={() => from && select({ kind: "node", id: `screen:${from.id}` })} trailing={<span className="row-k">From</span>}>{from?.name}</Row>
        <Row mark={<span className="mark accent" />} onClick={() => to && select({ kind: "node", id: `screen:${to.id}` })} trailing={<span className="row-k">To</span>}>{to?.name}{t.to.stateId ? ` · ${t.to.stateId}` : ""}</Row>
      </Section>
      <Section title="Behaviour">
        <div className="kv"><span className="k">Only if</span><span className="v"><InlineText allowEmpty value={t.condition ?? ""} placeholder="Always. Add a condition to make it a branch." onCommit={(condition) => addChange({ op: "update-transition", transitionId: t.id, patch: { condition: condition || null } })} /></span></div>
        <div className="kv"><span className="k">Animation</span>
          <label className="ins-select small"><select value={t.animation} onChange={(e) => addChange({ op: "update-transition", transitionId: t.id, patch: { animation: e.target.value as Animation } })}>{["push", "pop", "fade", "modal", "none"].map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}</select><Icon name="chevron-down" size={13} /></label>
        </div>
        {isForward && (
          <div className="kv"><span className="k">Main move</span>
            {isMain ? <span className="v muted">Yes, drawn on the map</span>
              : <button className="ins-action" onClick={() => updateCanvas((c) => ({ ...c, primaryMoves: { ...c.primaryMoves, [t.from.screenId]: t.id } }))}>Make main</button>}
          </div>
        )}
      </Section>
      <Section title="Edge cases" count={ecs.length} action={<button className="ins-action" onClick={addEdgeCase}><Icon name="plus" size={13} /> Add</button>}>
        {ecs.map((e) => <Row key={e.id} mark={<span className={`mark ${e.severity === "high" ? "err" : e.severity === "low" ? "grey" : "warn"}`} />} onClick={() => select({ kind: "node", id: `edgecase:${e.id}` })}>{e.scenario}</Row>)}
        {ecs.length === 0 && <div className="ins-empty">None yet.</div>}
      </Section>
      <div className="ins-foot"><button className="link quiet" onClick={() => addChange({ op: "remove-transition", transitionId: t.id })}>Remove connection</button></div>
    </>
  );
}

function EdgeCasePanel({ node }: { node: Extract<CanvasNode, { type: "edgeCase" }> }) {
  const spec = useFlow((s) => s.bundle!.spec);
  const addChange = useFlow((s) => s.addChange);
  const select = useFlow((s) => s.select);
  const ec = spec.edgeCases.find((e) => e.id === node.edgeCaseId) as EdgeCaseSpec | undefined;
  if (!ec) return <div className="empty">Edge case missing.</div>;
  const via = ec.attachedTo.transitionId ? spec.transitions.find((t) => t.id === ec.attachedTo.transitionId) : undefined;
  const host = ec.attachedTo.screenId ?? via?.from.screenId;
  return (
    <>
      <Section title="What happens">
        <div className="ins-text"><InlineText multiline value={ec.scenario} onCommit={(v) => addChange({ op: "update-edge-case", edgeCaseId: ec.id, patch: { scenario: v } })} /></div>
      </Section>
      <Section title="How the design answers">
        <div className="ins-text"><InlineText multiline value={ec.handling} placeholder="Not decided yet" onCommit={(v) => addChange({ op: "update-edge-case", edgeCaseId: ec.id, patch: { handling: v } })} /></div>
      </Section>
      <Section title="Details">
        <div className="kv"><span className="k">Severity</span>
          <label className="ins-select small"><select value={ec.severity} onChange={(e) => addChange({ op: "update-edge-case", edgeCaseId: ec.id, patch: { severity: e.target.value as Severity } })}>{["low", "medium", "high"].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select><Icon name="chevron-down" size={13} /></label>
        </div>
        {via ? <Row mark={<span className="mark accent" />} onClick={() => select({ kind: "transition", id: via.id })} trailing={<span className="row-k">On</span>}>{via.trigger[0].toUpperCase() + via.trigger.slice(1)}</Row>
          : host ? <Row mark={<span className="mark accent" />} onClick={() => select({ kind: "node", id: `screen:${host}` })} trailing={<span className="row-k">Screen</span>}>{spec.screens.find((x) => x.id === host)?.name}</Row> : null}
      </Section>
      <div className="ins-foot"><button className="link quiet" onClick={() => addChange({ op: "remove-edge-case", edgeCaseId: ec.id })}>Remove edge case</button></div>
    </>
  );
}

function InspirationPanel({ node }: { node: Extract<CanvasNode, { type: "inspiration" }> }) {
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const run = useFlow((s) => s.run);
  const running = useFlow((s) => s.agent.running);
  const canvas = useFlow((s) => s.bundle!.canvas);
  const spec = useFlow((s) => s.bundle!.spec);
  const projectId = useFlow((s) => s.projectId)!;
  const [caption, setCaption] = useState(node.caption);
  useEffect(() => setCaption(node.caption), [node.caption]);
  const save = () => updateCanvas((c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === node.id && n.type === "inspiration" ? { ...n, caption } : n)) }));
  const targets = canvas.edges.filter((e) => e.type === "magic" && e.source === node.id);
  return (
    <>
      {node.kind === "image" && node.path && <div className="ins-media"><img src={api.fileUrl(projectId, node.path)} alt="" /></div>}
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
      <div className="ins-foot"><button className="link quiet" onClick={() => { updateCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== node.id), edges: c.edges.filter((e) => e.source !== node.id && e.target !== node.id) })); useFlow.getState().select(null); }}>Remove from canvas</button></div>
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
      <div className="sec small" style={{ lineHeight: 1.5, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{node.text}</div>
      {node.kind === "brief" && spec.screens.length > 0 && <div className="sec"><button className="btn" style={{ width: "100%" }} onClick={() => addChange({ op: "update-brief", brief: spec.brief })}>Queue a full regeneration from this brief</button><div className="muted small" style={{ marginTop: 6 }}>Rewrites every screen. Use sparingly; prefer targeted changes.</div></div>}
    </>
  );
}

function VariantPanel({ node }: { node: Extract<CanvasNode, { type: "variantPanel" }> }) {
  const run = useFlow((s) => s.run);
  const running = useFlow((s) => s.agent.running);
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const select = useFlow((s) => s.select);
  const spec = useFlow((s) => s.bundle!.spec);
  const screenId = node.target.screenId;
  const screenName = spec.screens.find((sc) => sc.id === screenId)?.name ?? "Project";
  const [dir, setDir] = useState(node.direction);
  return (
    <>
      <Section title="Direction">
        <input className="input" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="warmer, denser, more editorial…" />
        <button className="btn dark sm" style={{ marginTop: 10 }} disabled={running} onClick={() => run("variants", { target: node.target, count: 3, direction: dir, nodeId: node.id }, `More variants: ${dir || "same direction"}`)}>Three more <Icon name="sparkles" size={13} /></button>
      </Section>
      {screenId && <Section title="Screen"><Row mark={<span className="mark accent" />} onClick={() => select({ kind: "node", id: `screen:${screenId}` })}>{screenName}</Row></Section>}
      <div className="ins-foot"><button className="link quiet" onClick={() => { updateCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== node.id), edges: c.edges.filter((e) => e.source !== node.id && e.target !== node.id) })); useFlow.getState().select(null); }}>Remove exploration</button></div>
    </>
  );
}

function VersionPinPanel({ node }: { node: Extract<CanvasNode, { type: "versionPin" }> }) {
  const setPreviewVersion = useFlow((s) => s.setPreviewVersion);
  const restoreVersion = useFlow((s) => s.restoreVersion);
  return (
    <>
      <div className="sec" style={{ display: "grid", gap: 6 }}><button className="btn" onClick={() => setPreviewVersion(node.versionId)}>Preview</button><button className="btn" onClick={async () => (await confirm("Restore this version?", "The current state stays in history as its own version.")) && restoreVersion(node.versionId)}>Restore</button></div>
    </>
  );
}

function GenericPanel({ title, node }: { title: string; node: CanvasNode }) {
  const updateCanvas = useFlow((s) => s.updateCanvas);
  return (
    <>
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
