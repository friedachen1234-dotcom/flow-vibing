import type { DesignSpec } from "./spec.js";
import type { CanvasDoc, CanvasNode } from "./canvas.js";
import { EDGE_CASE_HEIGHT, FLOW_CARD_WIDTH, hostScreen } from "./layout.js";
import { classifyTransition } from "./classify.js";

/**
 * Left-to-right layered layout by flow order. Only screens and their edge cases move; references and notes stay put.
 * Layers come from a breadth-first walk over transitions starting at the first screen; unreachable screens go last.
 */
export function autoLayout(spec: DesignSpec, canvas: CanvasDoc, opts: { view: "prototype" | "flow" }): CanvasDoc {
  const ids = spec.screens.map((s) => s.id);
  if (ids.length === 0) return canvas;
  const layerOf = new Map<string, number>();
  const queue: string[] = [ids[0]];
  layerOf.set(ids[0], 0);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const t of spec.transitions) {
      // Only forward moves shape the layers; back moves and state changes would fold the graph onto itself.
      if (t.from.screenId !== cur || layerOf.has(t.to.screenId) || classifyTransition(t) !== "forward") continue;
      layerOf.set(t.to.screenId, (layerOf.get(cur) ?? 0) + 1);
      queue.push(t.to.screenId);
    }
    if (queue.length === 0) { const next = ids.find((id) => !layerOf.has(id)); if (next) { layerOf.set(next, Math.max(-1, ...layerOf.values()) + 1); queue.push(next); } }
  }
  const layers = new Map<number, string[]>();
  for (const id of ids) { const l = layerOf.get(id) ?? 0; layers.set(l, [...(layers.get(l) ?? []), id]); }

  const cardW = opts.view === "flow" ? FLOW_CARD_WIDTH : spec.device.width;
  const cardH = opts.view === "flow" ? 320 : spec.device.height + 36;
  const gapX = opts.view === "flow" ? 180 : 140;
  const gapY = opts.view === "flow" ? 260 : 120;
  const ecPerScreen = new Map<string, number>();
  for (const ec of spec.edgeCases) { const h = hostScreen(spec, ec.attachedTo); if (h) ecPerScreen.set(h, (ecPerScreen.get(h) ?? 0) + 1); }

  const pos = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const l of [...layers.keys()].sort((a, b) => a - b)) {
    let y = 0;
    for (const id of layers.get(l)!) {
      pos.set(id, { x, y });
      const ecs = opts.view === "flow" ? ecPerScreen.get(id) ?? 0 : 0;
      y += cardH + ecs * (EDGE_CASE_HEIGHT + 16) + gapY;
    }
    x += cardW + gapX;
  }

  const counters = new Map<string, number>();
  const nodes: CanvasNode[] = canvas.nodes.map((n) => {
    if (n.type === "screen" && pos.has(n.screenId)) return { ...n, position: pos.get(n.screenId)! };
    if (n.type === "edgeCase") {
      const ec = spec.edgeCases.find((e) => e.id === n.edgeCaseId);
      const host = ec ? hostScreen(spec, ec.attachedTo) : undefined;
      const p = host ? pos.get(host) : undefined;
      if (!p) return n;
      const k = counters.get(host!) ?? 0;
      counters.set(host!, k + 1);
      return { ...n, position: { x: p.x + 20, y: p.y + cardH + 24 + k * (EDGE_CASE_HEIGHT + 16) } };
    }
    return n;
  });
  return { ...canvas, nodes };
}
