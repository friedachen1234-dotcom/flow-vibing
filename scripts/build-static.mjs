/**
 * Builds the hosted demo: the web app with no server behind it, plus the runtime shell and the examples as static
 * files. Output lands in packages/web/dist, which vercel.json points at.
 *
 *   pnpm build:static
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "packages", "web", "dist");

execSync("pnpm --filter @flow/web exec vite build", { cwd: root, stdio: "inherit", env: { ...process.env, VITE_STATIC: "1" } });

// The runtime shell, served by the API in development, ships beside the app here.
mkdirSync(path.join(dist, "runtime"), { recursive: true });
for (const f of ["shell.html", "shell.js", "screen-agent.js"]) cpSync(path.join(root, "packages", "runtime", f), path.join(dist, "runtime", f));

// Every example, whole, plus an index the home page reads instead of /api/examples.
const exDir = path.join(root, "examples");
const index = [];
for (const id of readdirSync(exDir).sort()) {
  const flow = path.join(exDir, id, "flow.json");
  if (!existsSync(flow)) continue;
  cpSync(path.join(exDir, id), path.join(dist, "examples", id), { recursive: true });
  const spec = JSON.parse(readFileSync(flow, "utf8"));
  index.push({ id, name: spec.name, brief: spec.brief, device: spec.device.kind, width: spec.device.width, height: spec.device.height, screenCount: spec.screens.length, firstScreen: spec.screens[0]?.id ?? null, secondScreen: spec.transitions.find((t) => t.from.screenId === spec.screens[0]?.id && t.to.screenId !== spec.screens[0]?.id)?.to.screenId ?? spec.screens[1]?.id ?? null });
}
index.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(path.join(dist, "examples", "index.json"), JSON.stringify(index, null, 2));
console.log(`static demo built: ${index.length} examples → ${path.relative(root, dist)}`);
