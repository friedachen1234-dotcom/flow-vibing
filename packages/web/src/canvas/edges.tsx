import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
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

/** A transition line, named by a pill a third of the way along, so the move reads on the board without opening anything. */
export function TransitionEdge(props: EdgeProps) {
  const t = props.data?.transition as TransitionSpec;
  const kind = (props.data?.kind as "forward" | "back" | "state" | undefined) ?? "forward";
  const dim = !!props.data?.dim;
  const lit = !!props.data?.lit;
  const main = !!props.data?.main;
  const select = useFlow((s) => s.select);
  const walk = useFlow((s) => s.walk);
  const orbitY = props.data?.orbitY as number | undefined;
  const bez = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition, curvature: 0.35 });
  const path = orbitY != null ? orbitPath(props.sourceX, props.sourceY, props.targetX, props.targetY, orbitY) : bez[0];
  // Label near the source end, where the eye arrives from the row that fires it.
  const lx = orbitY != null ? props.sourceX + 60 : props.sourceX + (props.targetX - props.sourceX) * 0.38;
  const ly = orbitY != null ? props.sourceY : props.sourceY + (props.targetY - props.sourceY) * 0.38;
  const active = walk.active && walk.lastTransitionId === t.id;
  const back = kind === "back";
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={18}
        style={{ stroke: back ? "var(--ink-3)" : "var(--accent)", strokeWidth: props.selected || lit ? 2.2 : main ? 1.8 : 1.5, strokeDasharray: back ? "5 4" : active ? "6 4" : undefined, opacity: dim ? 0.12 : lit || props.selected || main ? 1 : 0.75, transition: "opacity .15s, stroke-width .15s" }} />
      {!dim && (
        <EdgeLabelRenderer>
          <div className={`edge-label transition ${back ? "back" : ""} ${props.selected ? "selected" : ""} nodrag nopan`} style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }} onClick={() => select({ kind: "transition", id: t.id })}>
            {back ? "↩ " : ""}{cap(t.trigger)}{t.condition && <span className="cond"> · if {t.condition}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** From a screen down to one of its edge cases: dashed amber, so the unhappy paths read as a layer over the main flow. */
export function EdgeCaseEdge(props: EdgeProps) {
  const dim = !!props.data?.dim;
  const [path] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition, curvature: 0.5 });
  return <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={14} style={{ stroke: "var(--warn)", strokeWidth: props.selected ? 2 : 1.5, strokeDasharray: "6 5", opacity: dim ? 0.15 : 0.95 }} />;
}

/** Start marker into the first screen. */
export function StartEdge(props: EdgeProps) {
  const [path] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
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
      <BaseEdge id={props.id} path={path} interactionWidth={16} style={{ stroke: "var(--magic)", strokeWidth: props.selected ? 2.2 : 1.5, strokeDasharray: "6 5" }} />
      <EdgeLabelRenderer>
        <div className={`edge-label magic ${props.selected ? "selected" : ""} nodrag nopan`} style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }} onClick={() => select({ kind: "edge", id: e.id })} title={e.targetElementId ? `${label} → ${e.targetElementId}${e.note ? `\n${e.note}` : ""}` : e.note}>
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export function VariantLinkEdge(props: EdgeProps) {
  const [path] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  return <BaseEdge id={props.id} path={path} interactionWidth={14} style={{ stroke: "var(--accent)", strokeWidth: props.selected ? 2.2 : 1.5 }} />;
}

export function ProvenanceEdge(props: EdgeProps) {
  const [path] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  return <BaseEdge id={props.id} path={path} style={{ stroke: "var(--ink-3)", strokeWidth: 1, strokeDasharray: "2 4", opacity: .7 }} />;
}

export const edgeTypes = { transition: TransitionEdge, edgeCase: EdgeCaseEdge, start: StartEdge, magic: MagicEdge, variantLink: VariantLinkEdge, provenance: ProvenanceEdge };
