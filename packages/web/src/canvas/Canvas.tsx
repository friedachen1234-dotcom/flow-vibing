import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, MiniMap, ReactFlow, applyEdgeChanges, applyNodeChanges, useReactFlow, useViewport,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type OnSelectionChangeParams, MarkerType
} from "@xyflow/react";
import { MAGIC_RELATION_LABELS, classifyTransition, classifyTransitions, hostScreen, mainMoves, type CanvasDoc, type CanvasNode, type DesignSpec, type MagicRelation, type ViewMode } from "@flow/shared";
import { EDGE_CASE_W, FLOW_CARD_W, edgeCaseStackHeight, flowCardHeight, tidyLayout } from "./layout";
import { Icon } from "../components/Icon";
import { api } from "../api";
import { useFlow } from "../store";
import { nodeTypes } from "./nodes";
import { ask } from "../components/Dialog";
import { edgeTypes } from "./edges";
import { Composer } from "../components/Composer";

type Pending = { source: string; target: string; x: number; y: number; targetElementId?: string };

// Stable references: React Flow re-syncs inline objects into its store on every render, which can loop.
const FIT_OPTS = { padding: 0.15 };
const CONN_LINE_STYLE = { stroke: "var(--accent)", strokeDasharray: "7 5" };
const PRO_OPTS = { hideAttribution: true };
const PAN_BUTTONS = [1, 2];
const minimapColor = (n: Node) => (n.type === "screen" || n.type === "screenCard" ? "#C9D4F7" : n.type === "edgeCase" ? "#F5DFA8" : n.type === "inspiration" || n.type === "skill" ? "#E7CBE9" : "#D9DEE6");

function focusScreenOf(selection: { kind: string; id: string } | null, spec: DesignSpec): string | undefined {
  if (!selection) return undefined;
  if (selection.kind === "node" && selection.id.startsWith("screen:")) return selection.id.slice(7);
  if (selection.kind === "node" && selection.id.startsWith("edgecase:")) { const ec = spec.edgeCases.find((e) => e.id === selection.id.slice(9)); return ec ? hostScreen(spec, ec.attachedTo) : undefined; }
  if (selection.kind === "transition") return spec.transitions.find((t) => t.id === selection.id)?.from.screenId;
  return undefined;
}

/**
 * A screen is far taller in prototype view than in flow view, and its edge cases only exist in flow view, so a panel
 * parked under a screen in one view can land inside it in the other. Push it clear rather than let it overlap.
 */
function panelPosition(n: Extract<CanvasNode, { type: "variantPanel" }>, canvas: CanvasDoc, spec: DesignSpec, view: ViewMode, showEdgeCases: boolean): { x: number; y: number } {
  const host = n.target.screenId ? canvas.nodes.find((h) => h.type === "screen" && h.screenId === n.target.screenId) : undefined;
  if (!host || host.type !== "screen") return n.position;
  const w = view === "flow" ? Math.max(FLOW_CARD_W, 36 + EDGE_CASE_W) : host.width ?? spec.device.width;
  const ecs = view === "flow" && showEdgeCases ? spec.edgeCases.filter((e) => hostScreen(spec, e.attachedTo) === host.screenId).length : 0;
  const bottom = host.position.y + (view === "flow" ? flowCardHeight(spec, host.screenId) + edgeCaseStackHeight(ecs) : (host.height ?? spec.device.height) + 40);
  const overlapsX = n.position.x < host.position.x + w && n.position.x + 640 > host.position.x;
  if (!overlapsX || n.position.y >= bottom + 40 || n.position.y + 330 <= host.position.y) return n.position;
  return { x: n.position.x, y: bottom + 60 };
}

/**
 * True when the saved viewport has at least one node's centre on screen. A viewport is saved on every pan, so a
 * project can be left looking at empty board, or at the corner of one card at high zoom; opening it there shows
 * nothing useful and gives no clue where the work went. A sliver at the edge does not count as oriented.
 */
function viewportShowsSomething(canvas: CanvasDoc, spec: DesignSpec, view: ViewMode, pane: { w: number; h: number }): boolean {
  const { x, y, zoom } = canvas.viewport;
  for (const n of canvas.nodes) {
    if (n.type === "edgeCase") continue;
    const w = n.type === "screen" ? (view === "flow" ? FLOW_CARD_W : n.width ?? spec.device.width) : n.width ?? 240;
    const h = n.type === "screen" ? (view === "flow" ? flowCardHeight(spec, n.screenId) : (n.height ?? spec.device.height) + 40) : n.height ?? 160;
    const cx = (n.position.x + w / 2) * zoom + x, cy = (n.position.y + h / 2) * zoom + y;
    if (cx > 0 && cy > 0 && cx < pane.w && cy < pane.h) return true;
  }
  return false;
}

const SHORTCUTS: [string, string][] = [
  ["1 / 2", "Prototype view / Flow view"],
  ["V / H", "Select / Hand"],
  ["P", "Pick an element inside a prototype"],
  ["W", "Run the prototype full screen"],
  ["N", "New note"],
  ["I / C", "Inspect / Claude panel"],
  ["E", "Show or hide edge cases"],
  ["⇧1", "Fit everything on screen"],
  ["⌘= / ⌘−", "Zoom in / out"],
  ["⌘0", "Zoom to 100%"],
  ["⌫", "Remove the selected note, reference, or line"],
  ["Esc", "Deselect, stop picking, close this"],
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
  const showEdgeCases = useFlow((s) => s.showEdgeCases);
  const setShowEdgeCases = useFlow((s) => s.setShowEdgeCases);
  const hand = useFlow((s) => s.hand);
  const { zoom } = useViewport();
  const picked = useFlow((s) => s.picker.picked);
  const showToast = useFlow((s) => s.showToast);
  const rf = useReactFlow();
  const { spec, canvas } = bundle;
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => requestAnimationFrame(() => void rf.fitView({ padding: 0.15, duration: 300 })), [rf]);

  /* Derive React Flow nodes and edges from the spec and canvas for the active view. */
  const derived = useMemo(() => {
    const nodes: Node[] = [];
    const focusScreen = focusScreenOf(selection, spec);
    const flow = view === "flow";
    const screenPos = new Map(canvas.nodes.filter((n) => n.type === "screen").map((n) => [n.screenId, n.position] as const));
    // Rows on a card, top to bottom: forward moves first, farthest target first, then higher target first; returns last.
    // Lines leave in that order and take lanes in that order, so they nest instead of crossing.
    const moveOrder = new Map<string, string[]>();
    if (flow) {
      for (const sc of spec.screens) {
        const key = (t: (typeof spec.transitions)[number]) => { const p = screenPos.get(t.to.screenId); return p ? [-p.x, p.y] : [Infinity, 0]; };
        const outs = spec.transitions.filter((t) => t.from.screenId === sc.id && classifyTransition(t) !== "state")
          .sort((a, b) => (classifyTransition(a) === "back" ? 1 : 0) - (classifyTransition(b) === "back" ? 1 : 0) || key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
        moveOrder.set(sc.id, outs.map((t) => t.id));
      }
    }
    for (const n of canvas.nodes) {
      const isSel = selection?.kind === "node" && selection.id === n.id;
      if (n.type === "edgeCase") {
        if (!flow || !showEdgeCases) continue; // in prototype view edge cases are a chip on the screen's header
        nodes.push({ id: n.id, position: n.position, type: "edgeCase", data: { node: n, spec }, selected: isSel, dragHandle: ".hdr", zIndex: 2 });
        continue;
      }
      if (flow && (n.type === "inspiration" || n.type === "skill" || n.type === "variantPanel")) continue; // references and explorations belong to the prototype reading; the flow view is about moves
      const common = { id: n.id, position: n.position, data: { node: n, spec, primaryMoves: canvas.primaryMoves }, selected: isSel };
      if (n.type === "screen") nodes.push({ ...common, data: { ...common.data, moveOrder: flow ? moveOrder.get(n.screenId) : undefined }, type: flow ? "screenCard" : "screen", dragHandle: ".hdr", zIndex: 1 });
      else if (n.type === "variantPanel") nodes.push({ ...common, position: panelPosition(n, canvas, spec, view, showEdgeCases), type: n.type, dragHandle: ".hdr", zIndex: 2 });
      else if (n.type === "group") nodes.push({ ...common, type: "group", zIndex: -1, style: { width: n.width, height: n.height } });
      else nodes.push({ ...common, type: n.type, dragHandle: n.type === "prompt" || n.type === "note" ? undefined : ".hdr", zIndex: 2 });
    }
    const edges: Edge[] = [];
    if (flow) {
      const kinds = classifyTransitions(spec);
      const mains = new Set(mainMoves(spec, canvas.primaryMoves).values());
      // The start marker sits to the left of the first screen and is never saved; it only says where the product opens.
      const first = spec.screens[0];
      const firstPos = first ? screenPos.get(first.id) : undefined;
      if (first && firstPos) {
        nodes.push({ id: "start", type: "start", position: { x: firstPos.x - 92, y: firstPos.y + 30 }, data: {}, draggable: false, selectable: false, zIndex: 1 });
        edges.push({ id: "start-edge", type: "start", source: "start", target: `screen:${first.id}`, sourceHandle: "out", targetHandle: "in", markerEnd: { type: MarkerType.ArrowClosed, color: "#1C8A6E", width: 12, height: 12 }, zIndex: 3 });
      }
      // Lines that travel backwards (target left of source) orbit below the whole row instead of crossing cards.
      const screenBottom = Math.max(0, ...canvas.nodes.filter((n) => n.type === "screen").map((n) => n.position.y + flowCardHeight(spec, n.screenId) + (showEdgeCases ? edgeCaseStackHeight(spec.edgeCases.filter((e) => hostScreen(spec, e.attachedTo) === n.screenId).length) : 0)));
      let lane = 0;
      for (const t of spec.transitions) {
        const kind = kinds.get(t.id) ?? "forward";
        const touches = !!focusScreen && (t.from.screenId === focusScreen || t.to.screenId === focusScreen);
        if (kind === "state") continue;
        if (kind === "back") continue; // returns are rows on the card, never lines: a line back across the flow says nothing the row does not
        const sx = screenPos.get(t.from.screenId)?.x ?? 0, tx = screenPos.get(t.to.screenId)?.x ?? 0;
        const loop = tx <= sx;
        const orbitY = loop ? screenBottom + 40 + (lane++ % 6) * 14 : undefined;
        edges.push({
          id: `t:${t.id}`, type: "transition", source: `screen:${t.from.screenId}`, target: `screen:${t.to.screenId}`, sourceHandle: `out:${t.id}`, targetHandle: "in",
          data: { transition: t, kind, dim: !!focusScreen && !touches, lit: touches, main: mains.has(t.id), orbitY },
          selected: selection?.kind === "transition" && selection.id === t.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: mains.has(t.id) || touches ? "#2C4FDB" : "#AEBBEF", width: 10, height: 10 }, zIndex: touches ? 4 : mains.has(t.id) ? 3 : 2
        });
      }
      // Lines leaving one card take lanes in row order: the top row's line runs on the left, so stubs never cross trunks.
      const bySource = new Map<string, Edge[]>();
      for (const e of edges) if (e.type === "transition" && (e.data as { orbitY?: number }).orbitY == null) bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
      const boxes = canvas.nodes.filter((n): n is Extract<CanvasNode, { type: "screen" }> => n.type === "screen").map((n) => ({ id: `screen:${n.screenId}`, x: n.position.x, y: n.position.y, w: FLOW_CARD_W, h: flowCardHeight(spec, n.screenId) }));
      let overLane = 0;
      for (const [sourceId, group] of bySource) {
        const order = moveOrder.get(sourceId.slice(7)) ?? [];
        group.sort((a, b) => order.indexOf(a.id.slice(2)) - order.indexOf(b.id.slice(2))).forEach((e, i) => { e.data = { ...e.data, lane: i, lanes: group.length }; });
        // A line whose straight run would pass through another card climbs over the row instead. Lower rows take the
        // lanes nearest the cards and the top row the outermost, so the climbs and drops nest too.
        for (const e of [...group].reverse()) {
          const src = boxes.find((b) => b.id === e.source), tgt = boxes.find((b) => b.id === e.target);
          if (!src || !tgt) continue;
          const sx = src.x + src.w, ty = tgt.y + 40;
          const blocking = boxes.filter((b) => b.id !== src.id && b.id !== tgt.id && b.x < tgt.x && b.x + b.w > sx && b.y < ty + 8 && b.y + b.h > ty - 8);
          if (!blocking.length) continue;
          const top = Math.min(src.y, tgt.y, ...blocking.map((b) => b.y));
          e.data = { ...e.data, overY: top - 36 - overLane++ * 12, trunkMax: Math.min(...blocking.map((b) => b.x)) - 24 };
        }
      }
      if (showEdgeCases) {
        for (const ec of spec.edgeCases) {
          const host = hostScreen(spec, ec.attachedTo);
          if (!host || !canvas.nodes.some((n) => n.type === "edgeCase" && n.edgeCaseId === ec.id)) continue;
          const touches = !!focusScreen && focusScreen === host;
          edges.push({ id: `ec:${ec.id}`, type: "edgeCase", source: `screen:${host}`, target: `edgecase:${ec.id}`, sourceHandle: "ec", targetHandle: "ec-in", data: { dim: !!focusScreen && !touches }, markerEnd: { type: MarkerType.ArrowClosed, color: "#D19A1F", width: 9, height: 9 }, zIndex: touches ? 4 : 2 });
        }
      }
    }
    const shown = new Set(nodes.map((n) => n.id));
    for (const e of canvas.edges) {
      if (e.type === "provenance" && !showInfluences) continue;
      if (!shown.has(e.source) || !shown.has(e.target)) continue;
      // Explorations hang under their screen, so that line leaves from the bottom and lands on the panel's top.
      const vertical = e.type === "variantLink";
      edges.push({ id: e.id, type: e.type, source: e.source, target: e.target, sourceHandle: vertical ? "below" : "out", targetHandle: vertical ? "top" : "in", data: { edge: e }, selected: selection?.kind === "edge" && selection.id === e.id, zIndex: 3 });
    }
    if (showInfluences) {
      // Provenance drawn live from the spec so it always reflects the latest generation.
      for (const s of spec.screens) for (const p of s.provenance) {
        if (!shown.has(p.sourceNodeId)) continue;
        const id = `prov:${p.sourceNodeId}:${s.id}`;
        if (edges.some((e) => e.id === id)) continue;
        edges.push({ id, type: "provenance", source: p.sourceNodeId, target: `screen:${s.id}`, sourceHandle: "out", targetHandle: "in", zIndex: 0 });
      }
    }
    return { nodes, edges };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.nodes, canvas.edges, canvas.primaryMoves, spec, view, selection, showInfluences, showEdgeCases]);

  // Screens are one size in flow view and another in prototype view, so a layout that is tidy in one can pile up in
  // the other. When a view switch leaves two screens overlapping, tidy for this view rather than show the pile.
  useEffect(() => {
    const screens = canvas.nodes.filter((n): n is Extract<CanvasNode, { type: "screen" }> => n.type === "screen");
    const size = (n: (typeof screens)[number]) => view === "flow" ? { w: FLOW_CARD_W, h: flowCardHeight(spec, n.screenId) } : { w: n.width ?? spec.device.width, h: (n.height ?? spec.device.height) + 40 };
    const overlap = screens.some((a, i) => screens.slice(i + 1).some((b) => {
      const A = size(a), B = size(b);
      return a.position.x < b.position.x + B.w && b.position.x < a.position.x + A.w && a.position.y < b.position.y + B.h && b.position.y < a.position.y + A.h;
    }));
    if (overlap) { updateCanvas((c) => tidyLayout(spec, c, view)); fit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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
  const [initialViewport] = useState(canvas.viewport);
  const onMoveEnd = useCallback((_: unknown, vp: { x: number; y: number; zoom: number }) => updateCanvas((c) => ({ ...c, viewport: vp })), [updateCanvas]);
  const onPaneClick = useCallback(() => { select(null); setPending(null); }, [select]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), []);

  const onNodeDragStop = useCallback((_: unknown, node: Node, dragged: Node[]) => {
    const moved = (dragged.length ? dragged : [node]).filter((n) => n.id !== "start");
    updateCanvas((c) => ({ ...c, nodes: c.nodes.map((n) => { const m = moved.find((x) => x.id === n.id); return m ? { ...n, position: m.position } : n; }) }));
  }, [updateCanvas]);

  // Reads the store directly: React Flow may call a stale closure, and select() is idempotent.
  const onSelectionChange = useCallback(({ nodes: sn, edges: se }: OnSelectionChangeParams) => {
    const { select: sel } = useFlow.getState();
    const node = sn.find((n) => n.id !== "start");
    if (node) sel({ kind: "node", id: node.id });
    else if (se.length) {
      const e = se[0];
      if (e.type === "transition") sel({ kind: "transition", id: e.id.slice(2) });
      else if (e.type === "edgeCase") sel({ kind: "node", id: `edgecase:${e.id.slice(3)}` });
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
      const trigger = await ask("New interaction", { label: `From ${spec.screens.find((s) => s.id === src.screenId)?.name} to ${spec.screens.find((s) => s.id === tgt.screenId)?.name}. What triggers it?`, placeholder: "tap Continue" });
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
    showToast("Connect a reference, skill, or note to a target. In flow view, connect screens to add an interaction.");
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
        add({ id: `insp-${Date.now().toString(36)}${i}`, type: "inspiration", kind: "image", title: f.name.replace(/\.[^.]+$/, ""), path, caption: "", description: "", position: p, width: 224 });
      } else if (/\.(md|markdown|txt)$/i.test(f.name)) {
        const text = await f.text();
        if (/\.md|markdown/i.test(f.name)) {
          const { path } = await api.uploadAsset(projectId, "skills", f.name, { text });
          const title = text.match(/^#\s+(.+)$/m)?.[1] ?? f.name.replace(/\.[^.]+$/, "");
          add({ id: `skill-${Date.now().toString(36)}${i}`, type: "skill", path, title, position: p });
        } else add({ id: `insp-${Date.now().toString(36)}${i}`, type: "inspiration", kind: "text", title: f.name, text, caption: "", description: "", position: p, width: 224 });
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
        updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id, type: "inspiration", kind: "image", title: "Pasted image", path, caption: "", description: "", position: center, width: 224 }] }));
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
      const k = ev.key.toLowerCase();
      if (k === "p") st.setPicker(!st.picker.enabled);
      if (k === "v") { st.setPicker(false); st.setHand(false); if (st.walk.active) st.setWalk({ active: false, screenId: null, stateId: null, lastTransitionId: null }); }
      if (k === "h") st.setHand(!st.hand);
      if (k === "w") st.setWalk({ active: !st.walk.active, screenId: st.walk.active ? null : (spec.screens[0]?.id ?? null), stateId: null, lastTransitionId: null });
      if (k === "i") st.setPanel(st.panel === "inspect" ? null : "inspect");
      if (k === "c") st.setPanel(st.panel === "claude" ? null : "claude");
      if (k === "e") st.setShowEdgeCases(!st.showEdgeCases);
      if (k === "n") updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id: `note-${Date.now().toString(36)}`, type: "note", text: "", position: { x: -c.viewport.x / c.viewport.zoom + 120, y: -c.viewport.y / c.viewport.zoom + 120 }, width: 240 }] }));
      if (ev.key === "1" && !ev.shiftKey) st.setView("prototype");
      if (ev.key === "2") st.setView("flow");
      if (ev.key === "!" || (ev.key === "1" && ev.shiftKey)) fit();
      if (ev.key === "=" || ev.key === "+") rf.zoomIn({ duration: 150 });
      if (ev.key === "-") rf.zoomOut({ duration: 150 });
      if (ev.key === "?") setShowKeys((v) => !v);
      if (ev.key === "Escape") { st.setPicker(false); st.setHand(false); select(null); setPending(null); setShowKeys(false); }
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

  const ecCount = spec.edgeCases.length;

  return (
    <div ref={wrapRef} className={`board ${hand ? "hand" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onSelectionChange={onSelectionChange}
        defaultViewport={initialViewport} onMoveEnd={onMoveEnd}
        onInit={(inst) => {
          const box = wrapRef.current?.getBoundingClientRect();
          if (box && !isDefaultViewport && canvas.nodes.length > 0 && !viewportShowsSomething(canvas, spec, view, { w: box.width, h: box.height })) void inst.fitView(FIT_OPTS);
        }}
        connectionRadius={40} minZoom={0.05} maxZoom={2} fitView={isDefaultViewport && canvas.nodes.length > 0} fitViewOptions={FIT_OPTS}
        panOnScroll panOnDrag={hand ? true : PAN_BUTTONS} nodesDraggable={!hand} elementsSelectable={!hand} nodesConnectable={!hand}
        selectionOnDrag={false} zoomOnDoubleClick={false} deleteKeyCode={null} connectionLineStyle={CONN_LINE_STYLE} proOptions={PRO_OPTS}
        onPaneClick={onPaneClick}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--canvas-dot)" />
        {showMinimap && <MiniMap pannable zoomable nodeColor={minimapColor} nodeStrokeWidth={0} maskColor="rgba(238,241,246,.7)" />}
      </ReactFlow>

      {view === "flow" && ecCount > 0 && (
        <div className="ec-toggle" role="group" aria-label="Edge cases">
          <button className="ec-btn" onClick={() => setShowEdgeCases(!showEdgeCases)} aria-pressed={showEdgeCases} title="Show or hide edge cases (E)">
            <Icon name={showEdgeCases ? "eye" : "eye-off"} size={15} /> Edge cases <b>{showEdgeCases ? "Shown" : "Hidden"}</b> <Icon name="chevron-down" size={12} />
          </button>
          <div className="legend">
            <span><i className="ln main" /> Main flow</span>
            <span><i className="ln alt" /> Other moves</span>
            <span><i className="ln ec" /> Edge case</span>
          </div>
        </div>
      )}

      {showMinimap && <button className="mm-expand" onClick={fit} title="Fit to content (⇧1)" aria-label="Fit to content"><Icon name="expand" size={13} /></button>}

      <Composer />

      <div className="canvas-bar" role="toolbar" aria-label="Canvas">
        <button className="cb-btn" onClick={() => rf.zoomOut({ duration: 150 })} title="Zoom out (−)" aria-label="Zoom out"><Icon name="zoom-out" size={15} /></button>
        <button className="cb-zoom" onClick={() => void rf.zoomTo(1, { duration: 200 })} title="Zoom to 100% (⌘0)">{Math.round(zoom * 100)}%</button>
        <button className="cb-btn" onClick={() => rf.zoomIn({ duration: 150 })} title="Zoom in (+)" aria-label="Zoom in"><Icon name="zoom-in" size={15} /></button>
        <span className="cb-sep" />
        <button className="cb-btn" onClick={fit} title="Fit to content (⇧1)" aria-label="Fit to content"><Icon name="maximize" size={15} /></button>
        <button className="cb-btn" onClick={() => { updateCanvas((c) => tidyLayout(spec, c, view)); fit(); }} disabled={spec.screens.length === 0} title="Tidy: arrange screens along the flow" aria-label="Tidy layout"><Icon name="layout-grid" size={15} /></button>
        <span className="cb-sep" />
        <button className={`cb-btn ${showInfluences ? "on" : ""}`} onClick={() => setShowInfluences(!showInfluences)} title="Show which references shaped each screen" aria-label="Show influences" aria-pressed={showInfluences}><Icon name="sparkles" size={15} /></button>
        <button className={`cb-btn wide ${showMinimap ? "on" : ""}`} onClick={() => setShowMinimap(!showMinimap)} title="Minimap" aria-pressed={showMinimap}><Icon name="map" size={15} /> Map</button>
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
          <div className="ce-body">Write the brief on the card above. Drop any references beside it and draw a line to the brief. Then press <b>Generate</b> below.</div>
        </div>
      )}
      {dragOver && <div className="drop-hint">Drop images, markdown skills, or text</div>}
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
  if (/^https?:\/\/\S+$/i.test(text)) { let title = text; try { title = new URL(text).hostname; } catch { /* keep */ } return { id, type: "inspiration", kind: "url", title, url: text, caption: "", description: "", position, width: 224 }; }
  if (/^#[0-9a-f]{3,8}$/i.test(text) || /^(rgb|hsl)a?\(/i.test(text)) return { id, type: "inspiration", kind: "style", title: "Colour", text, caption: "", description: "", position, width: 224 };
  if (/^[A-Z][A-Za-z ]{2,30}$/.test(text) && text.split(" ").length <= 3) return { id, type: "inspiration", kind: "style", title: "Typeface", text, caption: "", description: "", position, width: 224 };
  return { id, type: "inspiration", kind: "text", title: text.slice(0, 40) + (text.length > 40 ? "…" : ""), text, caption: "", description: "", position, width: 224 };
}
