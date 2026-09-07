import { CheckRepoActions, simpleGit, type SimpleGit } from "simple-git";
import { decodeVersionMessage, encodeVersionMessage, type Version, type VersionKind } from "@flow/shared";

function git(dir: string): SimpleGit {
  return simpleGit({ baseDir: dir, config: ["user.name=FLOW", "user.email=flow@local", "commit.gpgsign=false"] });
}

/**
 * Each project is its own repository. The check must be for the repo *root*: the default "tree" check also passes when the
 * project folder merely sits inside another repository (projects/ under a cloned Flow Vibing checkout, say), and every
 * version would then be committed to that outer repository instead.
 */
export async function initRepo(dir: string): Promise<void> {
  const g = git(dir);
  if (!(await g.checkIsRepo(CheckRepoActions.IS_REPO_ROOT))) await g.init();
}

export async function commitVersion(dir: string, v: { kind: VersionKind; summary: string; screens: string[]; pinned: boolean; label?: string }): Promise<Version | null> {
  const g = git(dir);
  await g.add("-A");
  const status = await g.status();
  if (status.staged.length === 0 && status.created.length === 0 && status.deleted.length === 0 && status.modified.length === 0 && status.renamed.length === 0) {
    // nothing to commit
    const log = await g.log({ maxCount: 1 }).catch(() => null);
    if (!log || log.total === 0) {
      // allow an empty initial commit so the timeline always has a root
      const r = await g.commit(encodeVersionMessage(v), undefined, { "--allow-empty": null });
      return { id: r.commit, kind: v.kind, summary: v.summary, createdAt: new Date().toISOString(), screens: v.screens, pinned: v.pinned, label: v.label };
    }
    return null;
  }
  const r = await g.commit(encodeVersionMessage(v));
  return { id: r.commit, kind: v.kind, summary: v.summary, createdAt: new Date().toISOString(), screens: v.screens, pinned: v.pinned, label: v.label };
}

export async function listVersions(dir: string): Promise<Version[]> {
  const g = git(dir);
  if (!(await g.checkIsRepo(CheckRepoActions.IS_REPO_ROOT))) return [];
  const raw = await g.raw(["log", "--format=%H%x1f%aI%x1f%B%x1e"]).catch(() => "");
  const out: Version[] = [];
  for (const chunk of raw.split("\x1e")) {
    const [sha, date, body] = chunk.replace(/^\n+/, "").split("\x1f");
    if (!sha || !date) continue;
    const meta = decodeVersionMessage((body ?? "").trim());
    out.push({ id: sha, kind: meta.kind, summary: meta.summary, createdAt: date, screens: meta.screens, pinned: meta.pinned, label: meta.label });
  }
  return out;
}

/** The oldest commit whose apply-message names this panel (panel ids are unique), or null. */
export async function firstApplyCommit(dir: string, panelId: string, fallbackText?: string): Promise<string | null> {
  const find = async (needle: string) => {
    const raw = await git(dir).raw(["log", "--reverse", "--format=%H%x1f%s", "--fixed-strings", "--grep", needle]).catch(() => "");
    const line = raw.split("\n").find(Boolean);
    return line ? line.split("\x1f")[0] : null;
  };
  return (await find(`panel ${panelId}`)) ?? (fallbackText ? await find(fallbackText) : null);
}

export async function fileAtVersion(dir: string, sha: string, rel: string): Promise<string | null> {
  if (!/^[0-9a-f]{7,40}(~\d+)?$/.test(sha)) throw new Error("bad version id");
  try { return await git(dir).show([`${sha}:${rel}`]); } catch { return null; }
}

export async function changedSince(dir: string, sha: string): Promise<string[]> {
  const raw = await git(dir).raw(["diff", "--name-only", sha, "HEAD"]).catch(() => "");
  return raw.split("\n").filter(Boolean);
}

/** Restores every tracked file to the given version and records that as a new version. */
export async function restoreVersion(dir: string, sha: string, summary: string): Promise<Version | null> {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error("bad version id");
  const g = git(dir);
  await g.raw(["checkout", sha, "--", "."]);
  // Files that exist now but not in the target version must go too.
  const nowFiles = (await g.raw(["ls-files"])).split("\n").filter(Boolean);
  const thenFiles = new Set((await g.raw(["ls-tree", "-r", "--name-only", sha])).split("\n").filter(Boolean));
  for (const f of nowFiles) if (!thenFiles.has(f)) await g.rm([f]).catch(() => {});
  return commitVersion(dir, { kind: "restore", summary, screens: [], pinned: false });
}

/** Throws away uncommitted work. Used when a run is cancelled mid-write. */
/** Throws away uncommitted generated files. Used when a run is cancelled mid-write. */
export async function discardWorkingChanges(dir: string): Promise<void> {
  await discardGeneratedChanges(dir);
}

/** Drops uncommitted changes to generated files (not canvas.json or .flow/), e.g. after a run was killed mid-write. */
export async function discardGeneratedChanges(dir: string): Promise<string[]> {
  const g = git(dir);
  const s = await g.status();
  // Only what Claude writes. References, skills, and canvas edits are the designer's and are never swept.
  const generated = (p: string) => p.startsWith("screens/") || p.startsWith("variants/") || p === "tokens.css" || p === "flow.json";
  const dirty = [...s.modified, ...s.deleted, ...s.created, ...s.not_added].filter(generated);
  if (dirty.length === 0) return [];
  const tracked = dirty.filter((p) => !s.not_added.includes(p));
  const untracked = dirty.filter((p) => s.not_added.includes(p));
  if (tracked.length) await g.raw(["checkout", "--", ...tracked]).catch(() => {});
  if (untracked.length) await g.raw(["clean", "-f", "--", ...untracked]).catch(() => {});
  return dirty;
}

export async function workingChanges(dir: string): Promise<string[]> {
  const s = await git(dir).status();
  return [...s.created, ...s.modified, ...s.deleted, ...s.not_added, ...s.renamed.map((r) => r.to)];
}
