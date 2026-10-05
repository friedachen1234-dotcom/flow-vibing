import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, MiniMap, ReactFlow, applyEdgeChanges, applyNodeChanges, useReactFlow, useViewport,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type OnSelectionChangeParams, MarkerType
} from "@xyflow/react";
import { FLOW_CARD_WIDTH, MAGIC_RELATION_LABELS, classifyTransitions, mainMoves, type CanvasDoc, type CanvasNode, type DesignSpec, type MagicRelation, type ViewMode } from "@flow/shared";
import { flowCardHeight, tidyLayout } from "./layout";
import { Icon } from "../components/Icon";

function focusScreenOf(selection: { kind: string; id: string } | null, spec: { transitions: { id: string; from: { screenId: string } }[] }): string | undefined {
  if (!selection) return undefined;
  if (selection.kind === "node" && selection.id.startsWith("screen:")) return selection.id.slice(7);
  if (selection.kind === "transition") return spec.transitions.find((t) => t.id === selection.id)?.from.screenId;
  return undefined;
}
import { api } from "../api";
import { useFlow } from "../store";
import { nodeTypes, PickBubble } from "./nodes";
import { ask } from "../components/Dialog";
import { edgeTypes } from "./edges";

type Pending = { source: string; target: string; x: number; y: number; targetElementId?: string };

// Stable references: React Flow re-syncs inline objects into its store on every render, which can loop.
const FIT_OPTS = { padding: 0.15 };
const CONN_LINE_STYLE = { stroke: "var(--magic)", strokeDasharray: "7 5" };
const PRO_OPTS = { hideAttribution: true };
const minimapColor = (n: Node) => (n.type === "screen" || n.type === "screenCard" ? "#2C4FDB" : n.type === "inspiration" || n.type === "skill" ? "#B8368B" : "#C9CFD8");

/**
 * True when the saved viewport has at least one node's centre on screen. A viewport is saved on every pan, so a
 * project can be left looking at empty board, or at the corner of one card at high zoom; opening it there shows
 * nothing useful and gives no clue where the work went. A sliver at the edge does not count as oriented.
 */
function viewportShowsSomething(canvas: CanvasDoc, spec: DesignSpec, view: ViewMode, pane: { w: number; h: number }): boolean {
  const { x, y, zoom } = canvas.viewport;
  for (const n of canvas.nodes) {
    if (n.type === "edgeCase") continue;
    const w = n.type === "screen" ? (view === "flow" ? FLOW_CARD_WIDTH : n.width ?? spec.device.width) : n.width ?? 240;
    const h = n.type === "screen" ? (view === "flow" ? flowCardHeight(spec, n.screenId) : (n.height ?? spec.device.height) + 36) : n.height ?? 160;
    const cx = (n.position.x + w / 2) * zoom + x, cy = (n.position.y + h / 2) * zoom + y;
    if (cx > 0 && cy > 0 && cx < pane.w && cy < pane.h) return true;
  }
  return false;
}

const SHORTCUTS: [string, string][] = [
  ["1 / 2", "Prototype view / Flow view"],
  ["V", "Select"],
  ["P", "Pick an element inside a prototype"],
  ["W", "Present the flow full screen"],
  ["N", "New note"],
  ["I / C / H", "Inspect / Claude / History panel"],
  ["⇧1", "Fit everything on screen"],
  ["⌘= / ⌘−", "Zoom in / out"],
  ["⌘0", "Zoom to 100%"],
  ["⌫", "Remove the selected note, reference, or line"],
  ["Esc", "Deselect, stop picking, close this"],
  ["⌘↵", "Send to Claude from the composer"],
  ["?", "This list"],
];

export function Canvas() {
  const bundle = useFlow((s) => s.bundle)!;
  const projectId = useFlow((s) => s.projectId)!;
  const view = useFlow((s) => s.view);
  const selection = useFlow((s) => s.selection);
  const select = useFlow((s) => s.select);
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const addChange = useFlow((s) => s.addChange);
  const showInfluences = useFlow((s) => s.showInfluences);
  const setShowInfluences = useFlow((s) => s.setShowInfluences);
  const showMinimap = useFlow((s) => s.showMinimap);
  const setShowMinimap = useFlow((s) => s.setShowMinimap);
  const { zoom } = useViewport();
  const picked = useFlow((s) => s.picker.picked);
  const walk = useFlow((s) => s.walk);
  const setWalk = useFlow((s) => s.setWalk);
  const showToast = useFlow((s) => s.showToast);
  const rf = useReactFlow();
  const { spec, canvas } = bundle;
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* Derive React Flow nodes and edges from the spec and canvas for the active view. */
  const derived = useMemo(() => {
    const nodes: Node[] = [];
    for (const n of canvas.nodes) {
      if (n.type === "edgeCase") continue; // edge cases render inside their screen card
      const common = { id: n.id, position: n.position, data: { node: n, spec, primaryMoves: canvas.primaryMoves, expanded: view === "flow" && selection?.kind === "node" && selection.id === n.id }, selected: selection?.kind === "node" && selection.id === n.id };
      if (n.type === "screen") nodes.push({ ...common, type: view === "flow" ? "screenCard" : "screen", dragHandle: ".hdr", zIndex: common.data.expanded ? 10 : 1 });
      else if (n.type === "group") nodes.push({ ...common, type: "group", zIndex: -1, style: { width: n.width, height: n.height } });
      else nodes.push({ ...common, type: n.type, dragHandle: n.type === "prompt" || n.type === "note" ? undefined : ".hdr", zIndex: 2 });
    }
    const edges: Edge[] = [];
    if (view === "flow") {
      // Map level: forward moves only, each line starting at its labelled row on the source card.
      // Focus level: a selected screen (or transition) lights up its own moves, including returns, and fades the rest.
      const kinds = classifyTransitions(spec);
      const mains = new Set(mainMoves(spec, canvas.primaryMoves).values());
      const screenPos = new Map(canvas.nodes.filter((n) => n.type === "screen").map((n) => [n.screenId, n.position] as const));
      // Lines that travel backwards (target left of source) orbit below the whole row instead of crossing cards.
      const screenBottom = Math.max(0, ...canvas.nodes.filter((n) => n.type === "screen").map((n) => n.position.y + flowCardHeight(spec, n.screenId) + (focusScreenOf(selection, spec) === n.screenId ? 420 : 0)));
      let lane = 0;
      const focusScreen = selection?.kind === "node" && selection.id.startsWith("screen:") ? selection.id.slice(7)
        : selection?.kind === "transition" ? spec.transitions.find((t) => t.id === selection.id)?.from.screenId : undefined;
      for (const t of spec.transitions) {
        const kind = kinds.get(t.id) ?? "forward";
        const touches = !!focusScreen && (t.from.screenId === focusScreen || t.to.screenId === focusScreen);
        if (kind === "state") continue;
        if (kind === "back" && !(focusScreen === t.from.screenId)) continue; // return rows exist only on the expanded card
        if (kind === "forward" && !mains.has(t.id) && !(focusScreen === t.from.screenId)) continue; // alternatives appear only on the focused card
        const toState = t.to.stateId && focusScreen === t.to.screenId ? `in:${t.to.stateId}` : "in";
        const sx = screenPos.get(t.from.screenId)?.x ?? 0, tx = screenPos.get(t.to.screenId)?.x ?? 0;
        const loop = tx <= sx;
        const orbitY = loop ? screenBottom + 40 + (lane++ % 6) * 14 : undefined;
        edges.push({
          id: `t:${t.id}`, type: "transition", source: `screen:${t.from.screenId}`, target: `screen:${t.to.screenId}`, sourceHandle: `out:${t.id}`, targetHandle: toState,
          data: { transition: t, kind, dim: !!focusScreen && !touches, lit: touches, main: mains.has(t.id), orbitY },
          selected: selection?.kind === "transition" && selection.id === t.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: kind === "back" ? "#7C8494" : "#2C4FDB", width: 14, height: 14 }, zIndex: touches ? 4 : 3
        });
      }
    }
    for (const e of canvas.edges) {
      if (e.type === "provenance" && !showInfluences) continue;
      if (!canvas.nodes.some((n) => n.id === e.source) || !canvas.nodes.some((n) => n.id === e.target)) continue;
      const srcNode = canvas.nodes.find((n) => n.id === e.source), tgtNode = canvas.nodes.find((n) => n.id === e.target);
      const flowCard = (n?: CanvasNode) => view === "flow" && n?.type === "screen";
      edges.push({ id: e.id, type: e.type, source: e.source, target: e.target, sourceHandle: "out", targetHandle: "in", data: { edge: e }, selected: selection?.kind === "edge" && selection.id === e.id, zIndex: 3 });
    }
    if (showInfluences) {
      // Provenance drawn live from the spec so it always reflects the latest generation.
      for (const s of spec.screens) for (const p of s.provenance) {
        if (!canvas.nodes.some((n) => n.id === p.sourceNodeId)) continue;
        const id = `prov:${p.sourceNodeId}:${s.id}`;
        if (edges.some((e) => e.id === id)) continue;
        edges.push({ id, type: "provenance", source: p.sourceNodeId, target: `screen:${s.id}`, sourceHandle: "out", targetHandle: "in", zIndex: 0 });
      }
    }
    return { nodes, edges };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.nodes, canvas.edges, spec, view, selection, showInfluences]);

  const [nodes, setNodes] = useState<Node[]>(derived.nodes);
  const [edges, setEdges] = useState<Edge[]>(derived.edges);
  // Merge rather than replace, so React Flow keeps measurements and in-progress drags.
  useEffect(() => {
    setNodes((prev) => derived.nodes.map((n) => {
      const p = prev.find((x) => x.id === n.id);
      return p ? { ...p, ...n, position: p.dragging ? p.position : n.position } : n;
    }));
    setEdges(derived.edges);
  }, [derived]);
  const isDefaultViewport = canvas.viewport.x === 0 && canvas.viewport.y === 0 && canvas.viewport.zoom === 1;
  const fit = useCallback(() => requestAnimationFrame(() => void rf.fitView({ padding: 0.15, duration: 300 })), [rf]);
  const [initialViewport] = useState(canvas.viewport);
  const onMoveEnd = useCallback((_: unknown, vp: { x: number; y: number; zoom: number }) => updateCanvas((c) => ({ ...c, viewport: vp })), [updateCanvas]);
  const onPaneClick = useCallback(() => { select(null); setPending(null); }, [select]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), []);

  const onNodeDragStop = useCallback((_: unknown, node: Node, dragged: Node[]) => {
    const moved = dragged.length ? dragged : [node];
    updateCanvas((c) => ({ ...c, nodes: c.nodes.map((n) => { const m = moved.find((x) => x.id === n.id); return m ? { ...n, position: m.position } : n; }) }));
  }, [updateCanvas]);

  // Reads the store directly: React Flow may call a stale closure, and select() is idempotent.
  const onSelectionChange = useCallback(({ nodes: sn, edges: se }: OnSelectionChangeParams) => {
    const { select: sel } = useFlow.getState();
    if (sn.length) sel({ kind: "node", id: sn[0].id });
    else if (se.length) {
      const e = se[0];
      if (e.type === "transition") sel({ kind: "transition", id: e.id.slice(2) });
      else if (e.type === "magic" || e.type === "variantLink") sel({ kind: "edge", id: e.id });
    } else sel(null);
  }, []);

  /** Connecting nodes: reference → anything is a magic line; screen → screen in flow view is a new transition. */
  const onConnect = useCallback(async (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const src = canvas.nodes.find((n) => n.id === c.source);
    const tgt = canvas.nodes.find((n) => n.id === c.target);
    if (!src || !tgt) return;
    const isRef = src.type === "inspiration" || src.type === "skill" || src.type === "note" || src.type === "versionPin" || src.type === "group" || src.type === "prompt";
    if (src.type === "screen" && tgt.type === "screen" && view === "flow") {
      const trigger = await ask("New transition", { label: `From ${spec.screens.find((s) => s.id === src.screenId)?.name} to ${spec.screens.find((s) => s.id === tgt.screenId)?.name}. What triggers it?`, placeholder: "tap Continue" });
      if (!trigger?.trim()) return;
      const condition = (await ask("Condition", { label: "Only if this is a branch. Leave empty for none.", placeholder: "cart has items" })) ?? "";
      const stateId = c.targetHandle?.startsWith("in:") ? c.targetHandle.slice(3) : undefined;
      addChange({ op: "add-transition", from: { screenId: src.screenId }, to: { screenId: tgt.screenId, stateId }, trigger: trigger.trim(), condition: condition.trim() || undefined });
      return;
    }
    if (isRef) {
      const p = rf.flowToScreenPosition(tgt.position);
      const box = wrapRef.current?.getBoundingClientRect();
      setPending({ source: src.id, target: tgt.id, x: p.x - (box?.left ?? 0), y: p.y - (box?.top ?? 0), targetElementId: tgt.type === "screen" && picked?.screenId === tgt.screenId ? picked.elementId : undefined });
      return;
    }
    showToast("Connect a reference, skill, or note to a target. In flow view, connect screens to add a transition.");
  }, [canvas.nodes, view, addChange, rf, picked, showToast, spec.screens]);

  const commitMagic = async (relation: MagicRelation) => {
    if (!pending) return;
    let note = "";
    if (relation === "free-text") { note = (await ask("How should this reference influence the target?", { multiline: true, placeholder: "Use its card layout but keep our colours" })) ?? ""; if (!note.trim()) { setPending(null); return; } }
    updateCanvas((c) => ({ ...c, edges: [...c.edges, { id: `magic-${Date.now().toString(36)}`, type: "magic", source: pending.source, target: pending.target, targetElementId: pending.targetElementId, relation, note }] }));
    setPending(null);
  };

  /* Drops from the desktop: images → inspiration, markdown → skill, text/URL → inspiration. */
  const onDrop = useCallback(async (ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(false);
    const pos = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
    const add = (node: CanvasNode) => {
      updateCanvas((c) => ({ ...c, nodes: [...c.nodes, node] }));
      if (node.type === "inspiration" && node.kind === "image") {
        void useFlow.getState().saveCanvasNow().then(() => { const st = useFlow.getState(); if (!st.agent.running) st.run("describe", { nodeId: node.id }, `Describe "${node.title}"`); });
      }
    };
    const files = Array.from(ev.dataTransfer.files);
    for (const [i, f] of files.entries()) {
      const p = { x: pos.x + i * 30, y: pos.y + i * 30 };
      if (f.type.startsWith("image/")) {
        const b64 = await fileToBase64(f);
        const { path } = await api.uploadAsset(projectId, "inspirations", f.name, { dataBase64: b64 });
        add({ id: `insp-${Date.now().toString(36)}${i}`, type: "inspiration", kind: "image", title: f.name.replace(/\.[^.]+$/, ""), path, caption: "", description: "", position: p, width: 240 });
      } else if (/\.(md|markdown|txt)$/i.test(f.name)) {
        const text = await f.text();
        if (/\.md|markdown/i.test(f.name)) {
          const { path } = await api.uploadAsset(projectId, "skills", f.name, { text });
          const title = text.match(/^#\s+(.+)$/m)?.[1] ?? f.name.replace(/\.[^.]+$/, "");
          add({ id: `skill-${Date.now().toString(36)}${i}`, type: "skill", path, title, position: p });
        } else add({ id: `insp-${Date.now().toString(36)}${i}`, type: "inspiration", kind: "text", title: f.name, text, caption: "", description: "", position: p, width: 240 });
      }
    }
    if (files.length === 0) {
      const text = ev.dataTransfer.getData("text/uri-list") || ev.dataTransfer.getData("text/plain");
      if (text) add(nodeFromText(text, pos));
    }
  }, [rf, updateCanvas, projectId]);

  useEffect(() => {
    const onPaste = async (ev: ClipboardEvent) => {
      if ((ev.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      const items = Array.from(ev.clipboardData?.items ?? []);
      const center = rf.screenToFlowPosition({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 150 });
      const img = items.find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (img) {
        const b64 = await fileToBase64(img);
        const { path } = await api.uploadAsset(projectId, "inspirations", `pasted-${Date.now()}.png`, { dataBase64: b64 });
        const id = `insp-${Date.now().toString(36)}`;
        updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id, type: "inspiration", kind: "image", title: "Pasted image", path, caption: "", description: "", position: center, width: 240 }] }));
        await useFlow.getState().saveCanvasNow();
        if (!useFlow.getState().agent.running) useFlow.getState().run("describe", { nodeId: id }, "Describe the pasted image");
        return;
      }
      const text = ev.clipboardData?.getData("text/plain");
      if (text?.trim()) updateCanvas((c) => ({ ...c, nodes: [...c.nodes, nodeFromText(text.trim(), center)] }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [rf, updateCanvas, projectId]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      const st = useFlow.getState();
      if (ev.metaKey || ev.ctrlKey) {
        // The browser's own zoom chords zoom the board instead, as in any design tool.
        if (ev.key === "=" || ev.key === "+") { ev.preventDefault(); rf.zoomIn({ duration: 150 }); }
        else if (ev.key === "-") { ev.preventDefault(); rf.zoomOut({ duration: 150 }); }
        else if (ev.key === "0") { ev.preventDefault(); void rf.zoomTo(1, { duration: 200 }); }
        return;
      }
      if (ev.key === "p" || ev.key === "P") st.setPicker(!st.picker.enabled);
      if (ev.key === "v" || ev.key === "V") { st.setPicker(false); if (st.walk.active) st.setWalk({ active: false, screenId: null, stateId: null, lastTransitionId: null }); }
      if (ev.key === "w" || ev.key === "W") st.setWalk({ active: !st.walk.active, screenId: st.walk.active ? null : (spec.screens[0]?.id ?? null), stateId: null, lastTransitionId: null });
      if (ev.key === "i" || ev.key === "I") st.setPanel(st.panel === "inspect" ? null : "inspect");
      if (ev.key === "c" || ev.key === "C") st.setPanel(st.panel === "claude" ? null : "claude");
      if (ev.key === "h" || ev.key === "H") st.setPanel(st.panel === "history" ? null : "history");
      if (ev.key === "n" || ev.key === "N") updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id: `note-${Date.now().toString(36)}`, type: "note", text: "", position: { x: -c.viewport.x / c.viewport.zoom + 120, y: -c.viewport.y / c.viewport.zoom + 120 }, width: 240 }] }));
      if (ev.key === "1" && !ev.shiftKey) st.setView("prototype");
      if (ev.key === "2") st.setView("flow");
      if (ev.key === "!" || (ev.key === "1" && ev.shiftKey)) fit();
      if (ev.key === "=" || ev.key === "+") rf.zoomIn({ duration: 150 });
      if (ev.key === "-") rf.zoomOut({ duration: 150 });
      if (ev.key === "?") setShowKeys((v) => !v);
      if (ev.key === "Escape") { useFlow.getState().setPicker(false); select(null); setPending(null); setShowKeys(false); }
      if ((ev.key === "Delete" || ev.key === "Backspace") && selection) {
        if (selection.kind === "node") {
          const n = canvas.nodes.find((x) => x.id === selection.id);
          if (n && n.type !== "screen" && n.type !== "edgeCase") { updateCanvas((c) => ({ ...c, nodes: c.nodes.filter((x) => x.id !== n.id), edges: c.edges.filter((e) => e.source !== n.id && e.target !== n.id) })); select(null); }
        } else if (selection.kind === "edge") { updateCanvas((c) => ({ ...c, edges: c.edges.filter((e) => e.id !== selection.id) })); select(null); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, canvas.nodes, updateCanvas, select, spec.screens, fit, rf]);

  useEffect(() => {
    const onCanvasWheel = (ev: Event) => {
      const d = (ev as CustomEvent<{ deltaX: number; deltaY: number; deltaMode: number; zoom: boolean; pinch: boolean; clientX: number; clientY: number }>).detail;
      const vp = rf.getViewport();
      const unit = d.deltaMode === 1 ? 16 : d.deltaMode === 2 ? 400 : 1;
      if (d.zoom) {
        // Zoom about the pointer, matching the feel of the board's own wheel handling.
        const factor = Math.pow(2, -d.deltaY * unit * (d.pinch ? 0.02 : 0.002));
        const z = Math.max(0.05, Math.min(2, vp.zoom * factor));
        const box = wrapRef.current?.getBoundingClientRect();
        const px = d.clientX - (box?.left ?? 0), py = d.clientY - (box?.top ?? 0);
        void rf.setViewport({ x: px - (px - vp.x) * (z / vp.zoom), y: py - (py - vp.y) * (z / vp.zoom), zoom: z });
      } else {
        void rf.setViewport({ x: vp.x - d.deltaX * unit * 0.5, y: vp.y - d.deltaY * unit * 0.5, zoom: vp.zoom });
      }
    };
    // Pinch and modifier-scroll over the panels would still zoom the page; the board is the only thing that zooms here.
    const guard = (ev: WheelEvent) => { if (ev.ctrlKey || ev.metaKey) ev.preventDefault(); };
    const gesture = (ev: Event) => ev.preventDefault();
    window.addEventListener("flow:canvas-wheel", onCanvasWheel);
    window.addEventListener("wheel", guard, { passive: false });
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) window.addEventListener(t, gesture, { passive: false });
    return () => {
      window.removeEventListener("flow:canvas-wheel", onCanvasWheel);
      window.removeEventListener("wheel", guard);
      for (const t of ["gesturestart", "gesturechange", "gestureend"]) window.removeEventListener(t, gesture);
    };
  }, [rf]);

  const pickedFull = useFlow((s) => s.picker.picked);
  const frames = useFlow((s) => s.frames);
  // The picked element's rect is in the frame's own pixels, which are flow units inside the screen node (header is 36 tall).
  const bubbleStyle = useMemo(() => {
    if (!pickedFull || view !== "prototype" || !wrapRef.current) return null;
    const host = canvas.nodes.find((n) => n.type === "screen" && (frames[n.screenId]?.screenId ?? n.screenId) === pickedFull.screenId) ?? canvas.nodes.find((n) => n.type === "screen" && n.screenId === pickedFull.screenId);
    if (!host) return null;
    const r = pickedFull.rect ?? { x: 12, y: 12, width: 0, height: 0 };
    const p = rf.flowToScreenPosition({ x: host.position.x + r.x, y: host.position.y + 36 + r.y + r.height });
    const box = wrapRef.current.getBoundingClientRect();
    const W = 272, H = 124;
    const left = Math.max(8, Math.min(box.width - W - 8, p.x - box.left));
    let top = p.y - box.top + 8;
    if (top + H > box.height - 70) top = Math.max(8, rf.flowToScreenPosition({ x: 0, y: host.position.y + 36 + r.y }).y - box.top - H - 8);
    return { left, top, width: W } as React.CSSProperties;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedFull, view, canvas.nodes, frames, rf, zoom]);

  const walkScreen = walk.active && walk.screenId ? spec.screens.find((s) => s.id === walk.screenId) : null;
  const walkOut = walkScreen ? spec.transitions.filter((t) => t.from.screenId === walkScreen.id) : [];

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onSelectionChange={onSelectionChange}
        defaultViewport={initialViewport} onMoveEnd={onMoveEnd}
        onInit={(inst) => {
          const box = wrapRef.current?.getBoundingClientRect();
          if (box && !isDefaultViewport && canvas.nodes.length > 0 && !viewportShowsSomething(canvas, spec, view, { w: box.width, h: box.height })) void inst.fitView(FIT_OPTS);
        }}
        connectionRadius={40} minZoom={0.05} maxZoom={2} fitView={isDefaultViewport && canvas.nodes.length > 0} fitViewOptions={FIT_OPTS} panOnScroll selectionOnDrag={false} zoomOnDoubleClick={false} deleteKeyCode={null} connectionLineStyle={CONN_LINE_STYLE} proOptions={PRO_OPTS}
        onPaneClick={onPaneClick}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dot)" />
        {showMinimap && <MiniMap pannable zoomable nodeColor={minimapColor} />}
      </ReactFlow>
      <div className="canvas-bar" role="toolbar" aria-label="Canvas">
        <button className="cb-btn" onClick={() => rf.zoomOut({ duration: 150 })} title="Zoom out (−)" aria-label="Zoom out"><Icon name="zoom-out" size={15} /></button>
        <button className="cb-zoom" onClick={fit} title="Fit to content (⇧1)">{Math.round(zoom * 100)}%</button>
        <button className="cb-btn" onClick={() => rf.zoomIn({ duration: 150 })} title="Zoom in (+)" aria-label="Zoom in"><Icon name="zoom-in" size={15} /></button>
        <span className="cb-sep" />
        <button className="cb-btn" onClick={fit} title="Fit to content" aria-label="Fit to content"><Icon name="maximize" size={15} /></button>
        {view === "flow" && <button className="cb-btn" onClick={() => { updateCanvas((c) => tidyLayout(spec, c, view)); fit(); }} disabled={spec.screens.length === 0} title="Tidy: arrange screens along the flow" aria-label="Tidy layout"><Icon name="layout-grid" size={15} /></button>}
        <span className="cb-sep" />
        <button className={`cb-btn ${showInfluences ? "on" : ""}`} onClick={() => setShowInfluences(!showInfluences)} title="Show which references shaped each screen" aria-label="Show influences" aria-pressed={showInfluences}><Icon name="sparkles" size={15} /></button>
        <button className={`cb-btn ${showMinimap ? "on" : ""}`} onClick={() => setShowMinimap(!showMinimap)} title="Minimap" aria-label="Minimap" aria-pressed={showMinimap}><Icon name="map" size={15} /></button>
        <span className="cb-sep" />
        <button className={`cb-btn cb-keys ${showKeys ? "on" : ""}`} onClick={() => setShowKeys(!showKeys)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" aria-pressed={showKeys}>?</button>
      </div>
      {showKeys && (
        <div className="keys-overlay" onClick={() => setShowKeys(false)} role="dialog" aria-label="Keyboard shortcuts">
          <div className="keys" onClick={(e) => e.stopPropagation()}>
            <div className="keys-head">Keyboard shortcuts <button className="btn sm ghost" onClick={() => setShowKeys(false)}>Close</button></div>
            <div className="keys-grid">
              {SHORTCUTS.map(([k, what]) => <div key={k} className="keys-row"><span className="kbd">{k}</span><span>{what}</span></div>)}
            </div>
            <div className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>Scroll pans the board. Pinch, or hold ⌘ while scrolling, to zoom. Select a screen to scroll inside it. Drop or paste images, markdown, text, or a URL anywhere to add a reference, then drag from its right handle to a screen to say how it should influence it.</div>
          </div>
        </div>
      )}
      {spec.screens.length === 0 && !dragOver && (
        <div className="canvas-empty">
          <div className="ce-title">No screens yet</div>
          <div className="ce-body">Write the brief on the card above. Drop any references beside it and draw a line to the brief. Then press <b>Generate</b>.</div>
        </div>
      )}
      {dragOver && <div className="drop-hint">Drop images, markdown skills, or text</div>}
      {pickedFull && bubbleStyle && <PickBubble picked={pickedFull} style={bubbleStyle} />}
      {pending && (
        <div className="popover" style={{ left: pending.x, top: pending.y }}>
          <div className="muted small" style={{ padding: "4px 8px 6px" }}>How should this reference influence the target?{pending.targetElementId ? ` (element ${pending.targetElementId})` : ""}</div>
          {(Object.keys(MAGIC_RELATION_LABELS) as MagicRelation[]).map((r) => (
            <div key={r} className="opt" onClick={() => commitMagic(r)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && commitMagic(r)}><b>{MAGIC_RELATION_LABELS[r].label}</b><span>{MAGIC_RELATION_LABELS[r].hint}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
}

function nodeFromText(text: string, position: { x: number; y: number }): CanvasNode {
  const id = `insp-${Date.now().toString(36)}`;
  if (/^https?:\/\/\S+$/i.test(text)) { let title = text; try { title = new URL(text).hostname; } catch { /* keep */ } return { id, type: "inspiration", kind: "url", title, url: text, caption: "", description: "", position, width: 240 }; }
  if (/^#[0-9a-f]{3,8}$/i.test(text) || /^(rgb|hsl)a?\(/i.test(text)) return { id, type: "inspiration", kind: "style", title: "Colour", text, caption: "", description: "", position, width: 240 };
  if (/^[A-Z][A-Za-z ]{2,30}$/.test(text) && text.split(" ").length <= 3) return { id, type: "inspiration", kind: "style", title: "Typeface", text, caption: "", description: "", position, width: 240 };
  return { id, type: "inspiration", kind: "text", title: text.slice(0, 40) + (text.length > 40 ? "…" : ""), text, caption: "", description: "", position, width: 240 };
}
