import fs from "node:fs/promises";
import { ClaudeSpecOutput, DesignSpec, lintSpec, type ValidationIssue, type Provenance } from "@flow/shared";
import { fileHashes, safeJoin } from "../projects.js";

export type ValidationResult = { spec: DesignSpec | null; issues: ValidationIssue[] };

/**
 * Checks Claude's output against the contract: spec shape, referential integrity, files present,
 * element and transition attributes present in the HTML, and KEEP files byte-identical.
 */
export async function validateRun(opts: {
  projectId: string;
  previous: DesignSpec;
  keepFiles: string[];
  keepHashesBefore: Record<string, string>;
  affectedScreens: string[];
  provenanceToAdd: Provenance[];
  expectSpecWrite: boolean;
}): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const { projectId, previous } = opts;

  // KEEP files unchanged
  const after = await fileHashes(projectId, opts.keepFiles);
  for (const f of opts.keepFiles) {
    if (after[f] !== opts.keepHashesBefore[f]) issues.push({ level: "error", message: `"${f}" was marked keep but changed` });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(safeJoin(projectId, "flow.json"), "utf8"));
  } catch (e) {
    issues.push({ level: "error", message: `flow.json could not be read: ${(e as Error).message}` });
    return { spec: null, issues };
  }

  // Accept either the full spec or Claude's subset.
  let spec: DesignSpec;
  const full = DesignSpec.safeParse(raw);
  if (full.success) spec = full.data;
  else {
    const partial = ClaudeSpecOutput.safeParse(raw);
    if (!partial.success) {
      for (const iss of partial.error.issues.slice(0, 12)) issues.push({ level: "error", message: `flow.json ${iss.path.join(".") || "root"}: ${iss.message}` });
      return { spec: null, issues };
    }
    spec = { version: 1, id: previous.id, ...partial.data, screens: partial.data.screens.map((s) => ({ ...s, provenance: [] })) };
  }
  spec.version = 1;
  spec.id = previous.id;
  if (!spec.name) spec.name = previous.name;
  if (!spec.device) spec.device = previous.device;

  // Carry provenance forward for screens that were not rewritten, add new provenance for the rest.
  const affected = new Set(opts.affectedScreens.length ? opts.affectedScreens : opts.expectSpecWrite ? spec.screens.map((s) => s.id) : []);
  for (const s of spec.screens) {
    const prev = previous.screens.find((p) => p.id === s.id);
    const carried = prev?.provenance ?? [];
    const fresh = affected.has(s.id) || !prev ? opts.provenanceToAdd.filter((p) => !p.sourceNodeId.startsWith("target:") ) : [];
    const merged = [...carried];
    for (const p of fresh) if (!merged.some((m) => m.sourceNodeId === p.sourceNodeId && m.relation === p.relation)) merged.push(p);
    s.provenance = merged;
  }

  for (const iss of lintSpec(spec)) issues.push(iss);

  // Files and attributes. Problems in screens this run did not touch are pre-existing: report them as warnings.
  const touchedByRun = new Set(opts.affectedScreens.length ? opts.affectedScreens : spec.screens.map((s) => s.id));
  for (const s of spec.screens) {
    const level: ValidationIssue["level"] = touchedByRun.has(s.id) ? "error" : "warning";
    const pre = touchedByRun.has(s.id) ? "" : " (pre-existing, screen not rewritten in this run)";
    let html: string;
    try { html = await fs.readFile(safeJoin(projectId, s.file), "utf8"); }
    catch { issues.push({ level: "error", message: `screen "${s.id}" file "${s.file}" is missing`, screenId: s.id }); continue; }
    if (!/data-flow-screen=/.test(html)) issues.push({ level: "warning", message: `"${s.file}" lacks data-flow-screen on <html>`, screenId: s.id });
    if (!/tokens\.css/.test(html)) issues.push({ level: "warning", message: `"${s.file}" does not link tokens.css`, screenId: s.id });
    if (/https?:\/\/[^"' )]+\.(js|css|woff2?)/i.test(html)) issues.push({ level: "warning", message: `"${s.file}" references an external script, stylesheet, or font`, screenId: s.id });
    for (const el of s.elements) {
      if (!new RegExp(`data-flow-el=["']${escapeRe(el.id)}["']`).test(html)) issues.push({ level, message: `element "${el.id}" declared for "${s.id}" but not present in ${s.file}${pre}`, screenId: s.id });
    }
    for (const t of spec.transitions.filter((t) => t.from.screenId === s.id)) {
      if (!new RegExp(`data-flow-transition=["'][^"']*(?:^|\\s)${escapeRe(t.id)}(?:\\s|$|["'])`).test(html) && !new RegExp(`data-flow-transition=["']${escapeRe(t.id)}["']`).test(html)) {
        issues.push({ level, message: `transition "${t.id}" has no data-flow-transition in ${s.file}${pre}`, screenId: s.id });
      }
    }
    for (const st of s.states.filter((x) => !x.isDefault)) {
      if (!new RegExp(`data-flow-state=["']${escapeRe(st.id)}["']`).test(html)) issues.push({ level: "warning", message: `state "${st.id}" on "${s.id}" has no styling in ${s.file}`, screenId: s.id });
    }
  }
  return { spec, issues };
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
