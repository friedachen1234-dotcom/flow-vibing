import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CanvasDoc, DesignSpec, DeviceKind, reconcileCanvas } from "@flow/shared";
import { createDemoProject, createProject, createProjectFromExample, exampleFilePath, listExamples, fileExists, listProjects, loadProject, projectDir, readCanvas, readPins, readProjectFile, readSpec, saveAsset, writeCanvas, writePins, writeSpec } from "./projects.js";
import { commitVersion, fileAtVersion, restoreVersion } from "./versions.js";
import { isRunning } from "./agent/run.js";
import { broadcast } from "./ws.js";
import { REPO_ROOT } from "./config.js";
import { extractElement, spliceElement } from "./html.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8"
};

export function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/projects", async () => listProjects());

  app.post("/api/projects", async (req) => {
    const body = z.object({ name: z.string().min(1), brief: z.string().default(""), deviceKind: DeviceKind.default("mobile") }).parse(req.body);
    return createProject(body);
  });

  app.post("/api/projects/demo", async () => createDemoProject());

  app.get("/api/examples", async () => listExamples());

  /** Example files served in place, so the home screen can run an example before it becomes a project. */
  app.get("/api/examples/:id/files/*", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rel = (req.params as { "*": string })["*"];
    try {
      const data = await fs.readFile(exampleFilePath(id, rel));
      reply.header("cache-control", "public, max-age=60");
      reply.type(MIME[path.extname(rel).toLowerCase()] ?? "application/octet-stream");
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
  });

  app.post("/api/projects/examples/:exampleId", async (req) => {
    const { exampleId } = req.params as { exampleId: string };
    return createProjectFromExample(exampleId);
  });

  app.get("/api/projects/:id", async (req) => {
    const { id } = req.params as { id: string };
    const bundle = await loadProject(id);
    return { ...bundle, running: isRunning(id) };
  });

  app.put("/api/projects/:id/canvas", async (req) => {
    const { id } = req.params as { id: string };
    const canvas = CanvasDoc.parse(req.body);
    const spec = await readSpec(id);
    await writeCanvas(id, reconcileCanvas(spec, canvas).canvas);
    return { ok: true };
  });

  app.put("/api/projects/:id/spec", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ spec: DesignSpec, summary: z.string().default("Edited the spec") }).parse(req.body);
    await writeSpec(id, body.spec);
    const canvas = await readCanvas(id);
    await writeCanvas(id, reconcileCanvas(body.spec, canvas).canvas);
    const v = await commitVersion(projectDir(id), { kind: "edit", summary: body.summary, screens: [], pinned: false });
    broadcast(id, { type: "project:updated", projectId: id, reason: "spec-edit" });
    return { ok: true, version: v };
  });

  /** Files as they were at a version, served path-style so relative links inside screens resolve to the same version. */
  app.get("/api/projects/:id/versions/:sha/files/*", async (req, reply) => {
    const { id, sha } = req.params as { id: string; sha: string };
    const rel = (req.params as { "*": string })["*"];
    const text = await fileAtVersion(projectDir(id), sha, rel);
    if (text == null) return reply.code(404).send({ error: "not in that version" });
    reply.header("cache-control", "no-store");
    reply.type(MIME[path.extname(rel)] ?? "text/plain");
    return text;
  });

  app.post("/api/projects/:id/versions/:sha/restore", async (req) => {
    const { id, sha } = req.params as { id: string; sha: string };
    const v = await restoreVersion(projectDir(id), sha, `Restored version ${sha.slice(0, 8)}`);
    broadcast(id, { type: "project:updated", projectId: id, reason: "restore" });
    return { ok: true, version: v };
  });

  app.post("/api/projects/:id/versions/:sha/pin", async (req) => {
    const { id, sha } = req.params as { id: string; sha: string };
    const body = z.object({ pinned: z.boolean(), label: z.string().optional() }).parse(req.body);
    const pins = await readPins(id);
    pins[sha] = { pinned: body.pinned, label: body.label };
    await writePins(id, pins);
    return { ok: true };
  });

  /** Assets arrive as JSON with base64 so the client stays simple. Images and markdown are small enough. */
  app.post("/api/projects/:id/assets", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ kind: z.enum(["inspirations", "skills"]), filename: z.string(), dataBase64: z.string().optional(), text: z.string().optional() }).parse(req.body);
    const data = body.dataBase64 ? Buffer.from(body.dataBase64, "base64") : Buffer.from(body.text ?? "", "utf8");
    const rel = await saveAsset(id, body.kind, body.filename, data);
    // Commit right away: an untracked upload would otherwise be swept by the pre-run cleanup.
    await commitVersion(projectDir(id), { kind: "import", summary: `Added ${body.kind === "skills" ? "skill" : "reference"} ${body.filename}`, screens: [], pinned: false });
    return { path: rel };
  });

  app.get("/api/projects/:id/files/*", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rel = (req.params as { "*": string })["*"];
    if (rel.startsWith(".flow") || rel.includes("/.git") || rel.startsWith(".git")) return reply.code(403).send({ error: "hidden" });
    try {
      const data = await readProjectFile(id, rel);
      reply.header("cache-control", "no-store");
      reply.type(MIME[path.extname(rel).toLowerCase()] ?? "application/octet-stream");
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
  });

  /** Applies a variant option: splices an element fragment, replaces a screen, or replaces tokens. */
  app.post("/api/projects/:id/variants/:panelId/apply", async (req) => {
    const { id, panelId } = req.params as { id: string; panelId: string };
    const { optionId } = z.object({ optionId: z.string() }).parse(req.body);
    const canvas = await readCanvas(id);
    const panel = canvas.nodes.find((n) => n.id === panelId);
    if (!panel || panel.type !== "variantPanel") throw Object.assign(new Error("no such variant panel"), { statusCode: 404 });
    const spec = await readSpec(id);
    const targetScreen = panel.target.screenId ? spec.screens.find((s) => s.id === panel.target.screenId) : undefined;
    // First apply: remember what was there, so the panel can always restore it.
    if (!panel.originalFile) {
      let original: string | null = null;
      let ext = "html";
      if (panel.target.token) { original = (await readProjectFile(id, "tokens.css")).toString("utf8"); ext = "css"; }
      else if (panel.target.elementId && targetScreen) original = extractElement((await readProjectFile(id, targetScreen.file)).toString("utf8"), panel.target.elementId);
      else if (targetScreen) original = (await readProjectFile(id, targetScreen.file)).toString("utf8");
      if (original != null) {
        const rel = `variants/${panelId}/original.${ext}`;
        await fs.mkdir(path.dirname(path.join(projectDir(id), rel)), { recursive: true });
        await fs.writeFile(path.join(projectDir(id), rel), original);
        panel.originalFile = rel;
      }
    }
    const isOriginal = optionId === "original";
    const opt = isOriginal ? (panel.originalFile ? { id: "original", label: "Original", rationale: "", file: panel.originalFile } : undefined) : panel.options.find((o) => o.id === optionId);
    if (!opt) throw Object.assign(new Error("no such option"), { statusCode: 404 });
    const fragment = (await readProjectFile(id, opt.file)).toString("utf8");
    let summary: string;
    if (panel.target.token || opt.file.endsWith(".css")) {
      await fs.writeFile(path.join(projectDir(id), "tokens.css"), fragment);
      summary = `Applied token variant "${opt.label}" (panel ${panelId})`;
    } else if (panel.target.elementId && panel.target.screenId) {
      const screen = spec.screens.find((s) => s.id === panel.target.screenId);
      if (!screen) throw new Error("screen gone");
      const html = (await readProjectFile(id, screen.file)).toString("utf8");
      const next = spliceElement(html, panel.target.elementId, fragment);
      if (!next) throw new Error(`could not find element "${panel.target.elementId}" in ${screen.file}`);
      await fs.writeFile(path.join(projectDir(id), screen.file), next);
      summary = `Applied variant "${opt.label}" to ${panel.target.elementId} on ${screen.name} (panel ${panelId})`;
    } else if (panel.target.screenId) {
      const screen = spec.screens.find((s) => s.id === panel.target.screenId);
      if (!screen) throw new Error("screen gone");
      await fs.writeFile(path.join(projectDir(id), screen.file), fragment);
      summary = `Applied screen variant "${opt.label}" to ${screen.name} (panel ${panelId})`;
    } else throw new Error("variant target is empty");
    panel.appliedId = isOriginal ? undefined : optionId;
    await writeCanvas(id, canvas);
    const v = await commitVersion(projectDir(id), { kind: "variant", summary, screens: panel.target.screenId ? [panel.target.screenId] : [], pinned: false });
    broadcast(id, { type: "project:updated", projectId: id, reason: "variant-apply" });
    return { ok: true, version: v };
  });

  /**
   * Exports a self-contained prototype folder: shell.html with the spec, every screen, tokens, and the screen agent inlined,
   * so it runs from a file URL with no server.
   */
  app.post("/api/projects/:id/export", async (req) => {
    const { id } = req.params as { id: string };
    const spec = await readSpec(id);
    const screens: Record<string, string> = {};
    for (const sc of spec.screens) {
      try { screens[sc.file] = (await readProjectFile(id, sc.file)).toString("utf8"); } catch { /* missing screen stays missing */ }
    }
    const tokens = await readProjectFile(id, "tokens.css").then((b) => b.toString("utf8")).catch(() => "");
    // Inline tokens.css so relative links keep working without a server.
    for (const [file, html] of Object.entries(screens)) {
      screens[file] = html.replace(/<link[^>]+href=["'](?:\.\.\/)?tokens\.css["'][^>]*>/i, `<style>${tokens}</style>`);
    }
    const runtimeDir = path.join(REPO_ROOT, "packages", "runtime");
    const agent = await fs.readFile(path.join(runtimeDir, "screen-agent.js"), "utf8");
    const shellJs = await fs.readFile(path.join(runtimeDir, "shell.js"), "utf8");
    const shellHtml = await fs.readFile(path.join(runtimeDir, "shell.html"), "utf8");
    const data = JSON.stringify({ spec, screens, agent }).replace(/<\/script/gi, "<\\/script");
    const out = shellHtml
      .replace('<script src="./shell.js"></script>', `<script>window.__FLOW__ = ${data};</script>\n<script>${shellJs.replace(/<\/script/gi, "<\\/script")}</script>`)
      .replace("<title>FLOW prototype</title>", `<title>${spec.name} prototype</title>`);
    const exportDir = path.join(projectDir(id), "export");
    await fs.mkdir(exportDir, { recursive: true });
    await fs.writeFile(path.join(exportDir, "index.html"), out);
    return { path: path.join(exportDir, "index.html"), screens: Object.keys(screens).length };
  });

  app.get("/api/projects/:id/exists", async (req) => {
    const { id } = req.params as { id: string };
    const { path: rel } = z.object({ path: z.string() }).parse(req.query);
    return { exists: await fileExists(id, rel) };
  });
}

