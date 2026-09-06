import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import fs from "node:fs/promises";
import { PORT, PROJECTS_ROOT, RUNTIME_DIR } from "./config.js";
import { registerRoutes } from "./routes.js";
import { registerWs } from "./ws.js";

async function main() {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const app = Fastify({ logger: { level: process.env.FLOW_LOG ?? "warn" }, bodyLimit: 60 * 1024 * 1024 });
  await app.register(cors, { origin: true });
  await app.register(websocket);
  await app.register(fastifyStatic, { root: RUNTIME_DIR, prefix: "/runtime/", decorateReply: false, cacheControl: true, maxAge: 0 });
  registerRoutes(app);
  registerWs(app);
  app.setErrorHandler((error, _req, reply) => {
    const err = error as Error & { statusCode?: number };
    const code = err.statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    reply.code(code).send({ error: err.message });
  });
  await app.listen({ port: PORT, host: "127.0.0.1" });
  console.log(`FLOW server on http://127.0.0.1:${PORT}  projects: ${PROJECTS_ROOT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
