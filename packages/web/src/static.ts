/// <reference types="vite/client" />
import { DEVICE_PRESETS, emptyCanvas, emptySpec, reconcileCanvas, type CanvasDoc, type CanvasEdge, type CanvasNode, type ClientMessage, type DesignSpec, type DeviceKind, type ProjectBundle, type ProjectMeta, type ServerMessage } from "@flow/shared";
import type { Bundle, ExampleMeta } from "./api";

/**
 * The hosted demo. There is no server: the examples are static files, projects live in this tab, and anything that
 * needs Claude or git (generation, variants, versions) explains that it runs in the local app instead.
 * Built with VITE_STATIC=1, see scripts/build-static.mjs.
 */
export const IS_STATIC = import.meta.env.VITE_STATIC === "1";
export const LOCAL_APP_URL = "https://github.com/friedachen1234-dotcom/flow-vibing";
const NEEDS_LOCAL = "That needs the local app: this hosted demo is read-only. Get it at github.com/friedachen1234-dotcom/flow-vibing";

type Stored = { bundle: ProjectBundle; example: string | null };
const projects = new Map<string, Stored>();
const assets = new Map<string, string>(); // `${projectId}/${rel}` → object URL
let index: ExampleMeta[] | null = null;

async function examples(): Promise<ExampleMeta[]> {
  if (!index) index = (await fetch("/examples/index.json").then((r) => r.json())) as ExampleMeta[];
  return index;
}
function meta(id: string, spec: DesignSpec, createdAt: string): ProjectMeta {
  return { id, name: spec.name, path: "", createdAt, updatedAt: new Date().toISOString(), screenCount: spec.screens.length, firstScreen: spec.screens[0]?.id ?? null, device: spec.device };
}
function remember(id: string, spec: DesignSpec, canvas: CanvasDoc, example: string | null, summary: string): ProjectBundle {
  const now = new Date().toISOString();
  const bundle: ProjectBundle = { meta: meta(id, spec, now), spec, canvas, versions: [{ id: "local", kind: "generate", summary, createdAt: now, screens: spec.screens.map((s) => s.id), pinned: false }], sessionId: null };
  projects.set(id, { bundle, example });
  return bundle;
}
function touch(id: string, patch: Partial<ProjectBundle>) {
  const cur = projects.get(id);
  if (!cur) throw new Error("No such project in this session");
  cur.bundle = { ...cur.bundle, ...patch, meta: { ...cur.bundle.meta, updatedAt: new Date().toISOString() } };
}
const refuse = () => Promise.reject(new Error(NEEDS_LOCAL));

export const staticApi = {
  listProjects: async () => [...projects.values()].map((p) => p.bundle.meta),
  createProject: async (name: string, brief: string, deviceKind: DeviceKind) => {
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}-${Date.now().toString(36)}`;
    const spec = emptySpec(id, name, brief, DEVICE_PRESETS[deviceKind]);
    const canvas = emptyCanvas();
    canvas.nodes.push({ id: "brief", type: "prompt", kind: "brief", text: brief, position: { x: -420, y: 0 }, width: 320 });
    return remember(id, spec, canvas, null, `Created project "${name}"`);
  },
  createDemo: refuse as () => Promise<ProjectBundle>,
  listExamples: examples,
  createFromExample: async (exampleId: string) => {
    const spec = (await fetch(`/examples/${exampleId}/flow.json`).then((r) => r.json())) as DesignSpec;
    const board = (await fetch(`/examples/${exampleId}/board.json`).then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
    const canvas = emptyCanvas();
    canvas.nodes.push({ id: "brief", type: "prompt", kind: "brief", text: spec.brief, position: { x: -420, y: 0 }, width: 320 });
    canvas.nodes.push({ id: "note-demo", type: "note", text: `Example project "${spec.name}". This hosted demo keeps your edits in this tab. Generation with Claude runs in the local app.`, position: { x: -420, y: 220 }, width: 320 });
    canvas.nodes.push(...board.nodes);
    canvas.edges.push(...board.edges);
    return remember(exampleId, { ...spec, id: exampleId }, reconcileCanvas(spec, canvas).canvas, exampleId, `Loaded example "${spec.name}"`);
  },
  getProject: async (id: string): Promise<Bundle> => {
    let p = projects.get(id);
    if (!p) {
      const ex = (await examples()).find((e) => e.id === id);
      if (!ex) throw new Error("No such project in this session. Open one from the home page.");
      await staticApi.createFromExample(id);
      p = projects.get(id)!;
    }
    return { ...p.bundle, running: false };
  },
  saveCanvas: async (id: string, canvas: CanvasDoc) => { touch(id, { canvas }); return { ok: true as const }; },
  saveSpec: async (id: string, spec: DesignSpec) => { touch(id, { spec }); return { ok: true as const, version: null }; },
  restore: refuse as (id: string, sha: string) => Promise<{ ok: true }>,
  pin: refuse as (id: string, sha: string, pinned: boolean, label?: string) => Promise<{ ok: true }>,
  uploadAsset: async (id: string, kind: "inspirations" | "skills", filename: string, opts: { dataBase64?: string; text?: string }) => {
    const path = `${kind}/${Date.now().toString(36)}-${filename.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
    const url = opts.dataBase64 ? `data:${filename.match(/\.svg$/i) ? "image/svg+xml" : "image/*"};base64,${opts.dataBase64}` : URL.createObjectURL(new Blob([opts.text ?? ""], { type: "text/markdown" }));
    assets.set(`${id}/${path}`, url);
    return { path };
  },
  applyVariant: refuse as (id: string, panelId: string, optionId: string) => Promise<{ ok: true }>,
  fileUrl: (id: string, rel: string) => assets.get(`${id}/${rel}`) ?? `/examples/${projects.get(id)?.example ?? id}/${rel}`,
  versionFileUrl: (id: string, _sha: string, rel: string) => `/examples/${projects.get(id)?.example ?? id}/${rel}`,
  exampleShellUrl: (exampleId: string, screenId: string) => `/runtime/shell.html?${new URLSearchParams({ base: `/examples/${exampleId}/`, screen: screenId }).toString()}`,
  shellUrl: (id: string, screenId: string, opts: { version?: string; follow?: boolean; state?: string } = {}) => {
    const p = new URLSearchParams({ base: `/examples/${projects.get(id)?.example ?? id}/`, screen: screenId });
    if (opts.follow === false) p.set("follow", "0");
    if (opts.state) p.set("state", opts.state);
    return `/runtime/shell.html?${p.toString()}`;
  }
};

/** Stands in for the websocket: nothing to connect to, and a run answers at once with where to get the real thing. */
export class StaticSocket {
  private listeners = new Set<(m: ServerMessage) => void>();
  connect() { /* nothing to connect to */ }
  subscribe(_projectId: string) { /* nothing to subscribe to */ }
  send(m: ClientMessage) {
    if (m.type === "agent:run") {
      const msg: ServerMessage = { type: "agent:error", message: NEEDS_LOCAL } as ServerMessage;
      setTimeout(() => { for (const l of this.listeners) l(msg); }, 50);
    }
  }
  on(l: (m: ServerMessage) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
}
