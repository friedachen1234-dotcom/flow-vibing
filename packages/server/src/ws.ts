import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { ClientMessage, type ServerMessage } from "@flow/shared";
import { cancelRun, startRun } from "./agent/run.js";

const rooms = new Map<string, Set<WebSocket>>();
/** Events of the current or most recent run, replayed to late subscribers so a reload never loses the log. */
const runLogs = new Map<string, ServerMessage[]>();
const MAX_LOG = 400;

export function broadcast(projectId: string, msg: ServerMessage) {
  if (msg.type === "agent:started") runLogs.set(projectId, [msg]);
  else if (msg.type !== "project:updated" && msg.type !== "agent:text" && msg.type !== "agent:thinking") {
    const log = runLogs.get(projectId) ?? [];
    log.push(msg);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    runLogs.set(projectId, log);
  }
  const room = rooms.get(projectId);
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const ws of room) { if (ws.readyState === ws.OPEN) ws.send(data); }
}

export function registerWs(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket) => {
    let projectId: string | null = null;
    const join = (id: string) => {
      if (projectId) rooms.get(projectId)?.delete(socket);
      projectId = id;
      if (!rooms.has(id)) rooms.set(id, new Set());
      rooms.get(id)!.add(socket);
    };
    socket.on("message", async (raw: Buffer | string) => {
      let parsed;
      try { parsed = ClientMessage.parse(JSON.parse(raw.toString())); }
      catch (e) { socket.send(JSON.stringify({ type: "agent:error", runId: "-", message: `bad message: ${(e as Error).message}` })); return; }
      if (parsed.type === "subscribe") {
        join(parsed.projectId);
        const log = runLogs.get(parsed.projectId);
        if (log?.length) socket.send(JSON.stringify({ type: "agent:replay", projectId: parsed.projectId, events: log }));
        return;
      }
      if (parsed.type === "agent:run") {
        join(parsed.projectId);
        try { await startRun(parsed.projectId, parsed.intent, parsed.payload, (m) => broadcast(parsed.projectId, m)); }
        catch (e) { socket.send(JSON.stringify({ type: "agent:error", runId: "-", message: (e as Error).message } satisfies ServerMessage)); }
        return;
      }
      if (parsed.type === "agent:cancel") { cancelRun(parsed.projectId); return; }
    });
    socket.on("close", () => { if (projectId) rooms.get(projectId)?.delete(socket); });
  });
}
