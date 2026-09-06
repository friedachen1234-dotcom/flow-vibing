import type { CanvasDoc, ChangeRequest, ClientMessage, DesignSpec, DeviceKind, ProjectBundle, ProjectMeta, ServerMessage, VariantTarget, Version } from "@flow/shared";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
const json = (body: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export type Bundle = ProjectBundle & { running: boolean };

export const api = {
  listProjects: () => fetch("/api/projects").then((r) => j<ProjectMeta[]>(r)),
  createProject: (name: string, brief: string, deviceKind: DeviceKind) => fetch("/api/projects", json({ name, brief, deviceKind })).then((r) => j<ProjectBundle>(r)),
  createDemo: () => fetch("/api/projects/demo", { method: "POST" }).then((r) => j<ProjectBundle>(r)),
  getProject: (id: string) => fetch(`/api/projects/${id}`).then((r) => j<Bundle>(r)),
  saveCanvas: (id: string, canvas: CanvasDoc) => fetch(`/api/projects/${id}/canvas`, json(canvas, "PUT")).then((r) => j<{ ok: true }>(r)),
  saveSpec: (id: string, spec: DesignSpec, summary: string) => fetch(`/api/projects/${id}/spec`, json({ spec, summary }, "PUT")).then((r) => j<{ ok: true; version: Version | null }>(r)),
  restore: (id: string, sha: string) => fetch(`/api/projects/${id}/versions/${sha}/restore`, { method: "POST" }).then((r) => j<{ ok: true }>(r)),
  pin: (id: string, sha: string, pinned: boolean, label?: string) => fetch(`/api/projects/${id}/versions/${sha}/pin`, json({ pinned, label })).then((r) => j<{ ok: true }>(r)),
  uploadAsset: (id: string, kind: "inspirations" | "skills", filename: string, opts: { dataBase64?: string; text?: string }) =>
    fetch(`/api/projects/${id}/assets`, json({ kind, filename, ...opts })).then((r) => j<{ path: string }>(r)),
  applyVariant: (id: string, panelId: string, optionId: string) => fetch(`/api/projects/${id}/variants/${panelId}/apply`, json({ optionId })).then((r) => j<{ ok: true }>(r)),
  fileUrl: (id: string, rel: string) => `/api/projects/${id}/files/${rel}`,
  versionFileUrl: (id: string, sha: string, rel: string) => `/api/projects/${id}/versions/${sha}/files/${rel}`,
  shellUrl: (id: string, screenId: string, opts: { version?: string; follow?: boolean; state?: string } = {}) => {
    const p = new URLSearchParams({ project: id, screen: screenId });
    if (opts.version) p.set("version", opts.version);
    if (opts.follow === false) p.set("follow", "0");
    if (opts.state) p.set("state", opts.state);
    return `/runtime/shell.html?${p.toString()}`;
  }
};

export type RunPayload = { brief?: string; text?: string; changeRequests?: ChangeRequest[]; target?: VariantTarget; count?: number; direction?: string; nodeId?: string; inspirationIds?: string[] };

/** One websocket for the session. Reconnects on drop and re-subscribes. */
export class Socket {
  private ws: WebSocket | null = null;
  private projectId: string | null = null;
  private listeners = new Set<(m: ServerMessage) => void>();
  private retry = 0;
  private queue: ClientMessage[] = [];

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      if (this.projectId) ws.send(JSON.stringify({ type: "subscribe", projectId: this.projectId } satisfies ClientMessage));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (ev) => {
      try { const m = JSON.parse(ev.data) as ServerMessage; for (const l of this.listeners) l(m); } catch { /* ignore */ }
    };
    ws.onclose = () => { this.ws = null; setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.retry++)); };
  }
  subscribe(projectId: string) {
    this.projectId = projectId;
    this.send({ type: "subscribe", projectId });
  }
  send(m: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); else this.queue.push(m);
  }
  on(l: (m: ServerMessage) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
}
export const socket = new Socket();
