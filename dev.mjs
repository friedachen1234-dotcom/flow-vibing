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
function start(name) {
  const p = defs[name]();
  procs[name] = p;
  // If one side dies (or is killed to pick up new code), bring it back instead of taking the other down.
  p.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`[dev] ${name} exited (${signal ?? code}); restarting in 1s`);
    setTimeout(() => start(name), 1000);
  });
}
const stop = () => { stopping = true; for (const p of Object.values(procs)) p.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
start("server");
start("web");
console.log(`[dev] web http://localhost:${webPort}  api http://localhost:${apiPort}`);
