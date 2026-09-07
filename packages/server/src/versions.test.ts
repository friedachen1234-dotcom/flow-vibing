import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { commitVersion, initRepo, listVersions } from "./versions.js";

test("a project nested inside another repository gets its own repository", async () => {
  const outer = await fs.mkdtemp(path.join(os.tmpdir(), "flow-outer-"));
  try {
    await simpleGit({ baseDir: outer }).init();
    await fs.writeFile(path.join(outer, "outer.txt"), "outer\n");
    const project = path.join(outer, "projects", "demo");
    await fs.mkdir(project, { recursive: true });
    await initRepo(project);
    assert.ok(await fs.stat(path.join(project, ".git")).then(() => true, () => false), "project has its own .git");

    await fs.writeFile(path.join(project, "flow.json"), "{}\n");
    const v = await commitVersion(project, { kind: "init", summary: "Created", screens: [], pinned: false });
    assert.ok(v, "commit recorded");
    assert.equal((await listVersions(project)).length, 1);
    // The outer repository must be untouched: nothing staged, nothing committed.
    const outerStatus = await simpleGit({ baseDir: outer }).status();
    assert.deepEqual(outerStatus.staged, []);
    assert.equal((await simpleGit({ baseDir: outer }).log().catch(() => ({ total: 0 }))).total, 0);
  } finally {
    await fs.rm(outer, { recursive: true, force: true });
  }
});
