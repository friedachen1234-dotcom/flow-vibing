/**
 * Points the artifact's SHOTS block at its screenshots, either way round:
 *
 *   node artifacts/inline-shots.mjs <slug> <dir-of-jpgs>
 *     Data URIs, for the standalone build that has to carry its own assets.
 *
 *   node artifacts/inline-shots.mjs <slug> <dir-of-jpgs> --urls /artifacts/<slug> [--out <file>]
 *     Plain URLs, for a host that serves the images itself. Much smaller, so the row
 *     stays light and the page does not compile half a megabyte of base64 at runtime.
 *
 * The target file keeps a `const SHOTS = {...}` line; running this replaces whatever is
 * there, so it is safe to run again after re-capturing.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const [slug, dir] = args;
const urlAt = args.indexOf("--urls");
const urlBase = urlAt === -1 ? null : args[urlAt + 1];
const outAt = args.indexOf("--out");
const outName = outAt === -1 ? null : args[outAt + 1];
if (!slug || !dir || (urlAt !== -1 && !urlBase)) {
  console.error("usage: node artifacts/inline-shots.mjs <slug> <dir-of-jpgs> [--urls <base> [--out <file>]]");
  process.exit(1);
}

const entries = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
if (!entries.length) { console.error(`no images in ${dir}`); process.exit(1); }

const pairs = entries.map((f) => {
  const key = f.replace(/\.(jpe?g|png|webp)$/i, "");
  if (urlBase) return `  "${key}": "${urlBase.replace(/\/$/, "")}/${f}",`;
  const mime = /\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg";
  const b64 = readFileSync(path.join(dir, f)).toString("base64");
  return `  "${key}": "data:${mime};base64,${b64}",`;
});

const file = path.join(here, `${slug}.jsx`);
const src = readFileSync(file, "utf8");
const target = outName ? path.join(here, outName) : file;
const next = src.replace(
  /const SHOTS = \{[\s\S]*?\n?\};/,
  `const SHOTS = {\n${pairs.join("\n")}\n};`
);
if (next === src) { console.error("could not find the SHOTS block to replace"); process.exit(1); }
writeFileSync(target, next);
console.log(`${target} — ${entries.length} images, ${Math.round(next.length / 1024)}KB total`);
