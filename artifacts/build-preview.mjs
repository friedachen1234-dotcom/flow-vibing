/**
 * Wraps an artifact .jsx in a standalone page so it can be viewed outside the portfolio.
 * The .jsx is the single source: this only strips its React import, swaps the portfolio's
 * render() host for a ReactDOM root, and transpiles in the browser with Babel standalone.
 *
 *   node artifacts/build-preview.mjs how-flow-vibing-works
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2];
if (!slug) {
  console.error("usage: node artifacts/build-preview.mjs <slug>");
  process.exit(1);
}

const jsx = readFileSync(path.join(here, `${slug}.jsx`), "utf8");
const meta = JSON.parse(readFileSync(path.join(here, `${slug}.meta.json`), "utf8"));

// The portfolio supplies React and a render() host; a standalone page has to provide both itself.
const body = jsx
  .replace(/^import\s+React[^\n]*\n/m, "")
  .replace(/render\(<Main \/>\);?\s*$/m, "");

const html = `<title>${meta.title.split(":")[0].trim()}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<style>
  /* This artifact commits to the portfolio's light paper world, so it paints its own ground
     rather than inheriting the host theme. */
  body { background: #ffffff; color: #17191c; margin: 0; }
  #root { padding: 28px 24px 40px; }
  @media (max-width: 560px) { #root { padding: 18px 16px 32px; } }
  button:focus-visible, [role="img"]:focus-visible { outline: 2px solid #4f4566; outline-offset: 2px; border-radius: 6px; }
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js"></script>
<script type="text/babel" data-presets="react">
const { useState, useRef, useEffect } = React;
${body}
ReactDOM.createRoot(document.getElementById("root")).render(<Main />);
</script>
`;

const out = path.join(here, `${slug}.html`);
writeFileSync(out, html);
console.log(`${out} — ${html.length} chars`);
