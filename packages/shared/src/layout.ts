import type { DesignSpec } from "./spec.js";
import { type CanvasDoc, type CanvasNode, screenNodeId, edgeCaseNodeId } from "./canvas.js";

export const FLOW_CARD_WIDTH = 280;
export const FLOW_CARD_HEADER = 120;
export const EDGE_CASE_WIDTH = 240;
export const EDGE_CASE_HEIGHT = 84;
export const SCREEN_GAP = 140;

/**
 * Keeps the canvas in step with the spec: every screen and edge case gets a node, deleted ones lose theirs.
 * Positions of existing nodes are never touched. New screens go to the right of the current rightmost screen.
 */
export function reconcileCanvas(spec: DesignSpec, canvas: CanvasDoc): { canvas: CanvasDoc; changed: boolean } {
  let changed = false;
  const nodes: CanvasNode[] = [...canvas.nodes];
  const screenIds = new Set(spec.screens.map((s) => s.id));
  const edgeCaseIds = new Set(spec.edgeCases.map((e) => e.id));

  // Drop nodes whose spec entity is gone.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.type === "screen" && !screenIds.has(n.screenId)) { nodes.splice(i, 1); changed = true; }
    if (n.type === "edgeCase" && !edgeCaseIds.has(n.edgeCaseId)) { nodes.splice(i, 1); changed = true; }
  }

  // Add screen nodes in spec order, to the right of what exists.
  const screenNodes = nodes.filter((n): n is Extract<CanvasNode, { type: "screen" }> => n.type === "screen");
  let nextX = screenNodes.length ? Math.max(...screenNodes.map((n) => n.position.x + (n.width ?? spec.device.width))) + SCREEN_GAP : 0;
  const baseY = screenNodes.length ? Math.min(...screenNodes.map((n) => n.position.y)) : 0;
  for (const s of spec.screens) {
    if (nodes.some((n) => n.type === "screen" && n.screenId === s.id)) continue;
    nodes.push({ id: screenNodeId(s.id), type: "screen", screenId: s.id, position: { x: nextX, y: baseY }, width: spec.device.width, height: spec.device.height });
    nextX += spec.device.width + SCREEN_GAP;
    changed = true;
  }

  // Edge case nodes sit under their screen (or under the source screen of their transition).
  const perScreenCount = new Map<string, number>();
  for (const n of nodes) if (n.type === "edgeCase") {
    const ec = spec.edgeCases.find((e) => e.id === n.edgeCaseId);
    const host = ec ? hostScreen(spec, ec.attachedTo) : undefined;
    if (host) perScreenCount.set(host, (perScreenCount.get(host) ?? 0) + 1);
  }
  for (const ec of spec.edgeCases) {
    if (nodes.some((n) => n.type === "edgeCase" && n.edgeCaseId === ec.id)) continue;
    const host = hostScreen(spec, ec.attachedTo);
    const hostNode = host ? nodes.find((n) => n.type === "screen" && n.screenId === host) : undefined;
    const k = host ? perScreenCount.get(host) ?? 0 : 0;
    if (host) perScreenCount.set(host, k + 1);
    const base = hostNode ? hostNode.position : { x: 0, y: 0 };
    nodes.push({
      id: edgeCaseNodeId(ec.id),
      type: "edgeCase",
      edgeCaseId: ec.id,
      position: { x: base.x + 20, y: base.y + FLOW_CARD_HEADER + 40 + k * (EDGE_CASE_HEIGHT + 16) + 260 }
    });
    changed = true;
  }

  return { canvas: changed ? { ...canvas, nodes } : canvas, changed };
}

export function hostScreen(spec: DesignSpec, attachedTo: { screenId?: string; transitionId?: string }): string | undefined {
  if (attachedTo.screenId) return attachedTo.screenId;
  if (attachedTo.transitionId) return spec.transitions.find((t) => t.id === attachedTo.transitionId)?.from.screenId;
  return undefined;
}
