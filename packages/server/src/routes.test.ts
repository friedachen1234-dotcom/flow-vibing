import { test } from "node:test";
import assert from "node:assert/strict";
import { extractElement, spliceElement } from "./html.js";

test("spliceElement replaces a nested element by data-flow-el", () => {
  const html = `<body><div data-flow-el="card" class="a"><span>x</span><div><i>y</i></div></div><p data-flow-el="other">z</p></body>`;
  const out = spliceElement(html, "card", `<section data-flow-el="card">new</section>`);
  assert.equal(out, `<body><section data-flow-el="card">new</section><p data-flow-el="other">z</p></body>`);
});

test("extractElement returns the original outer HTML", () => {
  const html = `<body><div data-flow-el="card" class="a"><span>x</span><div><i>y</i></div></div><p data-flow-el="other">z</p></body>`;
  assert.equal(extractElement(html, "card"), `<div data-flow-el="card" class="a"><span>x</span><div><i>y</i></div></div>`);
  assert.equal(extractElement(html, "nope"), null);
});

test("spliceElement handles void elements and missing ids", () => {
  const html = `<div><img data-flow-el="hero" src="x.png"><p>t</p></div>`;
  assert.equal(spliceElement(html, "hero", `<img data-flow-el="hero" src="y.png">`), `<div><img data-flow-el="hero" src="y.png"><p>t</p></div>`);
  assert.equal(spliceElement(html, "nope", "<b/>"), null);
});
