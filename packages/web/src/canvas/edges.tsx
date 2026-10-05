import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { MAGIC_RELATION_LABELS, type CanvasEdge, type MagicRelation, type TransitionSpec } from "@flow/shared";
import { useFlow } from "../store";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Right out of the source, down to a lane below every card, left past the target, up, and in from the left. */
function orbitPath(sx: number, sy: number, tx: number, ty: number, laneY: number): string {
  const r = 12;
  const x1 = sx + 28, x2 = tx - 28;
  return [
    `M ${sx} ${sy}`, `H ${x1 - r}`, `Q ${x1} ${sy} ${x1} ${sy + r}`, `V ${laneY - r}`, `Q ${x1} ${laneY} ${x1 - r} ${laneY}`,
    `H ${x2 + r}`, `Q ${x2} ${laneY} ${x2} ${laneY - r}`, `V ${ty + r}`, `Q ${x2} ${ty} ${x2 + r} ${ty}`, `H ${tx}`
  ].join(" ");
}

/**
 * Where lines leaving one card turn: a fixed distance past the card, so every move from that card shares one
 * vertical trunk and the labels beside the card stay clear of it.
 */
const TRUNK = 132;
const LANE = 12;

/** A transition line: out of its row, along a shared trunk, into the target from the left. Named where it leaves. */
export function TransitionEdge(props: EdgeProps) {
  const t = props.data?.transition as TransitionSpec;
  const kind = (props.data?.kind as "forward" | "back" | "state" | undefined) ?? "forward";
  const dim = !!props.data?.dim;
  const lit = !!props.data?.lit;
  const main = !!props.data?.main;
  const select = useFlow((s) => s.select);
  const walk = useFlow((s) => s.walk);
  const orbitY = props.data?.orbitY as number | undefined;
  const gap = props.targetX - props.sourceX;
  const lane = (props.data?.lane as number | undefined) ?? 0;
  const lanes = (props.data?.lanes as number | undefined) ?? 1;
  const trunk = props.sourceX + Math.min(TRUNK, Math.max(28, gap * 0.6)) + (lane - (lanes - 1) / 2) * LANE;
  const [step] = getSmoothStepPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition, borderRadius: 10, offset: 20, centerX: trunk });
  const path = orbitY != null ? orbitPath(props.sourceX, props.sourceY, props.targetX, props.targetY, orbitY) : step;
  // The label sits on the first straight run out of the row, so it lines up with the row that fires it.
  const lx = props.sourceX + 12;
  const ly = props.sourceY;
  const active = walk.active && walk.lastTransitionId === t.id;
  const back = kind === "back";
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={18}
        style={{ stroke: back ? "var(--ink-3)" : "var(--accent)", strokeWidth: props.selected || lit ? 2.2 : main ? 1.8 : 1.5, strokeDasharray: back ? "5 4" : active ? "6 4" : undefined, opacity: dim ? 0.12 : lit || props.selected || main ? 1 : 0.75, transition: "opacity .15s, stroke-width .15s" }} />
      {props.selected && (
        <EdgeLabelRenderer>
          <div className={`edge-label transition ${back ? "back" : ""} ${props.selected ? "selected" : ""} ${lit || props.selected || main ? "" : "quiet"} nodrag nopan`} style={{ position: "absolute", transform: `translate(0, -50%) translate(${lx}px, ${ly}px)` }} onClick={() => select({ kind: "transition", id: t.id })}>
            {back ? "↩ " : ""}{cap(t.trigger)}{t.condition && <span className="cond"> · if {t.condition}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/**
 * From a screen down to its edge cases, which stack beneath it: one rail drops from the card's bottom-left corner and
 * each case is entered from the left, so the rail never crosses a card. Dashed amber, a layer over the main flow.
 */
export function EdgeCaseEdge(props: EdgeProps) {
  const dim = !!props.data?.dim;
  const r = 10;
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props;
  const path = tx > sx + r && ty > sy + r
    ? `M ${sx} ${sy} V ${ty - r} Q ${sx} ${ty} ${sx + r} ${ty} H ${tx}`
    : getSmoothStepPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: Position.Bottom, targetPosition: Position.Left, borderRadius: r, offset: 16 })[0];
  return <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={14} style={{ stroke: "var(--warn)", strokeWidth: props.selected ? 2 : 1.5, strokeDasharray: "6 5", opacity: dim ? 0.15 : 0.95 }} />;
}

/** Start marker into the first screen. */
export function StartEdge(props: EdgeProps) {
  const [path] = getSmoothStepPath({ borderRadius: 10, offset: 16, sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  return <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={{ stroke: "var(--ok)", strokeWidth: 1.6 }} />;
}

export function MagicEdge(props: EdgeProps) {
  const e = props.data?.edge as CanvasEdge;
  const select = useFlow((s) => s.select);
  const [path, lx, ly] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  const rel = (e.relation ?? "free-text") as MagicRelation;
  const label = rel === "free-text" ? (e.note || "…") : rel === "match-style" ? "Style reference" : MAGIC_RELATION_LABELS[rel].label;
  return (
    <>
      <BaseEdge id={props.id} path={path} interactionWidth={16} style={{ stroke: "var(--magic)", strokeWidth: props.selected ? 2 : 1.3, strokeDasharray: "5 5", opacity: props.selected ? 1 : 0.8 }} />
      <EdgeLabelRenderer>
        <div className={`edge-label magic ${props.selected ? "selected" : ""} nodrag nopan`} style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }} onClick={() => select({ kind: "edge", id: e.id })} title={e.targetElementId ? `${label} → ${e.targetElementId}${e.note ? `\n${e.note}` : ""}` : e.note}>
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/** Screen down to its exploration: a straight drop when the panel sits under the screen, one bend when it does not. */
export function VariantLinkEdge(props: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: Position.Bottom, targetPosition: Position.Top, borderRadius: 10, offset: 16, centerY: props.targetY - 28 });
  return <BaseEdge id={props.id} path={path} interactionWidth={14} style={{ stroke: "var(--accent)", strokeWidth: props.selected ? 2.2 : 1.5, opacity: props.selected ? 1 : 0.7 }} />;
}

export function ProvenanceEdge(props: EdgeProps) {
  const [path] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  return <BaseEdge id={props.id} path={path} style={{ stroke: "var(--ink-3)", strokeWidth: 1, strokeDasharray: "2 4", opacity: .7 }} />;
}

export const edgeTypes = { transition: TransitionEdge, edgeCase: EdgeCaseEdge, start: StartEdge, magic: MagicEdge, variantLink: VariantLinkEdge, provenance: ProvenanceEdge };
