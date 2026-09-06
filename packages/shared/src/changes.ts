import { z } from "zod";
import { Severity, TransitionFrom, TransitionTo, Animation, type DesignSpec } from "./spec.js";

const meta = { id: z.string(), createdAt: z.string() };

export const ChangeRequest = z.discriminatedUnion("op", [
  z.object({ ...meta, op: z.literal("add-screen"), name: z.string(), purpose: z.string(), screenId: z.string().optional() }),
  z.object({ ...meta, op: z.literal("remove-screen"), screenId: z.string() }),
  z.object({ ...meta, op: z.literal("rename-screen"), screenId: z.string(), name: z.string() }),
  z.object({ ...meta, op: z.literal("update-screen-purpose"), screenId: z.string(), purpose: z.string() }),
  z.object({ ...meta, op: z.literal("add-state"), screenId: z.string(), name: z.string(), description: z.string().default("") }),
  z.object({ ...meta, op: z.literal("remove-state"), screenId: z.string(), stateId: z.string() }),
  z.object({ ...meta, op: z.literal("rename-state"), screenId: z.string(), stateId: z.string(), name: z.string() }),
  z.object({ ...meta, op: z.literal("add-transition"), from: TransitionFrom, to: TransitionTo, trigger: z.string(), condition: z.string().optional() }),
  z.object({ ...meta, op: z.literal("remove-transition"), transitionId: z.string() }),
  z.object({
    ...meta,
    op: z.literal("update-transition"),
    transitionId: z.string(),
    patch: z.object({ to: TransitionTo.optional(), trigger: z.string().optional(), condition: z.string().nullable().optional(), animation: Animation.optional() })
  }),
  z.object({
    ...meta,
    op: z.literal("add-edge-case"),
    attachedTo: z.object({ screenId: z.string().optional(), transitionId: z.string().optional() }),
    scenario: z.string(),
    handling: z.string(),
    severity: Severity.default("medium")
  }),
  z.object({ ...meta, op: z.literal("remove-edge-case"), edgeCaseId: z.string() }),
  z.object({
    ...meta,
    op: z.literal("update-edge-case"),
    edgeCaseId: z.string(),
    patch: z.object({ scenario: z.string().optional(), handling: z.string().optional(), severity: Severity.optional() })
  }),
  z.object({ ...meta, op: z.literal("update-brief"), brief: z.string() }),
  z.object({ ...meta, op: z.literal("free-text"), text: z.string(), screenIds: z.array(z.string()).default([]) })
]);
export type ChangeRequest = z.infer<typeof ChangeRequest>;

function screenName(spec: DesignSpec, id: string) {
  return spec.screens.find((s) => s.id === id)?.name ?? id;
}

/** Plain-language summary shown in the review list and used in version summaries. */
export function describeChange(cr: ChangeRequest, spec: DesignSpec): string {
  switch (cr.op) {
    case "add-screen": return `Add screen "${cr.name}"`;
    case "remove-screen": return `Remove screen "${screenName(spec, cr.screenId)}"`;
    case "rename-screen": return `Rename "${screenName(spec, cr.screenId)}" to "${cr.name}"`;
    case "update-screen-purpose": return `Change purpose of "${screenName(spec, cr.screenId)}"`;
    case "add-state": return `Add state "${cr.name}" to "${screenName(spec, cr.screenId)}"`;
    case "remove-state": return `Remove state "${cr.stateId}" from "${screenName(spec, cr.screenId)}"`;
    case "rename-state": return `Rename state "${cr.stateId}" to "${cr.name}" on "${screenName(spec, cr.screenId)}"`;
    case "add-transition": return `Add transition "${cr.trigger}" from "${screenName(spec, cr.from.screenId)}" to "${screenName(spec, cr.to.screenId)}"`;
    case "remove-transition": return `Remove transition "${cr.transitionId}"`;
    case "update-transition": return `Update transition "${cr.transitionId}"`;
    case "add-edge-case": return `Add edge case "${cr.scenario}"`;
    case "remove-edge-case": return `Remove edge case "${cr.edgeCaseId}"`;
    case "update-edge-case": return `Update edge case "${cr.edgeCaseId}"`;
    case "update-brief": return "Update the project brief";
    case "free-text": return cr.text.length > 80 ? cr.text.slice(0, 77) + "..." : cr.text;
  }
}

/** Screens whose HTML must be rewritten to honour this change. Everything else is kept. */
export function affectedScreens(cr: ChangeRequest, spec: DesignSpec): string[] {
  const t = (id: string) => spec.transitions.find((x) => x.id === id);
  const ec = (id: string) => spec.edgeCases.find((x) => x.id === id);
  switch (cr.op) {
    case "add-screen": return cr.screenId ? [cr.screenId] : [];
    case "remove-screen":
      return [...new Set(spec.transitions.filter((x) => x.to.screenId === cr.screenId && x.from.screenId !== cr.screenId).map((x) => x.from.screenId))];
    case "rename-screen":
    case "update-screen-purpose":
    case "add-state":
    case "remove-state":
    case "rename-state":
      return [cr.screenId];
    case "add-transition": return [cr.from.screenId];
    case "remove-transition": { const x = t(cr.transitionId); return x ? [x.from.screenId] : []; }
    case "update-transition": { const x = t(cr.transitionId); return x ? [x.from.screenId] : []; }
    case "add-edge-case": {
      if (cr.attachedTo.screenId) return [cr.attachedTo.screenId];
      const x = cr.attachedTo.transitionId ? t(cr.attachedTo.transitionId) : undefined;
      return x ? [x.from.screenId, x.to.screenId] : [];
    }
    case "remove-edge-case":
    case "update-edge-case": {
      const e = ec(cr.edgeCaseId);
      if (!e) return [];
      if (e.attachedTo.screenId) return [e.attachedTo.screenId];
      const x = e.attachedTo.transitionId ? t(e.attachedTo.transitionId) : undefined;
      return x ? [x.from.screenId, x.to.screenId] : [];
    }
    case "update-brief": return spec.screens.map((s) => s.id);
    case "free-text": return cr.screenIds.length ? cr.screenIds : spec.screens.map((s) => s.id);
  }
}
