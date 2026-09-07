import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { DesignSpec, lintSpec, tokensCss } from "@flow/shared";
import { EXAMPLES_DIR } from "./config.js";

/**
 * Every example in examples/ must be a valid, self-consistent project that obeys the screen contract,
 * so that loading one from the home screen always produces a working prototype.
 */
async function examples(): Promise<string[]> {
  const entries = await fs.readdir(EXAMPLES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

test("examples folder has at least one example", async () => {
  assert.ok((await examples()).length > 0);
});

for (const id of await examples()) {
  test(`example "${id}" follows the contract`, async () => {
    const dir = path.join(EXAMPLES_DIR, id);
    const spec = DesignSpec.parse(JSON.parse(await fs.readFile(path.join(dir, "flow.json"), "utf8")));
    assert.equal(spec.id, id, "spec id matches folder name");
    const errors = lintSpec(spec).filter((i) => i.level === "error");
    assert.deepEqual(errors, [], "spec lint errors");
    assert.ok(spec.screens.length > 0, "has screens");
    assert.ok(spec.edgeCases.length > 0, "has edge cases");
    assert.equal(await fs.readFile(path.join(dir, "tokens.css"), "utf8"), tokensCss(spec), "tokens.css is generated from the spec tokens");

    const problems: string[] = [];
    for (const s of spec.screens) {
      let html: string;
      try { html = await fs.readFile(path.join(dir, s.file), "utf8"); }
      catch { problems.push(`${s.id}: file ${s.file} missing`); continue; }
      if (!new RegExp(`<html[^>]*data-flow-screen=["']${escapeRe(s.id)}["']`).test(html)) problems.push(`${s.id}: <html> lacks data-flow-screen="${s.id}"`);
      if (!/<link[^>]+href=["']\.\.\/tokens\.css["']/.test(html)) problems.push(`${s.id}: does not link ../tokens.css`);
      if (/https?:\/\//i.test(html)) problems.push(`${s.id}: references an external URL`);
      if (/<a\s[^>]*href=/i.test(html)) problems.push(`${s.id}: uses <a href>; screens must navigate with data-flow-transition`);
      if (/<script/i.test(html)) problems.push(`${s.id}: contains a <script>; screens are static`);
      for (const el of s.elements) {
        const n = html.match(new RegExp(`data-flow-el=["']${escapeRe(el.id)}["']`, "g"))?.length ?? 0;
        if (n === 0) problems.push(`${s.id}: element "${el.id}" not in ${s.file}`);
        if (n > 1) problems.push(`${s.id}: element "${el.id}" appears ${n} times; ids must be unique`);
      }
      for (const m of html.matchAll(/data-flow-el=["']([^"']+)["']/g)) {
        if (!s.elements.some((e) => e.id === m[1])) problems.push(`${s.id}: markup has data-flow-el="${m[1]}" that the spec does not declare`);
      }
      for (const t of spec.transitions.filter((t) => t.from.screenId === s.id)) {
        if (!new RegExp(`data-flow-transition=["'](?:[^"']*\\s)?${escapeRe(t.id)}(?:\\s[^"']*)?["']`).test(html)) problems.push(`${s.id}: transition "${t.id}" has no data-flow-transition`);
      }
      for (const m of html.matchAll(/data-flow-transition=["']([^"']+)["']/g)) {
        for (const tid of m[1].split(/\s+/).filter(Boolean)) {
          const t = spec.transitions.find((x) => x.id === tid);
          if (!t) problems.push(`${s.id}: markup uses unknown transition "${tid}"`);
          else if (t.from.screenId !== s.id) problems.push(`${s.id}: transition "${tid}" belongs to screen "${t.from.screenId}"`);
        }
      }
      for (const st of s.states.filter((x) => !x.isDefault)) {
        if (!new RegExp(`html\\[data-flow-state=["']${escapeRe(st.id)}["']\\]`).test(html)) problems.push(`${s.id}: state "${st.id}" has no html[data-flow-state] styling`);
      }
    }
    assert.deepEqual(problems, []);
  });
}
