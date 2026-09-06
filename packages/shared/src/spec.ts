import { z } from "zod";

/** Kebab-case identifier used for every spec entity. Claude is asked to use these. */
export const SpecId = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "ids are kebab-case");

export const Severity = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof Severity>;

export const DeviceKind = z.enum(["mobile", "tablet", "desktop"]);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const Device = z.object({
  kind: DeviceKind,
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
export type Device = z.infer<typeof Device>;

export const DEVICE_PRESETS: Record<DeviceKind, Device> = {
  mobile: { kind: "mobile", width: 390, height: 844 },
  tablet: { kind: "tablet", width: 820, height: 1180 },
  desktop: { kind: "desktop", width: 1280, height: 800 }
};

export const Tokens = z.object({
  colors: z.record(z.string(), z.string()).default({}),
  type: z.record(z.string(), z.string()).default({}),
  spacing: z.record(z.string(), z.string()).default({}),
  radius: z.record(z.string(), z.string()).default({}),
  motion: z.record(z.string(), z.string()).default({})
});
export type Tokens = z.infer<typeof Tokens>;

export const ElementSpec = z.object({
  id: SpecId,
  role: z.string().describe("What kind of thing this is: button, list, card, input, nav, hero, form, image"),
  label: z.string().describe("Human-readable label shown in the inspector"),
  selector: z.string().optional().describe("Optional CSS selector hint; data-flow-el is the source of truth")
});
export type ElementSpec = z.infer<typeof ElementSpec>;

export const StateSpec = z.object({
  id: SpecId,
  name: z.string(),
  description: z.string().default(""),
  trigger: z.string().optional().describe("What causes this state, e.g. 'network request in flight'"),
  isDefault: z.boolean().default(false)
});
export type StateSpec = z.infer<typeof StateSpec>;

export const TransitionFrom = z.object({
  screenId: SpecId,
  stateId: SpecId.optional(),
  elementId: SpecId.optional().describe("The element carrying data-flow-transition for this transition")
});
export const TransitionTo = z.object({
  screenId: SpecId,
  stateId: SpecId.optional()
});
export const Animation = z.enum(["none", "push", "pop", "fade", "modal"]);
export type Animation = z.infer<typeof Animation>;

export const TransitionSpec = z.object({
  id: SpecId,
  from: TransitionFrom,
  to: TransitionTo,
  trigger: z.string().describe("Plain-language trigger, e.g. 'tap Continue'"),
  condition: z.string().optional().describe("Branch condition, e.g. 'cart is empty'"),
  animation: Animation.default("push")
});
export type TransitionSpec = z.infer<typeof TransitionSpec>;

export const EdgeCaseSpec = z.object({
  id: SpecId,
  attachedTo: z.object({
    screenId: SpecId.optional(),
    transitionId: SpecId.optional()
  }),
  scenario: z.string().describe("What goes wrong or what is unusual"),
  handling: z.string().describe("How the design handles it"),
  severity: Severity.default("medium")
});
export type EdgeCaseSpec = z.infer<typeof EdgeCaseSpec>;

export const Provenance = z.object({
  sourceNodeId: z.string(),
  relation: z.string(),
  versionId: z.string().optional()
});
export type Provenance = z.infer<typeof Provenance>;

export const ScreenSpec = z.object({
  id: SpecId,
  name: z.string(),
  purpose: z.string(),
  file: z.string().describe("Path relative to the project root, e.g. screens/home.html"),
  states: z.array(StateSpec).default([]),
  elements: z.array(ElementSpec).default([]),
  provenance: z.array(Provenance).default([])
});
export type ScreenSpec = z.infer<typeof ScreenSpec>;

export const ComponentSpec = z.object({
  id: SpecId,
  name: z.string(),
  description: z.string(),
  usedIn: z.array(SpecId).default([])
});
export type ComponentSpec = z.infer<typeof ComponentSpec>;

export const DesignSpec = z.object({
  version: z.literal(1),
  id: z.string(),
  name: z.string(),
  brief: z.string(),
  device: Device,
  tokens: Tokens,
  components: z.array(ComponentSpec).default([]),
  screens: z.array(ScreenSpec),
  transitions: z.array(TransitionSpec).default([]),
  edgeCases: z.array(EdgeCaseSpec).default([])
});
export type DesignSpec = z.infer<typeof DesignSpec>;

/** The subset Claude writes. The server owns version, id, and provenance. */
export const ClaudeSpecOutput = DesignSpec.omit({ version: true, id: true }).extend({
  screens: z.array(ScreenSpec.omit({ provenance: true }))
});
export type ClaudeSpecOutput = z.infer<typeof ClaudeSpecOutput>;

export function emptySpec(id: string, name: string, brief: string, device: Device): DesignSpec {
  return {
    version: 1,
    id,
    name,
    brief,
    device,
    tokens: { colors: {}, type: {}, spacing: {}, radius: {}, motion: {} },
    components: [],
    screens: [],
    transitions: [],
    edgeCases: []
  };
}

export type SpecIssue = { level: "error" | "warning"; message: string; screenId?: string };

/** Referential integrity checks beyond the shape check. */
export function lintSpec(spec: DesignSpec): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const screenIds = new Set(spec.screens.map((s) => s.id));
  const dupScreen = spec.screens.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  for (const d of dupScreen) issues.push({ level: "error", message: `duplicate screen id "${d}"` });
  for (const s of spec.screens) {
    if (!s.states.some((st) => st.isDefault) && s.states.length > 0) {
      issues.push({ level: "warning", message: `screen "${s.id}" has states but none is default`, screenId: s.id });
    }
    const elIds = new Set(s.elements.map((e) => e.id));
    if (elIds.size !== s.elements.length) issues.push({ level: "error", message: `screen "${s.id}" has duplicate element ids`, screenId: s.id });
  }
  const transIds = new Set<string>();
  for (const t of spec.transitions) {
    if (transIds.has(t.id)) issues.push({ level: "error", message: `duplicate transition id "${t.id}"` });
    transIds.add(t.id);
    if (!screenIds.has(t.from.screenId)) issues.push({ level: "error", message: `transition "${t.id}" starts at unknown screen "${t.from.screenId}"` });
    if (!screenIds.has(t.to.screenId)) issues.push({ level: "error", message: `transition "${t.id}" ends at unknown screen "${t.to.screenId}"` });
    const from = spec.screens.find((s) => s.id === t.from.screenId);
    if (from && t.from.elementId && !from.elements.some((e) => e.id === t.from.elementId)) {
      issues.push({ level: "error", message: `transition "${t.id}" references unknown element "${t.from.elementId}" on "${from.id}"`, screenId: from.id });
    }
    const to = spec.screens.find((s) => s.id === t.to.screenId);
    if (to && t.to.stateId && !to.states.some((st) => st.id === t.to.stateId)) {
      issues.push({ level: "error", message: `transition "${t.id}" targets unknown state "${t.to.stateId}" on "${to.id}"`, screenId: to.id });
    }
  }
  for (const ec of spec.edgeCases) {
    if (!ec.attachedTo.screenId && !ec.attachedTo.transitionId) issues.push({ level: "error", message: `edge case "${ec.id}" is attached to nothing` });
    if (ec.attachedTo.screenId && !screenIds.has(ec.attachedTo.screenId)) issues.push({ level: "error", message: `edge case "${ec.id}" attached to unknown screen "${ec.attachedTo.screenId}"` });
    if (ec.attachedTo.transitionId && !transIds.has(ec.attachedTo.transitionId)) issues.push({ level: "error", message: `edge case "${ec.id}" attached to unknown transition "${ec.attachedTo.transitionId}"` });
  }
  if (spec.screens.length > 0 && spec.edgeCases.length === 0) {
    issues.push({ level: "warning", message: "spec has no edge cases; generation should always produce some" });
  }
  return issues;
}
