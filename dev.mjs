/**
 * Starts the FLOW API server and the web dev server together.
 * Resolves binaries itself so it works from any launcher, even one without node on PATH.
 *   PORT       web dev server port (default 5180)
 *   FLOW_PORT  API server port (default 5191)
 *   FLOW_WATCH set to 1 to restart the API server on source changes (off by default; restarts kill running generations)
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const nodeDir = path.dirname(process.execPath);
const env = { ...process.env, PATH: `${nodeDir}:${process.env.PATH ?? ""}`, FORCE_COLOR: "1" };
const webPort = process.env.PORT || "5180";
const apiPort = process.env.FLOW_PORT || "5191";

const serverDir = path.join(root, "packages/server");
const webDir = path.join(root, "packages/web");
/** Path to a dependency's CLI entry, read from its package.json "bin" field. */
function binOf(fromDir, pkg, name = pkg) {
  const req = createRequire(path.join(fromDir, "package.json"));
  const pkgJsonPath = req.resolve(`${pkg}/package.json`);
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const bin = typeof pkgJson.bin === "string" ? pkgJson.bin : pkgJson.bin[name];
  return path.join(path.dirname(pkgJsonPath), bin);
}
const tsx = binOf(serverDir, "tsx");
const vite = binOf(webDir, "vite");

// The API server does not auto-restart on edits by default: a restart kills any Claude run in flight. Set FLOW_WATCH=1 to opt in.
const defs = {
  server: () => spawn(process.execPath, process.env.FLOW_WATCH ? [tsx, "watch", "--clear-screen=false", "src/index.ts"] : [tsx, "src/index.ts"], { cwd: serverDir, env: { ...env, FLOW_PORT: apiPort }, stdio: "inherit" }),
  web: () => spawn(process.execPath, [vite], { cwd: webDir, env: { ...env, PORT: webPort, FLOW_PORT: apiPort }, stdio: "inherit" })
};
const procs = {};
let stopping = false;
const stop = (code = 0) => { stopping = true; for (const p of Object.values(procs)) p.kill("SIGTERM"); process.exit(code); };
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

// A child that dies this fast never finished starting, so respawning it just repeats the same failure.
const STARTUP_MS = 4000;
const MAX_FAILURES = 3;
const failures = {};
function start(name) {
  const startedAt = Date.now();
  const p = defs[name]();
  procs[name] = p;
  // If one side dies (or is killed to pick up new code), bring it back instead of taking the other down.
  p.on("exit", (code, signal) => {
    if (stopping) return;
    failures[name] = Date.now() - startedAt < STARTUP_MS ? (failures[name] ?? 0) + 1 : 0;
    if (failures[name] >= MAX_FAILURES) {
      console.error(`[dev] ${name} failed to start ${MAX_FAILURES} times in a row. Stopping so the error above stays readable.`);
      stop(1);
      return;
    }
    console.error(`[dev] ${name} exited (${signal ?? code}); restarting in 1s`);
    setTimeout(() => start(name), 1000);
  });
}

/** Resolves true when something already listens on the port. Both children exit instantly in that case. */
function portInUse(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", (e) => resolve(e.code === "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => resolve(false)));
    probe.listen(Number(port), "127.0.0.1");
  });
}

// Checked up front: without this the only symptom is both children restarting forever, which reads as a bug in the app.
const taken = [];
for (const [port, what] of [[webPort, "web dev server, set with PORT"], [apiPort, "API server, set with FLOW_PORT"]]) {
  if (await portInUse(port)) taken.push(`  ${port} — needed by the ${what}`);
}
if (taken.length) {
  console.error(
    `[dev] These ports are already in use:\n${taken.join("\n")}\n` +
    `[dev] Another "pnpm dev" is probably still running. Find it with:  lsof -ti tcp:${webPort},${apiPort}\n` +
    `[dev] Stop it with:  kill $(lsof -ti tcp:${webPort},${apiPort})\n` +
    `[dev] Or run alongside it on free ports:  PORT=5280 FLOW_PORT=5291 pnpm dev`
  );
  process.exit(1);
}

start("server");
start("web");
console.log(`[dev] web http://localhost:${webPort}  api http://localhost:${apiPort}`);
