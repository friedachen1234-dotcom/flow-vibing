/**
 * Runs one request through the Claude Agent SDK and translates SDK messages into FLOW protocol events.
 * Uses the developer's existing Claude Code login. No API key lives in FLOW.
 */
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import type { ServerMessage, Usage } from "@flow/shared";
import { DEFAULT_EFFORT, DEFAULT_MODEL } from "../config.js";

export type RunOutcome = {
  ok: boolean;
  sessionId: string | null;
  costUsd: number;
  usage: Usage;
  durationMs: number;
  numTurns: number;
  resultText: string;
  filesWritten: string[];
  errors: string[];
};

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const ALLOWED = ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "LS", "TodoWrite"];
const DENIED = ["Bash", "WebFetch", "WebSearch", "Task", "Agent", "KillShell", "BashOutput", "NotebookEdit"];

function summarizeInput(name: string, input: Record<string, unknown>): { summary: string; path?: string } {
  const p = typeof input.file_path === "string" ? input.file_path : typeof input.path === "string" ? input.path : undefined;
  if (name === "Read") return { summary: `Read ${p ?? ""}`.trim(), path: p };
  if (name === "Write") return { summary: `Write ${p ?? ""}`.trim(), path: p };
  if (name === "Edit" || name === "MultiEdit") return { summary: `Edit ${p ?? ""}`.trim(), path: p };
  if (name === "Glob") return { summary: `Find ${String(input.pattern ?? "")}` };
  if (name === "Grep") return { summary: `Search ${String(input.pattern ?? "")}` };
  if (name === "TodoWrite") return { summary: "Update plan" };
  return { summary: name };
}

export async function runAgent(opts: {
  dir: string;
  runId: string;
  systemPrompt: string;
  prompt: string;
  resumeSessionId?: string | null;
  model?: string;
  effort?: Options["effort"];
  maxTurns?: number;
  abort: AbortController;
  emit: (m: ServerMessage) => void;
}): Promise<RunOutcome> {
  const { dir, runId, emit } = opts;
  const filesWritten = new Set<string>();
  const started = Date.now();
  let sessionId: string | null = null;
  let resultText = "";
  let costUsd = 0;
  let numTurns = 0;
  let ok = false;
  const errors: string[] = [];
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const rel = (p: string) => (path.isAbsolute(p) ? path.relative(dir, p) : p);

  const options: Options = {
    cwd: dir,
    systemPrompt: { type: "custom", prompt: opts.systemPrompt },
    permissionMode: "acceptEdits",
    allowedTools: ALLOWED,
    disallowedTools: DENIED,
    includePartialMessages: true,
    persistSession: true,
    settingSources: [],
    model: opts.model ?? DEFAULT_MODEL,
    effort: opts.effort ?? DEFAULT_EFFORT,
    maxTurns: opts.maxTurns ?? 120,
    abortController: opts.abort,
    resume: opts.resumeSessionId ?? undefined,
    stderr: (line) => { if (process.env.FLOW_DEBUG) console.error("[claude]", line.trimEnd()); },
    hooks: {
      // Writes must stay inside the project folder, and never touch git or FLOW internals.
      PreToolUse: [{
        matcher: "Write|Edit|MultiEdit",
        hooks: [async (input) => {
          const ti = (input as { tool_input?: { file_path?: unknown } }).tool_input;
          const p = typeof ti?.file_path === "string" ? ti.file_path : "";
          const abs = path.resolve(dir, p);
          const inside = abs.startsWith(dir + path.sep);
          const forbidden = inside && (/[\/]\.git([\/]|$)/.test(abs.slice(dir.length)) || /[\/]\.flow([\/]|$)/.test(abs.slice(dir.length)));
          if (!inside || forbidden) {
            return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `FLOW only allows writes inside the project folder (${dir}), not under .git or .flow.` } };
          }
          return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
        }]
      }]
    }
  };

  let stream: AsyncIterable<SDKMessage>;
  try {
    stream = query({ prompt: opts.prompt, options });
  } catch (e) {
    return { ok: false, sessionId: null, costUsd: 0, usage, durationMs: Date.now() - started, numTurns: 0, resultText: "", filesWritten: [], errors: [(e as Error).message] };
  }

  try {
    for await (const msg of stream) {
      if (msg.type === "system") {
        if (msg.subtype === "init") {
          sessionId = msg.session_id;
          emit({ type: "agent:session", runId, sessionId, model: msg.model });
        } else if (msg.subtype === "status" && msg.status) {
          emit({ type: "agent:status", runId, status: msg.status });
        }
      } else if (msg.type === "stream_event") {
        const ev = msg.event as { type: string; delta?: { type?: string; text?: string; thinking?: string } };
        if (ev.type === "content_block_delta" && ev.delta) {
          if (ev.delta.type === "text_delta" && ev.delta.text) emit({ type: "agent:text", runId, delta: ev.delta.text });
          else if (ev.delta.type === "thinking_delta" && ev.delta.thinking) emit({ type: "agent:thinking", runId, delta: ev.delta.thinking });
        }
      } else if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) emit({ type: "agent:message", runId, text: block.text });
          else if (block.type === "tool_use") {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const { summary, path: p } = summarizeInput(block.name, input);
            emit({ type: "agent:tool", runId, toolUseId: block.id, name: block.name, summary, path: p ? rel(p) : undefined });
            if (WRITE_TOOLS.has(block.name) && p) {
              const r = rel(p);
              filesWritten.add(r);
              emit({ type: "agent:file", runId, path: r, action: block.name === "Write" ? "write" : "edit" });
            }
          }
        }
      } else if (msg.type === "user") {
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_result") {
              const text = typeof block.content === "string" ? block.content : Array.isArray(block.content) ? block.content.map((c) => (c.type === "text" ? c.text : "")).join(" ") : "";
              emit({ type: "agent:tool-result", runId, toolUseId: block.tool_use_id, ok: !block.is_error, summary: text.replace(/\s+/g, " ").slice(0, 160) });
            }
          }
        }
      } else if (msg.type === "result") {
        sessionId = msg.session_id ?? sessionId;
        costUsd = msg.total_cost_usd ?? 0;
        numTurns = msg.num_turns ?? 0;
        usage = {
          inputTokens: msg.usage?.input_tokens ?? 0,
          outputTokens: msg.usage?.output_tokens ?? 0,
          cacheReadTokens: msg.usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: msg.usage?.cache_creation_input_tokens ?? 0
        };
        if (msg.subtype === "success") { ok = !msg.is_error; resultText = msg.result; }
        else { ok = false; errors.push(...(msg.errors ?? [msg.subtype])); }
      }
    }
  } catch (e) {
    const err = e as Error;
    if (opts.abort.signal.aborted) errors.push("cancelled");
    else errors.push(err.message);
    ok = false;
  }

  return { ok, sessionId, costUsd, usage, durationMs: Date.now() - started, numTurns, resultText, filesWritten: [...filesWritten], errors };
}
