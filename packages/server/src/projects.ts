import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  CanvasDoc, DesignSpec, DEVICE_PRESETS, PROJECT_FILES, emptyCanvas, emptySpec, reconcileCanvas, tokensCss, demoSpec, demoScreenHtml,
  type DeviceKind, type ProjectBundle, type ProjectMeta
} from "@flow/shared";
import { EXAMPLES_DIR, PROJECTS_ROOT } from "./config.js";
import { commitVersion, fileAtVersion, firstApplyCommit, initRepo, listVersions } from "./versions.js";
import { extractElement } from "./html.js";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function projectDir(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`bad project id "${id}"`);
  return path.join(PROJECTS_ROOT, id);
}

/** Resolves a project-relative path and refuses anything that escapes the folder. */
export function safeJoin(id: string, rel: string): string {
  const dir = projectDir(id);
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) throw new Error(`path escapes project: ${rel}`);
  return abs;
}

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "project";
}

async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

async function uniqueId(base: string): Promise<string> {
  let id = base;
  let n = 2;
  while (await exists(path.join(PROJECTS_ROOT, id))) id = `${base}-${n++}`;
  return id;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const out: ProjectMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !SAFE_ID.test(e.name)) continue;
    const specPath = path.join(PROJECTS_ROOT, e.name, PROJECT_FILES.spec);
    if (!(await exists(specPath))) continue;
    try {
      const spec = DesignSpec.parse(JSON.parse(await fs.readFile(specPath, "utf8")));
      const st = await fs.stat(specPath);
      const dirSt = await fs.stat(path.join(PROJECTS_ROOT, e.name));
      out.push({ id: e.name, name: spec.name, path: path.join(PROJECTS_ROOT, e.name), createdAt: dirSt.birthtime.toISOString(), updatedAt: st.mtime.toISOString(), screenCount: spec.screens.length });
    } catch { /* skip unreadable */ }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readSpec(id: string): Promise<DesignSpec> {
  return DesignSpec.parse(JSON.parse(await fs.readFile(safeJoin(id, PROJECT_FILES.spec), "utf8")));
}
export async function writeSpec(id: string, spec: DesignSpec): Promise<void> {
  await fs.writeFile(safeJoin(id, PROJECT_FILES.spec), JSON.stringify(spec, null, 2) + "\n");
}
export async function readCanvas(id: string): Promise<CanvasDoc> {
  const p = safeJoin(id, PROJECT_FILES.canvas);
  if (!(await exists(p))) return emptyCanvas();
  return CanvasDoc.parse(JSON.parse(await fs.readFile(p, "utf8")));
}
export async function writeCanvas(id: string, canvas: CanvasDoc): Promise<void> {
  await fs.writeFile(safeJoin(id, PROJECT_FILES.canvas), JSON.stringify(canvas, null, 2) + "\n");
}

type SessionFile = { sessionId: string | null; updatedAt: string };
export async function readSessionId(id: string): Promise<string | null> {
  const p = safeJoin(id, PROJECT_FILES.sessions);
  if (!(await exists(p))) return null;
  try { return (JSON.parse(await fs.readFile(p, "utf8")) as SessionFile).sessionId; } catch { return null; }
}
export async function writeSessionId(id: string, sessionId: string | null): Promise<void> {
  await fs.mkdir(safeJoin(id, PROJECT_FILES.internal), { recursive: true });
  const body: SessionFile = { sessionId, updatedAt: new Date().toISOString() };
  await fs.writeFile(safeJoin(id, PROJECT_FILES.sessions), JSON.stringify(body, null, 2));
}

type PinsFile = Record<string, { pinned: boolean; label?: string }>;
export async function readPins(id: string): Promise<PinsFile> {
  const p = safeJoin(id, ".flow/pins.json");
  if (!(await exists(p))) return {};
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return {}; }
}
export async function writePins(id: string, pins: PinsFile): Promise<void> {
  await fs.mkdir(safeJoin(id, PROJECT_FILES.internal), { recursive: true });
  await fs.writeFile(safeJoin(id, ".flow/pins.json"), JSON.stringify(pins, null, 2));
}

export async function loadProject(id: string): Promise<ProjectBundle> {
  const dir = projectDir(id);
  if (!(await exists(dir))) throw Object.assign(new Error(`project "${id}" not found`), { statusCode: 404 });
  const spec = await readSpec(id);
  const rawCanvas = await readCanvas(id);
  let { canvas, changed } = reconcileCanvas(spec, rawCanvas);
  if (await backfillOriginals(id, spec, canvas)) changed = true;
  if (changed) await writeCanvas(id, canvas);
  const pins = await readPins(id);
  const versions = (await listVersions(dir)).map((v) => ({ ...v, pinned: pins[v.id]?.pinned ?? v.pinned, label: pins[v.id]?.label ?? v.label }));
  const st = await fs.stat(path.join(dir, PROJECT_FILES.spec));
  const dirSt = await fs.stat(dir);
  return {
    meta: { id, name: spec.name, path: dir, createdAt: dirSt.birthtime.toISOString(), updatedAt: st.mtime.toISOString(), screenCount: spec.screens.length },
    spec,
    canvas,
    versions,
    sessionId: await readSessionId(id)
  };
}

/** Panels applied before originals were saved: recover the pre-apply markup from the commit before the first apply. */
async function backfillOriginals(id: string, spec: DesignSpec, canvas: CanvasDoc): Promise<boolean> {
  let changed = false;
  for (const n of canvas.nodes) {
    if (n.type !== "variantPanel" || !n.appliedId || n.originalFile) continue;
    const screen = n.target.screenId ? spec.screens.find((s) => s.id === n.target.screenId) : undefined;
    const file = n.target.token ? "tokens.css" : screen?.file;
    if (!file) continue;
    // Older apply commits did not name the panel; fall back to the element-and-screen wording they used.
    const fallback = n.target.token ? "Applied token variant" : n.target.elementId ? `to ${n.target.elementId} on ${screen?.name ?? ""}` : `Applied screen variant`;
    const sha = await firstApplyCommit(projectDir(id), n.id, fallback);
    if (!sha) continue;
    const before = await fileAtVersion(projectDir(id), `${sha}~1`, file);
    if (before == null) continue;
    const original = n.target.elementId ? extractElement(before, n.target.elementId) : before;
    if (original == null) continue;
    const rel = `variants/${n.id}/original.${n.target.token ? "css" : "html"}`;
    await fs.mkdir(safeJoin(id, `variants/${n.id}`), { recursive: true });
    await fs.writeFile(safeJoin(id, rel), original);
    n.originalFile = rel;
    changed = true;
  }
  return changed;
}

async function scaffold(id: string, spec: DesignSpec, canvas: CanvasDoc): Promise<void> {
  const dir = projectDir(id);
  await fs.mkdir(dir, { recursive: true });
  for (const sub of [PROJECT_FILES.screens, PROJECT_FILES.inspirations, PROJECT_FILES.skills, PROJECT_FILES.variants, PROJECT_FILES.internal, PROJECT_FILES.requests]) {
    await fs.mkdir(path.join(dir, sub), { recursive: true });
  }
  await fs.writeFile(path.join(dir, ".gitignore"), ".flow/sessions.json\n.DS_Store\n");
  await writeSpec(id, spec);
  await writeCanvas(id, canvas);
  await fs.writeFile(path.join(dir, PROJECT_FILES.tokens), tokensCss(spec));
  await initRepo(dir);
}

export async function createProject(input: { name: string; brief: string; deviceKind: DeviceKind }): Promise<ProjectBundle> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const id = await uniqueId(slugify(input.name));
  const spec = emptySpec(id, input.name, input.brief, DEVICE_PRESETS[input.deviceKind]);
  const canvas = emptyCanvas();
  canvas.nodes.push({ id: "brief", type: "prompt", kind: "brief", text: input.brief, position: { x: -420, y: 0 }, width: 320 });
  await scaffold(id, spec, canvas);
  await commitVersion(projectDir(id), { kind: "init", summary: `Created project "${input.name}"`, screens: [], pinned: false });
  return loadProject(id);
}

export async function createDemoProject(): Promise<ProjectBundle> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const id = await uniqueId("demo-coffee");
  const spec = demoSpec(id);
  const canvas = emptyCanvas();
  canvas.nodes.push({ id: "brief", type: "prompt", kind: "brief", text: spec.brief, position: { x: -420, y: 0 }, width: 320 });
  canvas.nodes.push({ id: "note-" + nanoid(6), type: "note", text: "Demo project. Screens are placeholders that follow the runtime contract, so navigation, states, and the picker all work without Claude.", position: { x: -420, y: 220 }, width: 320 });
  await scaffold(id, spec, reconcileCanvas(spec, canvas).canvas);
  for (const s of spec.screens) await fs.writeFile(safeJoin(id, s.file), demoScreenHtml(spec, s.id));
  await commitVersion(projectDir(id), { kind: "generate", summary: "Demo project with three placeholder screens", screens: spec.screens.map((s) => s.id), pinned: false });
  return loadProject(id);
}

export type ExampleMeta = { id: string; name: string; brief: string; device: DeviceKind; screenCount: number };

/** Sample projects shipped in the repo's examples/ folder. */
export async function listExamples(): Promise<ExampleMeta[]> {
  if (!(await exists(EXAMPLES_DIR))) return [];
  const entries = await fs.readdir(EXAMPLES_DIR, { withFileTypes: true });
  const out: ExampleMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !SAFE_ID.test(e.name)) continue;
    try {
      const spec = DesignSpec.parse(JSON.parse(await fs.readFile(path.join(EXAMPLES_DIR, e.name, PROJECT_FILES.spec), "utf8")));
      out.push({ id: e.name, name: spec.name, brief: spec.brief, device: spec.device.kind, screenCount: spec.screens.length });
    } catch { /* skip malformed */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Copies an example into a fresh project folder with its own git history. */
export async function createProjectFromExample(exampleId: string): Promise<ProjectBundle> {
  if (!SAFE_ID.test(exampleId)) throw Object.assign(new Error(`bad example id "${exampleId}"`), { statusCode: 400 });
  const src = path.join(EXAMPLES_DIR, exampleId);
  if (!(await exists(path.join(src, PROJECT_FILES.spec)))) throw Object.assign(new Error(`example "${exampleId}" not found`), { statusCode: 404 });
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const id = await uniqueId(exampleId);
  const raw = DesignSpec.parse(JSON.parse(await fs.readFile(path.join(src, PROJECT_FILES.spec), "utf8")));
  const spec: DesignSpec = { ...raw, id };
  const canvas = emptyCanvas();
  canvas.nodes.push({ id: "brief", type: "prompt", kind: "brief", text: spec.brief, position: { x: -420, y: 0 }, width: 320 });
  canvas.nodes.push({ id: "note-" + nanoid(6), type: "note", text: `Example project "${spec.name}". Hand-built screens that follow the runtime contract, so the prototype, flow view, states, picker, and change requests all work without Claude.`, position: { x: -420, y: 220 }, width: 320 });
  await scaffold(id, spec, reconcileCanvas(spec, canvas).canvas);
  for (const s of spec.screens) {
    const from = path.join(src, s.file);
    await fs.mkdir(path.dirname(safeJoin(id, s.file)), { recursive: true });
    await fs.copyFile(from, safeJoin(id, s.file));
  }
  const tokens = path.join(src, PROJECT_FILES.tokens);
  if (await exists(tokens)) await fs.copyFile(tokens, safeJoin(id, PROJECT_FILES.tokens));
  await commitVersion(projectDir(id), { kind: "generate", summary: `Loaded example "${spec.name}" with ${spec.screens.length} screens`, screens: spec.screens.map((s) => s.id), pinned: false });
  return loadProject(id);
}

export async function saveAsset(id: string, kind: "inspirations" | "skills" | "variants", filename: string, data: Buffer): Promise<string> {
  const clean = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(0, 80) || "file";
  const stamp = nanoid(6);
  const ext = path.extname(clean);
  const base = path.basename(clean, ext);
  const rel = path.posix.join(kind, `${base}-${stamp}${ext}`);
  await fs.mkdir(safeJoin(id, kind), { recursive: true });
  await fs.writeFile(safeJoin(id, rel), data);
  return rel;
}

export async function readProjectFile(id: string, rel: string): Promise<Buffer> {
  return fs.readFile(safeJoin(id, rel));
}

export async function fileHashes(id: string, rels: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rel of rels) {
    try { out[rel] = createHash("sha256").update(await fs.readFile(safeJoin(id, rel))).digest("hex"); } catch { out[rel] = ""; }
  }
  return out;
}

export async function fileExists(id: string, rel: string): Promise<boolean> {
  return exists(safeJoin(id, rel));
}
