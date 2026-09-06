import { test } from "node:test";
import assert from "node:assert/strict";
import { demoSpec, emptyCanvas, type CanvasDoc } from "@flow/shared";
import { compileGenerate, compileRegenerate, contextBlocks } from "./compiler.js";

function canvasWithMagic(): CanvasDoc {
  const c = emptyCanvas();
  c.nodes.push({ id: "screen:menu", type: "screen", screenId: "menu", position: { x: 0, y: 0 } });
  c.nodes.push({ id: "insp-1", type: "inspiration", kind: "image", title: "Bakery app", path: "inspirations/bakery.png", caption: "love the warmth", description: "", position: { x: 0, y: 0 } });
  c.nodes.push({ id: "skill-1", type: "skill", title: "House style", path: "skills/house-style.md", position: { x: 0, y: 0 } });
  c.edges.push({ id: "m1", type: "magic", source: "insp-1", target: "screen:menu", relation: "match-style", note: "" });
  c.edges.push({ id: "m2", type: "magic", source: "skill-1", target: "screen:menu", relation: "apply-skill", note: "" });
  return c;
}

test("context blocks group references by target and name the relation", () => {
  const { text, sources } = contextBlocks({ spec: demoSpec(), canvas: canvasWithMagic() });
  assert.match(text, /Target: screen "Menu" \[menu\]/);
  assert.match(text, /Image reference "Bakery app" at inspirations\/bakery\.png/);
  assert.match(text, /Match style/);
  assert.match(text, /Skill "House style" at skills\/house-style\.md/);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map((s) => s.targetId), ["menu", "menu"]);
});

test("regenerate scopes rewrites and keeps the rest", () => {
  const spec = demoSpec();
  const r = compileRegenerate({ spec, canvas: emptyCanvas() }, [{ id: "c", createdAt: "now", op: "add-state", screenId: "menu", name: "Error", description: "" }]);
  assert.deepEqual(r.affectedScreens, ["menu"]);
  assert.deepEqual(r.keepFiles.sort(), ["screens/checkout.html", "screens/customise.html"]);
  assert.match(r.prompt, /KEEP untouched/);
  assert.match(r.systemPrompt, /data-flow-transition/);
});

test("generate includes the brief and the output contract", () => {
  const r = compileGenerate({ spec: demoSpec(), canvas: emptyCanvas() }, "A coffee app");
  assert.match(r.prompt, /BRIEF\nA coffee app/);
  assert.match(r.systemPrompt, /"screens"/);
  assert.equal(r.keepFiles.length, 0);
});
