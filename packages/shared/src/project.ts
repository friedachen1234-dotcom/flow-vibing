import { z } from "zod";
import { DesignSpec } from "./spec.js";
import { CanvasDoc } from "./canvas.js";
import { Version } from "./versions.js";

export const ProjectMeta = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  screenCount: z.number().default(0),
  /** Enough to draw a live thumbnail without loading the whole project. */
  firstScreen: z.string().nullable().default(null),
  device: z.object({ kind: z.string(), width: z.number(), height: z.number() }).optional()
});
export type ProjectMeta = z.infer<typeof ProjectMeta>;

export const ProjectBundle = z.object({
  meta: ProjectMeta,
  spec: DesignSpec,
  canvas: CanvasDoc,
  versions: z.array(Version),
  sessionId: z.string().nullable()
});
export type ProjectBundle = z.infer<typeof ProjectBundle>;

/** Standard layout inside a project folder. */
export const PROJECT_FILES = {
  spec: "flow.json",
  canvas: "canvas.json",
  tokens: "tokens.css",
  screens: "screens",
  inspirations: "inspirations",
  skills: "skills",
  variants: "variants",
  runtime: "runtime",
  internal: ".flow",
  sessions: ".flow/sessions.json",
  requests: ".flow/requests"
} as const;
