import { z } from "zod";

export const Position = z.object({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof Position>;

export const ViewMode = z.enum(["prototype", "flow"]);
export type ViewMode = z.infer<typeof ViewMode>;

export const MagicRelation = z.enum([
  "match-style",
  "use-layout",
  "use-component",
  "use-interaction",
  "avoid",
  "apply-skill",
  "free-text"
]);
export type MagicRelation = z.infer<typeof MagicRelation>;

export const MAGIC_RELATION_LABELS: Record<MagicRelation, { label: string; hint: string }> = {
  "match-style": { label: "Match style", hint: "Palette, type, spacing, and mood of the reference" },
  "use-layout": { label: "Use layout", hint: "Structural arrangement only, not styling" },
  "use-component": { label: "Use component", hint: "Reproduce a specific element from the reference" },
  "use-interaction": { label: "Use interaction", hint: "Motion or behaviour pattern" },
  avoid: { label: "Avoid", hint: "Negative reference. Do not do this." },
  "apply-skill": { label: "Apply skill", hint: "The connected markdown becomes context for the target" },
  "free-text": { label: "Free text", hint: "Write the relation yourself" }
};

const base = { id: z.string(), position: Position, width: z.number().optional(), height: z.number().optional() };

export const ScreenNode = z.object({ ...base, type: z.literal("screen"), screenId: z.string() });
export const EdgeCaseNode = z.object({ ...base, type: z.literal("edgeCase"), edgeCaseId: z.string() });
export const InspirationKind = z.enum(["image", "text", "url", "style"]);
export type InspirationKind = z.infer<typeof InspirationKind>;
export const InspirationNode = z.object({
  ...base,
  type: z.literal("inspiration"),
  kind: InspirationKind,
  title: z.string(),
  path: z.string().optional().describe("Project-relative path for images and captures"),
  text: z.string().optional(),
  url: z.string().optional(),
  caption: z.string().default(""),
  description: z.string().default("").describe("Auto-generated description so text search works over images"),
  groupId: z.string().optional()
});
export const SkillNode = z.object({ ...base, type: z.literal("skill"), path: z.string(), title: z.string(), groupId: z.string().optional() });
export const PromptNode = z.object({
  ...base,
  type: z.literal("prompt"),
  kind: z.enum(["brief", "instruction", "record"]),
  text: z.string(),
  runId: z.string().optional()
});
export const VariantTarget = z.object({
  screenId: z.string().optional(),
  elementId: z.string().optional(),
  token: z.string().optional()
});
export type VariantTarget = z.infer<typeof VariantTarget>;
export const VariantOption = z.object({
  id: z.string(),
  label: z.string(),
  rationale: z.string().default(""),
  file: z.string().describe("Project-relative path to the fragment, screen, or token file")
});
export type VariantOption = z.infer<typeof VariantOption>;
export const VariantPanelNode = z.object({
  ...base,
  type: z.literal("variantPanel"),
  target: VariantTarget,
  direction: z.string().default(""),
  options: z.array(VariantOption).default([]),
  appliedId: z.string().optional(),
  /** Saved the first time an option is applied, so the designer can always go back. */
  originalFile: z.string().optional()
});
export const NoteNode = z.object({ ...base, type: z.literal("note"), text: z.string() });
export const VersionPinNode = z.object({ ...base, type: z.literal("versionPin"), versionId: z.string(), label: z.string() });
export const GroupNode = z.object({ ...base, type: z.literal("group"), title: z.string(), width: z.number(), height: z.number() });

export const CanvasNode = z.discriminatedUnion("type", [
  ScreenNode,
  EdgeCaseNode,
  InspirationNode,
  SkillNode,
  PromptNode,
  VariantPanelNode,
  NoteNode,
  VersionPinNode,
  GroupNode
]);
export type CanvasNode = z.infer<typeof CanvasNode>;
export type CanvasNodeType = CanvasNode["type"];
export type InspirationNode = z.infer<typeof InspirationNode>;
export type SkillNode = z.infer<typeof SkillNode>;
export type VariantPanelNode = z.infer<typeof VariantPanelNode>;

export const CanvasEdgeType = z.enum(["magic", "variantLink", "provenance"]);
export const CanvasEdge = z.object({
  id: z.string(),
  type: CanvasEdgeType,
  source: z.string(),
  target: z.string(),
  targetElementId: z.string().optional().describe("When a magic line points at one element inside a screen"),
  relation: MagicRelation.optional(),
  note: z.string().default("")
});
export type CanvasEdge = z.infer<typeof CanvasEdge>;

export const CanvasDoc = z.object({
  version: z.literal(1),
  view: ViewMode.default("prototype"),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).default({ x: 0, y: 0, zoom: 1 }),
  nodes: z.array(CanvasNode).default([]),
  edges: z.array(CanvasEdge).default([]),
  /** screenId → transitionId chosen by the user as that screen's main onward move. */
  primaryMoves: z.record(z.string(), z.string()).default({})
});
export type CanvasDoc = z.infer<typeof CanvasDoc>;

export function emptyCanvas(): CanvasDoc {
  return { version: 1, view: "prototype", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], primaryMoves: {} };
}

export const screenNodeId = (screenId: string) => `screen:${screenId}`;
export const edgeCaseNodeId = (edgeCaseId: string) => `edgecase:${edgeCaseId}`;
