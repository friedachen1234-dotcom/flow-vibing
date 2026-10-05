import dagre from "@dagrejs/dagre";
import { classifyTransition, hostScreen, mainMoves, type CanvasDoc, type DesignSpec } from "@flow/shared";

export const FLOW_CARD_W = 300;
export const EDGE_CASE_W = 250;
export const EDGE_CASE_H = 232;
/** Height of a compact card: header, one row per move out, and the add row. */
export function flowCardHeight(spec: DesignSpec, screenId: string): number {
  const moves = spec.transitions.filter((t) => t.from.screenId === screenId && classifyTransition(t) !== "state").length;
  return 150 + moves * 32 + 34;
}

/**
 * Layered left-to-right layout with dagre over forward moves only.
 * Screens land on a grid with room between columns for lines; edge cases line up under their screen;
 * references, notes, and panels stay where they are.
 */
export function tidyLayout(spec: DesignSpec, canvas: CanvasDoc, view: "prototype" | "flow"): CanvasDoc {
  if (spec.screens.length === 0) return canvas;
  const g = new dagre.graphlib.Graph();
  const w = view === "flow" ? FLOW_CARD_W : spec.device.width;
  const ecRows = new Map<string, number>();
  for (const ec of spec.edgeCases) { const h = hostScreen(spec, ec.attachedTo); if (h) ecRows.set(h, (ecRows.get(h) ?? 0) + 1); }
  g.setGraph({ rankdir: "LR", nodesep: view === "flow" ? 56 : 80, ranksep: view === "flow" ? 170 : 180, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of spec.screens) {
    // In flow view a screen's edge cases hang below it, so the slot has to be tall enough for them.
    const ecH = view === "flow" && ecRows.get(s.id) ? 90 + EDGE_CASE_H : 0;
    g.setNode(s.id, { width: view === "flow" ? Math.max(w, (ecRows.get(s.id) ?? 0) * (EDGE_CASE_W + 16)) : w, height: (view === "flow" ? flowCardHeight(spec, s.id) : spec.device.height + 40) + ecH });
  }
  const mains = new Set(mainMoves(spec, canvas.primaryMoves).values());
  for (const t of spec.transitions) {
    if (classifyTransition(t) !== "forward" || t.from.screenId === t.to.screenId) continue;
    const weight = mains.has(t.id) ? 6 : 1;
    const prev = g.edge(t.from.screenId, t.to.screenId) as { weight?: number } | undefined;
    g.setEdge(t.from.screenId, t.to.screenId, { weight: Math.max(weight, prev?.weight ?? 0) });
  }
  dagre.layout(g);
  // Keep the flow where the user left it: anchor the top-left of the new layout on the current top-left screen.
  const screenNodes = canvas.nodes.filter((n) => n.type === "screen");
  const anchor = screenNodes.length ? { x: Math.min(...screenNodes.map((n) => n.position.x)), y: Math.min(...screenNodes.map((n) => n.position.y)) } : { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity;
  for (const s of spec.screens) { const n = g.node(s.id); minX = Math.min(minX, n.x - n.width / 2); minY = Math.min(minY, n.y - n.height / 2); }
  const pos = new Map<string, { x: number; y: number }>();
  for (const s of spec.screens) { const d = g.node(s.id); pos.set(s.id, { x: anchor.x + (d.x - d.width / 2 - minX), y: anchor.y + (d.y - d.height / 2 - minY) }); }
  const ecIndex = new Map<string, number>();
  const nodes = canvas.nodes.map((n) => {
    if (n.type === "screen") { const p = pos.get(n.screenId); return p ? { ...n, position: p } : n; }
    if (n.type === "edgeCase") {
      const ec = spec.edgeCases.find((e) => e.id === n.edgeCaseId);
      const host = ec ? hostScreen(spec, ec.attachedTo) : undefined;
      const p = host ? pos.get(host) : undefined;
      if (!p || !host) return n;
      const k = ecIndex.get(host) ?? 0;
      ecIndex.set(host, k + 1);
      return { ...n, position: { x: p.x + k * (EDGE_CASE_W + 16), y: p.y + flowCardHeight(spec, host) + 90 } };
    }
    return n;
  });
  return { ...canvas, nodes };
}
