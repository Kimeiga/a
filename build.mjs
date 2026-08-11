#!/usr/bin/env node
/* Zero-dependency build: concatenate src/ into one self-contained index.html.
   There is no bundler and no minifier — the "build" exists so a 4,000-line
   program can live in editable pieces while still shipping as one request. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");

const read = (f) => readFileSync(join(src, f), "utf8");

/* Numeric prefixes give a stable link order; head/tail bracket the script. */
const parts = readdirSync(src)
  .filter((f) => /^\d\d-.*\.js$/.test(f))
  .sort();

const js = parts.map((f) => `\n/* ==== ${f} ${"=".repeat(Math.max(0, 66 - f.length))} */\n` + read(f)).join("");

const head = read("head.html");
const html = head.replace("/*__GAME__*/", () => js);

writeFileSync(join(root, "index.html"), html);

const report = (name, s) =>
  console.log(`${name.padEnd(16)} ${(Buffer.byteLength(s) / 1024).toFixed(1).padStart(6)} KB raw ` +
    `${(gzipSync(s, { level: 9 }).length / 1024).toFixed(1).padStart(6)} KB gzipped`);
report("index.html", html);
console.log(`                 ${parts.length} modules, ${html.split("\n").length} lines`);

/* Also emit a bare JS bundle for the headless harness, so the test never has to
   scrape <script> out of markup and can never disagree with what shipped. */
writeFileSync(join(root, "test", "bundle.js"), js);

/* --min additionally writes dist/index.html: the same program with the prose
   taken out. index.html is the readable artefact and is what the repository
   is for; dist is what gets uploaded, because roughly two thirds of the raw
   bytes here are comments explaining why things are the way they are. */
if (process.argv.includes("--min")) {
  const { minify } = await import("terser");
  const out = await minify(js, {
    ecma: 2018,
    compress: { passes: 2, unsafe_math: true },
    mangle: { toplevel: true },
    toplevel: true,
    format: { comments: false },
  });
  if (out.error) throw out.error;
  const minHead = head
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n\s*\n/g, "\n");
  const minHtml = minHead.replace("/*__GAME__*/", () => out.code);
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "index.html"), minHtml);
  writeFileSync(join(root, "test", "bundle.min.js"), out.code);
  report("dist/index.html", minHtml);
}
