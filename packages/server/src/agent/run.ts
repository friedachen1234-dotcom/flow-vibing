/**
 * Orchestrates one agent run per project: compile → snapshot → run → validate → merge → version → broadcast.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  reconcileCanvas, type AgentIntent, type ChangeRequest, type DesignSpec, type ServerMessage, type ValidationIssue, type VariantTarget, type Provenance, type VariantOption
} from "@flow/shared";
import { fileHashes, loadProject, projectDir, readCanvas, readSessionId, safeJoin, writeCanvas, writeSessionId, writeSpec } from "../projects.js";
import { commitVersion, discardGeneratedChanges, discardWorkingChanges, workingChanges } from "../versions.js";
import { compileChat, compileDescribe, compileGenerate, compileRegenerate, compileVariants, type CompiledRequest } from "./compiler.js";
import { runAgent } from "./session.js";
import { validateRun } from "./validate.js";

export type RunPayload = {
  brief?: string;
  text?: string;
  changeRequests?: ChangeRequest[];
  target?: VariantTarget;
  count?: number;
  direction?: string;
  nodeId?: string;
  inspirationIds?: string[];
};

type Active = { runId: string; abort: AbortController };
const active = new Map<string, Active>();

export function isRunning(projectId: string) { return active.has(projectId); }

export function cancelRun(projectId: string): boolean {
  const a = active.get(projectId);
  if (!a) return false;
  a.abort.abort();
  return true;
}

export async function startRun(projectId: string, intent: AgentIntent, payload: RunPayload, broadcast: (m: ServerMessage) => void): Promise<string> {
  if (active.has(projectId)) throw new Error("a run is already in progress for this project");
  const runId = nanoid(10);
  const abort = new AbortController();
  active.set(projectId, { runId, abort });
  // Fire and forget; events flow over the websocket.
  void (async () => {
    try { await execute(projectId, runId, intent, payload, abort, broadcast); }
    catch (e) { broadcast({ type: "agent:error", runId, message: (e as Error).message }); }
    finally { active.delete(projectId); }
  })();
  return runId;
}

async function execute(projectId: string, runId: string, intent: AgentIntent, payload: RunPayload, abort: AbortController, broadcast: (m: ServerMessage) => void) {
  const dir = projectDir(projectId);
  const leftovers = await discardGeneratedChanges(dir);
  if (leftovers.length) console.warn(`[flow] discarded ${leftovers.length} leftover file(s) from an interrupted run in ${projectId}: ${leftovers.join(", ")}`);
  const bundle = await loadProject(projectId);
  const ctx = { spec: bundle.spec, canvas: bundle.canvas };
  let compiled: CompiledRequest;
  let panelId: string | undefined;

  switch (intent) {
    case "generate": {
      const brief = (payload.brief ?? bundle.spec.brief).trim();
      if (!brief) throw new Error("the brief is empty");
      if (brief !== bundle.spec.brief) { bundle.spec.brief = brief; await writeSpec(projectId, bundle.spec); }
      compiled = compileGenerate(ctx, brief);
      break;
    }
    case "regenerate": {
      const crs = payload.changeRequests ?? [];
      if (crs.length === 0) throw new Error("no change requests to apply");
      compiled = compileRegenerate(ctx, crs);
      break;
    }
    case "chat": {
      if (!payload.text?.trim()) throw new Error("empty message");
      compiled = compileChat(ctx, payload.text.trim(), payload.target);
      break;
    }
    case "variants": {
      if (!payload.target) throw new Error("no variant target");
      panelId = payload.nodeId ?? `variants-${nanoid(6)}`;
      compiled = compileVariants(ctx, payload.target, payload.count ?? 3, payload.direction ?? "", panelId, payload.inspirationIds ?? []);
      break;
    }
    case "describe": {
      if (!payload.nodeId) throw new Error("no node to describe");
      compiled = compileDescribe(ctx, payload.nodeId);
      break;
    }
  }

  // Persist the compiled request for provenance (G-6).
  await fs.mkdir(safeJoin(projectId, ".flow/requests"), { recursive: true });
  await fs.writeFile(safeJoin(projectId, `.flow/requests/${runId}.json`), JSON.stringify({ runId, intent, payload, compiled, at: new Date().toISOString() }, null, 2));

  broadcast({ type: "agent:started", runId, intent, plan: compiled.plan });
  const keepHashesBefore = await fileHashes(projectId, compiled.keepFiles);
  const previousSession = await readSessionId(projectId);

  const outcome = await runAgent({
    dir,
    runId,
    systemPrompt: compiled.systemPrompt,
    prompt: compiled.prompt,
    resumeSessionId: intent === "generate" ? null : previousSession,
    abort,
    emit: broadcast
  });

  if (outcome.sessionId) await writeSessionId(projectId, outcome.sessionId);

  if (abort.signal.aborted) {
    await discardWorkingChanges(dir);
    broadcast({ type: "agent:error", runId, message: "Cancelled. Partial writes were discarded." });
    broadcast({ type: "project:updated", projectId, reason: "cancelled" });
    return;
  }
  if (!outcome.ok && outcome.errors.length && outcome.filesWritten.length === 0) {
    broadcast({ type: "agent:error", runId, message: outcome.errors.join("; ") || "Claude did not finish" });
    return;
  }

  const issues: ValidationIssue[] = [];
  let versionId: string | undefined;

  if (intent === "describe") {
    // Store the description on the node; no version needed.
    const canvas = await readCanvas(projectId);
    const node = canvas.nodes.find((n) => n.id === payload.nodeId);
    if (node && node.type === "inspiration") { node.description = outcome.resultText.trim(); await writeCanvas(projectId, canvas); }
  } else if (intent === "variants" && panelId) {
    const optsPath = safeJoin(projectId, `variants/${panelId}/options.json`);
    let options: VariantOption[] = [];
    try {
      const raw = JSON.parse(await fs.readFile(optsPath, "utf8")) as Partial<VariantOption>[];
      options = raw.filter((o) => o.id && o.file).map((o) => ({ id: String(o.id), label: String(o.label ?? o.id), rationale: String(o.rationale ?? ""), file: String(o.file) }));
    } catch { issues.push({ level: "error", message: `variants/${panelId}/options.json is missing or invalid` }); }
    for (const o of options) { try { await fs.access(safeJoin(projectId, o.file)); } catch { issues.push({ level: "error", message: `variant file "${o.file}" is missing` }); } }
    const after = await fileHashes(projectId, compiled.keepFiles);
    for (const f of compiled.keepFiles) if (after[f] !== keepHashesBefore[f]) issues.push({ level: "error", message: `"${f}" was changed during a variants run` });
    const canvas = await readCanvas(projectId);
    const existing = canvas.nodes.find((n) => n.id === panelId);
    if (existing && existing.type === "variantPanel") { existing.options = options; }
    else {
      const host = canvas.nodes.find((n) => n.type === "screen" && n.screenId === payload.target?.screenId);
      canvas.nodes.push({
        id: panelId, type: "variantPanel", target: payload.target!, direction: payload.direction ?? "", options,
        position: host ? { x: host.position.x, y: host.position.y + (host.height ?? 800) + 80 } : { x: 0, y: 0 }, width: 640
      });
      if (host) canvas.edges.push({ id: `vl-${panelId}`, type: "variantLink", source: panelId, target: host.id, targetElementId: payload.target?.elementId, note: "" });
    }
    await writeCanvas(projectId, canvas);
    const v = await commitVersion(dir, { kind: "variant", summary: `Generated ${options.length} variants`, screens: payload.target?.screenId ? [payload.target.screenId] : [], pinned: false });
    versionId = v?.id;
  } else {
    const provenance: Provenance[] = compiled.contextSources.map((s) => ({ sourceNodeId: s.nodeId, relation: s.relation }));
    const result = await validateRun({
      projectId, previous: bundle.spec, keepFiles: compiled.keepFiles, keepHashesBefore,
      affectedScreens: compiled.affectedScreens, provenanceToAdd: provenance, expectSpecWrite: intent !== "chat"
    });
    issues.push(...result.issues);
    if (result.spec) {
      // Normalise the spec file with server-owned fields, then bring the canvas in step.
      const spec: DesignSpec = result.spec;
      await writeSpec(projectId, spec);
      const canvas = await readCanvas(projectId);
      const rec = reconcileCanvas(spec, canvas);
      if (rec.changed) await writeCanvas(projectId, rec.canvas);
      // Record the prompt on the canvas as a collapsed record node, next to the brief.
      if (intent === "generate" || intent === "regenerate") {
        const c2 = await readCanvas(projectId);
        const brief = c2.nodes.find((n) => n.id === "brief");
        const count = c2.nodes.filter((n) => n.type === "prompt" && n.kind === "record").length;
        c2.nodes.push({ id: `run-${runId}`, type: "prompt", kind: "record", text: intent === "generate" ? `Generate: ${spec.brief.slice(0, 200)}` : compiled.plan, runId, position: { x: (brief?.position.x ?? -420), y: (brief?.position.y ?? 0) - 120 - count * 70 }, width: 320 });
        await writeCanvas(projectId, c2);
      }
    }
    const touched = intent === "generate" ? (result.spec?.screens.map((s) => s.id) ?? []) : compiled.affectedScreens.filter((id) => outcome.filesWritten.some((f) => f === result.spec?.screens.find((s) => s.id === id)?.file));
    const changed = await workingChanges(dir);
    if (changed.length) {
      const summary = intent === "generate" ? `Generated ${result.spec?.screens.length ?? 0} screens from the brief`
        : intent === "regenerate" ? `Applied ${payload.changeRequests?.length ?? 0} change${(payload.changeRequests?.length ?? 0) === 1 ? "" : "s"}`
        : `Chat: ${(payload.text ?? "").slice(0, 60)}`;
      const v = await commitVersion(dir, { kind: intent === "generate" ? "generate" : intent === "regenerate" ? "regenerate" : "edit", summary, screens: touched, pinned: false });
      versionId = v?.id;
    }
  }

  broadcast({
    type: "agent:done", runId, ok: outcome.ok && !issues.some((i) => i.level === "error"), costUsd: outcome.costUsd, usage: outcome.usage,
    durationMs: outcome.durationMs, numTurns: outcome.numTurns, issues, versionId, resultText: outcome.resultText
  });
  broadcast({ type: "project:updated", projectId, reason: intent });
}

export function requestsDir(projectId: string) { return path.join(projectDir(projectId), ".flow", "requests"); }
