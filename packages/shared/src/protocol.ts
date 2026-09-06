import { z } from "zod";
import { ChangeRequest } from "./changes.js";
import { VariantTarget } from "./canvas.js";

/** Client → server over the websocket. */
export const AgentIntent = z.enum(["generate", "regenerate", "chat", "variants", "describe"]);
export type AgentIntent = z.infer<typeof AgentIntent>;

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), projectId: z.string() }),
  z.object({
    type: z.literal("agent:run"),
    projectId: z.string(),
    intent: AgentIntent,
    payload: z.object({
      brief: z.string().optional(),
      text: z.string().optional(),
      changeRequests: z.array(ChangeRequest).optional(),
      target: VariantTarget.optional(),
      count: z.number().int().min(2).max(6).optional(),
      direction: z.string().optional(),
      nodeId: z.string().optional(),
      inspirationIds: z.array(z.string()).optional()
    }).default({})
  }),
  z.object({ type: z.literal("agent:cancel"), projectId: z.string() })
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ValidationIssue = z.object({
  level: z.enum(["error", "warning"]),
  message: z.string(),
  screenId: z.string().optional()
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export const Usage = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number()
});
export type Usage = z.infer<typeof Usage>;

/** Server → client. */
export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent:started"), runId: z.string(), intent: AgentIntent, plan: z.string() }),
  z.object({ type: z.literal("agent:session"), runId: z.string(), sessionId: z.string(), model: z.string() }),
  z.object({ type: z.literal("agent:text"), runId: z.string(), delta: z.string() }),
  z.object({ type: z.literal("agent:message"), runId: z.string(), text: z.string() }),
  z.object({ type: z.literal("agent:thinking"), runId: z.string(), delta: z.string() }),
  z.object({ type: z.literal("agent:tool"), runId: z.string(), toolUseId: z.string(), name: z.string(), summary: z.string(), path: z.string().optional() }),
  z.object({ type: z.literal("agent:tool-result"), runId: z.string(), toolUseId: z.string(), ok: z.boolean(), summary: z.string() }),
  z.object({ type: z.literal("agent:file"), runId: z.string(), path: z.string(), action: z.enum(["write", "edit"]) }),
  z.object({ type: z.literal("agent:status"), runId: z.string(), status: z.string() }),
  z.object({
    type: z.literal("agent:done"),
    runId: z.string(),
    ok: z.boolean(),
    costUsd: z.number(),
    usage: Usage,
    durationMs: z.number(),
    numTurns: z.number(),
    issues: z.array(ValidationIssue),
    versionId: z.string().optional(),
    resultText: z.string()
  }),
  z.object({ type: z.literal("agent:error"), runId: z.string(), message: z.string() }),
  z.object({ type: z.literal("project:updated"), projectId: z.string(), reason: z.string() }),
  z.object({ type: z.literal("agent:replay"), projectId: z.string(), events: z.array(z.any()) })
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
