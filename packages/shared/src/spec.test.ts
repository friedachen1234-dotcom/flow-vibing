import { test } from "node:test";
import assert from "node:assert/strict";
import { DesignSpec, lintSpec } from "./spec.js";
import { demoSpec } from "./fixtures.js";
import { affectedScreens, describeChange } from "./changes.js";
import { decodeVersionMessage, encodeVersionMessage } from "./versions.js";
import { CanvasDoc, emptyCanvas } from "./canvas.js";

test("demo spec parses and lints clean", () => {
  const spec = DesignSpec.parse(demoSpec());
  const errors = lintSpec(spec).filter((i) => i.level === "error");
  assert.deepEqual(errors, []);
});

test("lint catches a dangling transition", () => {
  const spec = demoSpec();
  spec.transitions.push({ id: "bad", from: { screenId: "menu" }, to: { screenId: "nowhere" }, trigger: "x", animation: "push" });
  const errors = lintSpec(spec).filter((i) => i.level === "error");
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unknown screen "nowhere"/);
});

test("affectedScreens scopes regeneration", () => {
  const spec = demoSpec();
  const now = new Date().toISOString();
  assert.deepEqual(affectedScreens({ id: "1", createdAt: now, op: "add-state", screenId: "menu", name: "Error", description: "" }, spec), ["menu"]);
  assert.deepEqual(affectedScreens({ id: "2", createdAt: now, op: "remove-transition", transitionId: "checkout-pay" }, spec), ["checkout"]);
  assert.deepEqual(affectedScreens({ id: "3", createdAt: now, op: "remove-screen", screenId: "checkout" }, spec).sort(), ["customise", "menu"]);
  assert.equal(describeChange({ id: "4", createdAt: now, op: "rename-screen", screenId: "menu", name: "Home" }, spec), 'Rename "Menu" to "Home"');
});

test("version messages round-trip", () => {
  const msg = encodeVersionMessage({ kind: "generate", summary: "Generated 3 screens", screens: ["a", "b"], pinned: false });
  const back = decodeVersionMessage(msg);
  assert.equal(back.summary, "Generated 3 screens");
  assert.equal(back.kind, "generate");
  assert.deepEqual(back.screens, ["a", "b"]);
});

test("empty canvas parses", () => {
  assert.ok(CanvasDoc.parse(emptyCanvas()));
});

test("main moves follow the path that continues furthest", async () => {
  const { mainMoves } = await import("./classify.js");
  const spec = demoSpec();
  // menu → customise → checkout is the long path; menu → checkout directly is a shortcut with a condition.
  const m = mainMoves(spec);
  assert.equal(m.get("menu"), "menu-to-customise");
  assert.equal(m.get("customise"), "customise-to-checkout");
  assert.equal(mainMoves(spec, { menu: "menu-to-checkout" }).get("menu"), "menu-to-checkout");
});
