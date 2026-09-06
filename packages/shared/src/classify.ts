import type { DesignSpec, TransitionSpec } from "./spec.js";

export type TransitionKind = "forward" | "back" | "state";

const BACK_WORDS = /\b(back|cancel|close|dismiss|return|undo|skip)\b/i;

/**
 * Sorts transitions into the three kinds the flow view treats differently:
 * forward moves between screens are drawn as lines; back moves fold into a return chip on the card;
 * state changes stay inside the card, since they never leave the screen.
 */
export function classifyTransition(t: TransitionSpec): TransitionKind {
  if (t.from.screenId === t.to.screenId) return "state";
  if (t.animation === "pop" || BACK_WORDS.test(t.trigger)) return "back";
  return "forward";
}

export function classifyTransitions(spec: DesignSpec): Map<string, TransitionKind> {
  const m = new Map<string, TransitionKind>();
  for (const t of spec.transitions) m.set(t.id, classifyTransition(t));
  return m;
}

/**
 * The one onward move a screen is "for": the main path through the product.
 * An override wins; otherwise the first forward move without a condition; otherwise the first forward move.
 */
export function mainMoves(spec: DesignSpec, overrides: Record<string, string> = {}): Map<string, string> {
  const forwardsOf = (id: string) => spec.transitions.filter((t) => t.from.screenId === id && t.to.screenId !== id && classifyTransition(t) === "forward");
  // How far the product continues from a screen along forward moves. Side trips (a photo note that only returns) score low.
  const depthMemo = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    let best = 0;
    for (const t of forwardsOf(id)) best = Math.max(best, 1 + depth(t.to.screenId, seen));
    seen.delete(id);
    depthMemo.set(id, best);
    return best;
  };
  // Rank screens by distance from the first screen along forward moves. A move to an equal or earlier rank is a loop back.
  const rank = new Map<string, number>();
  if (spec.screens[0]) {
    const queue = [spec.screens[0].id];
    rank.set(spec.screens[0].id, 0);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const t of forwardsOf(cur)) if (!rank.has(t.to.screenId)) { rank.set(t.to.screenId, (rank.get(cur) ?? 0) + 1); queue.push(t.to.screenId); }
    }
  }
  const m = new Map<string, string>();
  for (const s of spec.screens) {
    const forwards = forwardsOf(s.id);
    const o = overrides[s.id];
    let pick = o ? forwards.find((t) => t.id === o) : undefined;
    if (!pick && forwards.length) {
      const myRank = rank.get(s.id) ?? 0;
      const scored = forwards.map((t, i) => ({ t, i, onward: (rank.get(t.to.screenId) ?? Infinity) > myRank ? 1 : 0, d: depth(t.to.screenId, new Set([s.id])), cond: t.condition ? 1 : 0 }));
      scored.sort((a, b) => b.onward - a.onward || b.d - a.d || a.cond - b.cond || a.i - b.i);
      pick = scored[0].t;
    }
    if (pick) m.set(s.id, pick.id);
  }
  return m;
}
