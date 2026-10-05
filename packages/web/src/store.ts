import { create } from "zustand";
import { nanoid } from "nanoid";
import type { AgentIntent, CanvasDoc, ChangeRequest, DesignSpec, ServerMessage, ValidationIssue, VariantTarget, ViewMode } from "@flow/shared";
import { api, socket, type Bundle, type RunPayload } from "./api";

export type Selection = { kind: "node"; id: string } | { kind: "transition"; id: string } | { kind: "edge"; id: string } | null;
export type AgentItem = {
  id: string;
  kind: "user" | "assistant" | "plan" | "tool" | "file" | "error" | "done" | "status";
  text: string;
  ok?: boolean;
  issues?: ValidationIssue[];
  toolUseId?: string;
  name?: string;
  path?: string;
  costUsd?: number;
  durationMs?: number;
};
export type FrameState = { screenId: string; stateId: string | null };
export type Picked = { screenId: string; elementId: string; label: string; rect?: { x: number; y: number; width: number; height: number } };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ChangeInput = DistributiveOmit<ChangeRequest, "id" | "createdAt">;

export interface FlowState {
  projectId: string | null;
  bundle: Bundle | null;
  loading: boolean;
  error: string | null;
  view: ViewMode;
  selection: Selection;
  pendingChanges: ChangeRequest[];
  agent: { running: boolean; runId: string | null; intent: AgentIntent | null; items: AgentItem[]; streaming: string; status: string; totalCost: number };
  frames: Record<string, FrameState>;
  picker: { enabled: boolean; picked: Picked | null };
  highlight: { screenId: string; elementId: string } | null;
  /** Live in-place preview of a variant option inside the matching prototype frame. */
  preview: { screenId?: string; elementId?: string; html?: string; css?: string } | null;
  setPreview(p: FlowState["preview"]): void;
  walk: { active: boolean; screenId: string | null; stateId: string | null; lastTransitionId: string | null };
  showInfluences: boolean;
  toast: string | null;
  previewVersion: string | null;
  composerDraft: string;
  /** The single right panel. null hides it. */
  panel: "preview" | "inspect" | "claude" | "history" | null;
  setPanel(p: FlowState["panel"]): void;
  showMinimap: boolean;
  setShowMinimap(v: boolean): void;
  /** Flow view: edge-case cards and their dashed lines. */
  showEdgeCases: boolean;
  setShowEdgeCases(v: boolean): void;
  /** Hand tool: dragging anywhere pans the board. */
  hand: boolean;
  setHand(v: boolean): void;
  /** When the project was last written, for the status in the top bar. null before the first save this session. */
  savedAt: number | null;
  saving: boolean;

  openProject(id: string): Promise<void>;
  closeProject(): void;
  refresh(): Promise<void>;
  setView(v: ViewMode): void;
  select(sel: Selection): void;
  updateCanvas(fn: (c: CanvasDoc) => CanvasDoc, persist?: boolean): void;
  /** Writes any pending canvas change now. Call before a run that depends on nodes just added. */
  saveCanvasNow(): Promise<void>;
  saveSpec(fn: (s: DesignSpec) => DesignSpec, summary: string): Promise<void>;
  addChange(cr: ChangeInput): void;
  removeChange(id: string): void;
  clearChanges(): void;
  run(intent: AgentIntent, payload: RunPayload, userText?: string): void;
  cancel(): void;
  setFrame(screenId: string, fs: FrameState): void;
  setPicker(enabled: boolean): void;
  setPicked(p: Picked | null): void;
  editPicked(text: string): void;
  setHighlight(h: { screenId: string; elementId: string } | null): void;
  setWalk(w: Partial<FlowState["walk"]>): void;
  setShowInfluences(v: boolean): void;
  restoreVersion(sha: string): Promise<void>;
  pinVersion(sha: string, pinned: boolean, label?: string): Promise<void>;
  setPreviewVersion(sha: string | null): void;
  showToast(msg: string): void;
  setComposerDraft(t: string): void;
}

function readPref(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(`flow:${key}`); return v == null ? fallback : v === "1"; } catch { return fallback; }
}
function writePref(key: string, v: boolean) { try { localStorage.setItem(`flow:${key}`, v ? "1" : "0"); } catch { /* ignore */ } }
function readStr(key: string, fallback: string): string { try { return localStorage.getItem(`flow:${key}`) ?? fallback; } catch { return fallback; } }
function writeStr(key: string, v: string) { try { localStorage.setItem(`flow:${key}`, v); } catch { /* ignore */ } }

let saveTimer: number | null = null;
let pendingCanvas: CanvasDoc | null = null;
function flushCanvas(projectId: string) {
  if (!pendingCanvas) return;
  const c = pendingCanvas;
  pendingCanvas = null;
  useFlow.setState({ saving: true });
  api.saveCanvas(projectId, c).then(() => useFlow.setState({ saving: false, savedAt: Date.now() })).catch((e) => { useFlow.setState({ saving: false }); useFlow.getState().showToast(`Could not save canvas: ${e.message}`); });
}

export const useFlow = create<FlowState>((set, get) => ({
  projectId: null,
  bundle: null,
  loading: false,
  error: null,
  view: "prototype",
  selection: null,
  pendingChanges: [],
  agent: { running: false, runId: null, intent: null, items: [], streaming: "", status: "", totalCost: 0 },
  frames: {},
  picker: { enabled: false, picked: null },
  highlight: null,
  preview: null,
  setPreview(preview) { set({ preview }); },
  walk: { active: false, screenId: null, stateId: null, lastTransitionId: null },
  showInfluences: false,
  toast: null,
  previewVersion: null,
  composerDraft: "",
  // Closed by default: the canvas is the primary surface. Selecting something opens Inspect; the CTA opens Claude.
  panel: (readStr("panel", "") || null) as FlowState["panel"],
  setPanel(panel) { set({ panel }); writeStr("panel", panel ?? ""); },
  showMinimap: readPref("showMinimap", true),
  setShowMinimap(v) { set({ showMinimap: v }); writePref("showMinimap", v); },
  showEdgeCases: readPref("showEdgeCases", true),
  setShowEdgeCases(v) { set({ showEdgeCases: v }); writePref("showEdgeCases", v); },
  hand: false,
  setHand(hand) { set({ hand }); if (hand) set({ picker: { enabled: false, picked: get().picker.picked } }); },
  savedAt: null,
  saving: false,

  async openProject(id) {
    set({ loading: true, error: null, projectId: id, selection: null, pendingChanges: [], frames: {}, agent: { running: false, runId: null, intent: null, items: [], streaming: "", status: "", totalCost: 0 } });
    try {
      const bundle = await api.getProject(id);
      const agent = { ...get().agent, running: bundle.running };
      if (bundle.running && agent.items.length === 0) agent.items = [{ id: nanoid(6), kind: "status", text: "A run is already in progress for this project. Live events appear here as they arrive." }];
      set({ bundle, loading: false, view: bundle.canvas.view, agent });
      socket.subscribe(id);
      history.replaceState(null, "", `#${id}`);
    } catch (e) {
      set({ loading: false, error: (e as Error).message, projectId: null });
    }
  },
  closeProject() {
    const id = get().projectId;
    if (id) flushCanvas(id);
    set({ projectId: null, bundle: null, selection: null, pendingChanges: [], savedAt: null, saving: false });
    history.replaceState(null, "", "#");
  },
  async refresh() {
    const id = get().projectId;
    if (!id) return;
    flushCanvas(id);
    try {
      const bundle = await api.getProject(id);
      set({ bundle, agent: { ...get().agent, running: bundle.running } });
    } catch (e) { get().showToast((e as Error).message); }
  },
  setView(view) {
    set({ view });
    get().updateCanvas((c) => ({ ...c, view }));
  },
  select(selection) {
    const cur = get().selection;
    if (cur === selection || (cur && selection && cur.kind === selection.kind && cur.id === selection.id)) return;
    set({ selection });
    if (!selection || get().panel === "claude") return;
    const previewable = selection.kind === "node" && (selection.id.startsWith("screen:") || selection.id.startsWith("edgecase:"));
    if (get().view === "flow" && previewable) get().setPanel("preview");
    else if (get().panel !== "preview" || !previewable) get().setPanel("inspect");
  },
  updateCanvas(fn, persist = true) {
    const { bundle, projectId } = get();
    if (!bundle || !projectId) return;
    const canvas = fn(bundle.canvas);
    set({ bundle: { ...bundle, canvas } });
    if (!persist) return;
    pendingCanvas = canvas;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => flushCanvas(projectId), 400);
  },
  async saveCanvasNow() {
    const { projectId } = get();
    if (!projectId || !pendingCanvas) return;
    if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null; }
    const c = pendingCanvas;
    pendingCanvas = null;
    set({ saving: true });
    try { await api.saveCanvas(projectId, c); set({ saving: false, savedAt: Date.now() }); } catch (e) { set({ saving: false }); get().showToast(`Could not save canvas: ${(e as Error).message}`); }
  },
  async saveSpec(fn, summary) {
    const { bundle, projectId } = get();
    if (!bundle || !projectId) return;
    const spec = fn(bundle.spec);
    set({ bundle: { ...bundle, spec }, saving: true });
    try { await api.saveSpec(projectId, spec, summary); set({ saving: false, savedAt: Date.now() }); await get().refresh(); }
    catch (e) { set({ saving: false }); get().showToast(`Could not save: ${(e as Error).message}`); }
  },
  addChange(cr) {
    const full = { ...cr, id: nanoid(8), createdAt: new Date().toISOString() } as ChangeRequest;
    set({ pendingChanges: [...get().pendingChanges, full] });
    get().showToast("Change queued. Apply changes from the Claude panel when ready.");
  },
  removeChange(id) { set({ pendingChanges: get().pendingChanges.filter((c) => c.id !== id) }); },
  clearChanges() { set({ pendingChanges: [] }); },
  run(intent, payload, userText) {
    const { projectId, agent } = get();
    if (!projectId || agent.running) return;
    const items = [...agent.items];
    if (userText) items.push({ id: nanoid(6), kind: "user", text: userText });
    set({ agent: { ...agent, running: true, intent, items, streaming: "", status: "starting" } });
    socket.send({ type: "agent:run", projectId, intent, payload });
  },
  cancel() {
    const { projectId } = get();
    if (projectId) socket.send({ type: "agent:cancel", projectId });
  },
  setFrame(screenId, fs) { set({ frames: { ...get().frames, [screenId]: fs } }); },
  setPicker(enabled) { set({ picker: { enabled, picked: enabled ? get().picker.picked : null } }); if (enabled) set({ hand: false }); },
  setPicked(picked) {
    set({ picker: { ...get().picker, picked } });
    if (picked) { set({ selection: { kind: "node", id: `screen:${picked.screenId}` } }); }
  },
  /** Send an instruction about the picked element (or screen) to Claude. Only that screen may change. */
  editPicked(text) {
    const { picker, bundle } = get();
    const p = picker.picked;
    if (!p || !text.trim() || !bundle) return;
    const screen = bundle.spec.screens.find((s) => s.id === p.screenId);
    get().run("chat", { text: text.trim(), target: { screenId: p.screenId, elementId: p.elementId } }, `${screen?.name ?? p.screenId} · ${p.elementId}: ${text.trim()}`);
    set({ picker: { enabled: false, picked: p } });
    get().setPanel("claude");
  },
  setHighlight(highlight) { set({ highlight }); },
  setWalk(w) { set({ walk: { ...get().walk, ...w } }); },
  setShowInfluences(showInfluences) { set({ showInfluences }); },
  async restoreVersion(sha) {
    const id = get().projectId;
    if (!id) return;
    try { await api.restore(id, sha); set({ previewVersion: null }); get().showToast("Restored as a new version."); await get().refresh(); }
    catch (e) { get().showToast(`Restore failed: ${(e as Error).message}`); }
  },
  async pinVersion(sha, pinned, label) {
    const id = get().projectId;
    if (!id) return;
    try { await api.pin(id, sha, pinned, label); await get().refresh(); } catch (e) { get().showToast((e as Error).message); }
  },
  setPreviewVersion(previewVersion) { set({ previewVersion }); },
  showToast(toast) {
    set({ toast });
    window.setTimeout(() => { if (get().toast === toast) set({ toast: null }); }, 3200);
  },
  setComposerDraft(composerDraft) { set({ composerDraft }); }
}));

/** Websocket → store. Installed once. */
function handleServerMessage(m: ServerMessage) {
  const s = useFlow.getState();
  const a = s.agent;
  const push = (item: Omit<AgentItem, "id">) => useFlow.setState({ agent: { ...useFlow.getState().agent, items: [...useFlow.getState().agent.items, { id: nanoid(6), ...item }] } });
  switch (m.type) {
    case "agent:started":
      useFlow.setState({ agent: { ...a, running: true, runId: m.runId, intent: m.intent, streaming: "", status: "running" } });
      push({ kind: "plan", text: m.plan });
      if (useFlow.getState().panel !== "claude") useFlow.getState().setPanel("claude");
      break;
    case "agent:session":
      useFlow.setState({ agent: { ...useFlow.getState().agent, status: `running · ${m.model}` } });
      break;
    case "agent:text":
      useFlow.setState({ agent: { ...useFlow.getState().agent, streaming: useFlow.getState().agent.streaming + m.delta } });
      break;
    case "agent:thinking":
      break;
    case "agent:message":
      useFlow.setState({ agent: { ...useFlow.getState().agent, streaming: "" } });
      push({ kind: "assistant", text: m.text });
      break;
    case "agent:tool":
      push({ kind: "tool", text: m.summary, toolUseId: m.toolUseId, name: m.name, path: m.path });
      break;
    case "agent:tool-result": {
      const items = useFlow.getState().agent.items.map((it) => (it.toolUseId === m.toolUseId && it.kind === "tool" ? { ...it, ok: m.ok } : it));
      useFlow.setState({ agent: { ...useFlow.getState().agent, items } });
      break;
    }
    case "agent:file":
      break;
    case "agent:status":
      useFlow.setState({ agent: { ...useFlow.getState().agent, status: m.status } });
      break;
    case "agent:done": {
      const cur = useFlow.getState().agent;
      useFlow.setState({ agent: { ...cur, running: false, runId: null, streaming: "", status: "", totalCost: cur.totalCost + m.costUsd } });
      push({ kind: "done", text: m.ok ? `Done in ${(m.durationMs / 1000).toFixed(0)}s, ${m.numTurns} turns, $${m.costUsd.toFixed(3)}.` : `Finished with problems after ${(m.durationMs / 1000).toFixed(0)}s, $${m.costUsd.toFixed(3)}.`, ok: m.ok, issues: m.issues, costUsd: m.costUsd, durationMs: m.durationMs });
      if (cur.intent === "regenerate") useFlow.setState({ pendingChanges: [] });
      if (m.ok) useFlow.setState({ savedAt: Date.now() });
      break;
    }
    case "agent:error": {
      const cur = useFlow.getState().agent;
      useFlow.setState({ agent: { ...cur, running: false, runId: null, streaming: "", status: "" } });
      push({ kind: "error", text: m.message });
      break;
    }
    case "project:updated":
      useFlow.setState({ savedAt: Date.now() });
      void useFlow.getState().refresh();
      break;
    case "agent:replay": {
      // A reload or reconnect mid-run: rebuild the panel from the server's copy of the run so far.
      const cur = useFlow.getState().agent;
      if (cur.items.some((it) => it.kind === "plan" || it.kind === "done")) break;
      useFlow.setState({ agent: { ...cur, items: cur.items.filter((it) => it.kind === "user") } });
      for (const ev of m.events as ServerMessage[]) handleServerMessage(ev);
      break;
    }
  }
}
socket.on(handleServerMessage);
socket.connect();

/** Selectors */
export const useSpec = () => useFlow((s) => s.bundle?.spec ?? null);
export const useCanvas = () => useFlow((s) => s.bundle?.canvas ?? null);
export const useHeadVersion = () => useFlow((s) => s.bundle?.versions[0]?.id ?? "none");
