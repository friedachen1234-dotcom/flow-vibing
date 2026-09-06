import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { MAGIC_RELATION_LABELS, type CanvasEdge, type MagicRelation, type TransitionSpec } from "@flow/shared";
import { useFlow } from "../store";

/** Right out of the source, down to a lane below every card, left past the target, up, and in from the left. */
function orbitPath(sx: number, sy: number, tx: number, ty: number, laneY: number): string {
  const r = 10;
  const x1 = sx + 24, x2 = tx - 24;
  return [
    `M ${sx} ${sy}`, `H ${x1 - r}`, `Q ${x1} ${sy} ${x1} ${sy + r}`, `V ${laneY - r}`, `Q ${x1} ${laneY} ${x1 - r} ${laneY}`,
    `H ${x2 + r}`, `Q ${x2} ${laneY} ${x2} ${laneY - r}`, `V ${ty + r}`, `Q ${x2} ${ty} ${x2 + r} ${ty}`, `H ${tx}`
  ].join(" ");
}

/**
 * A transition line. It carries no label of its own: the move is named on the row of the source card where the line starts.
 * The label appears only while the line is selected, as a tooltip near the target.
 */
export function TransitionEdge(props: EdgeProps) {
  const t = props.data?.transition as TransitionSpec;
  const kind = (props.data?.kind as "forward" | "back" | "state" | undefined) ?? "forward";
  const dim = !!props.data?.dim;
  const lit = !!props.data?.lit;
  const main = !!props.data?.main;
  const select = useFlow((s) => s.select);
  const walk = useFlow((s) => s.walk);
  const orbitY = props.data?.orbitY as number | undefined;
  const [path] = orbitY != null
    ? [orbitPath(props.sourceX, props.sourceY, props.targetX, props.targetY, orbitY)]
    : getSmoothStepPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition, borderRadius: 12, offset: 28 });
  const active = walk.active && walk.lastTransitionId === t.id;
  const color = kind === "back" ? "var(--ink-3)" : "var(--accent)";
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={18}
        style={{ stroke: color, strokeWidth: props.selected || lit ? 2.4 : main ? 1.8 : 1.2, strokeDasharray: kind === "back" ? "5 4" : active ? "6 4" : undefined, opacity: dim ? 0.1 : lit || props.selected ? 1 : main ? 0.9 : 0.5, transition: "opacity .15s, stroke-width .15s" }} />
      {props.selected && (
        <EdgeLabelRenderer>
          <div className={`edge-label transition ${kind === "back" ? "back" : ""} nodrag nopan`} style={{ position: "absolute", transform: `translate(-100%, -50%) translate(${props.targetX - 14}px, ${props.targetY - 16}px)` }} onClick={() => select({ kind: "transition", id: t.id })}>
            {kind === "back" ? "↩ " : ""}{t.trigger}{t.condition && <span className="cond"> · if {t.condition}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export function MagicEdge(props: EdgeProps) {
  const e = props.data?.edge as CanvasEdge;
  const select = useFlow((s) => s.select);
  const [path, lx, ly] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  const rel = (e.relation ?? "free-text") as MagicRelation;
  const label = rel === "free-text" ? (e.note || "…") : MAGIC_RELATION_LABELS[rel].label;
  return (
    <>
      <BaseEdge id={props.id} path={path} style={{ stroke: "var(--magic)", strokeWidth: props.selected ? 2.4 : 1.6, strokeDasharray: "7 5" }} />
      <EdgeLabelRenderer>
        <div className="edge-label magic nodrag nopan" style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }} onClick={() => select({ kind: "edge", id: e.id })} title={e.note}>
          ✦ {label}{e.targetElementId ? ` → ${e.targetElementId}` : ""}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export function VariantLinkEdge(props: EdgeProps) {
  const e = props.data?.edge as CanvasEdge;
  const [path, lx, ly] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  return (
    <>
      <BaseEdge id={props.id} path={path} style={{ stroke: "var(--accent)", strokeWidth: 1.2 }} />
      <EdgeLabelRenderer>
        <div className="edge-label variant nodrag nopan" style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>variants{e.targetElementId ? ` of ${e.targetElementId}` : ""}</div>
      </EdgeLabelRenderer>
    </>
  );
}

export function ProvenanceEdge(props: EdgeProps) {
  const [path] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  return <BaseEdge id={props.id} path={path} style={{ stroke: "var(--ink-3)", strokeWidth: 1, strokeDasharray: "2 4", opacity: .7 }} />;
}

export const edgeTypes = { transition: TransitionEdge, magic: MagicEdge, variantLink: VariantLinkEdge, provenance: ProvenanceEdge };
