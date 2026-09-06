import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const PORT = Number(process.env.FLOW_PORT ?? 5191);
export const PROJECTS_ROOT = process.env.FLOW_PROJECTS ? path.resolve(process.env.FLOW_PROJECTS) : path.join(REPO_ROOT, "projects");
export const RUNTIME_DIR = path.join(REPO_ROOT, "packages", "runtime");
export const DEFAULT_MODEL = process.env.FLOW_MODEL ?? "claude-opus-5";
export const DEFAULT_EFFORT = (process.env.FLOW_EFFORT ?? "high") as "low" | "medium" | "high" | "xhigh" | "max";
