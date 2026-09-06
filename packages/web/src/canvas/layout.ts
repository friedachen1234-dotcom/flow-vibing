import dagre from "@dagrejs/dagre";
import { classifyTransition, mainMoves, type CanvasDoc, type DesignSpec } from "@flow/shared";

export const FLOW_CARD_W = 280;
/** Height of a compact card: header plus one row per forward move. */
export function flowCardHeight(spec: DesignSpec, screenId: string): number {
  const moves = spec.transitions.filter((t) => t.from.screenId === screenId && classifyTransition(t) === "forward").length;
  return 128 + 36 + (moves > 1 ? 22 : 0) + 12;
}

/**
 * Layered left-to-right layout with dagre over forward moves only.
 * Screens land on a grid with room between columns for lines; references, notes, and panels stay where they are.
 */
export function tidyLayout(spec: DesignSpec, canvas: CanvasDoc, view: "prototype" | "flow"): CanvasDoc {
  if (spec.screens.length === 0) return canvas;
  const g = new dagre.graphlib.Graph();
  const w = view === "flow" ? FLOW_CARD_W : spec.device.width;
  g.setGraph({ rankdir: "LR", nodesep: view === "flow" ? 48 : 80, ranksep: view === "flow" ? 150 : 180, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of spec.screens) g.setNode(s.id, { width: w, height: view === "flow" ? flowCardHeight(spec, s.id) : spec.device.height + 36 });
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
  const nodes = canvas.nodes.map((n) => {
    if (n.type !== "screen") return n;
    const d = g.node(n.screenId);
    if (!d) return n;
    return { ...n, position: { x: anchor.x + (d.x - d.width / 2 - minX), y: anchor.y + (d.y - d.height / 2 - minY) } };
  });
  return { ...canvas, nodes };
}
