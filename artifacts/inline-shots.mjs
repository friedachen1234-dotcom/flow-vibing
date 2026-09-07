/**
 * Inlines the screenshots into the artifact as data URIs, so the .jsx stays a single
 * self-contained file that the portfolio can store and render with no asset hosting.
 *
 *   node artifacts/inline-shots.mjs <slug> <dir-of-jpgs>
 *
 * The target file keeps a `const SHOTS = {...}` line; running this replaces whatever is
 * there, so it is safe to run again after re-capturing.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [slug, dir] = process.argv.slice(2);
if (!slug || !dir) {
  console.error("usage: node artifacts/inline-shots.mjs <slug> <dir-of-jpgs>");
  process.exit(1);
}

const entries = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
if (!entries.length) { console.error(`no images in ${dir}`); process.exit(1); }

const pairs = entries.map((f) => {
  const key = f.replace(/\.(jpe?g|png)$/i, "");
  const mime = /\.png$/i.test(f) ? "image/png" : "image/jpeg";
  const b64 = readFileSync(path.join(dir, f)).toString("base64");
  return `  "${key}": "data:${mime};base64,${b64}",`;
});

const file = path.join(here, `${slug}.jsx`);
const src = readFileSync(file, "utf8");
const next = src.replace(
  /const SHOTS = \{[\s\S]*?\n?\};/,
  `const SHOTS = {\n${pairs.join("\n")}\n};`
);
if (next === src) { console.error("could not find the SHOTS block to replace"); process.exit(1); }
writeFileSync(file, next);
console.log(`${file} — ${entries.length} images, ${Math.round(next.length / 1024)}KB total`);
