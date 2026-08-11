#!/usr/bin/env node
/* Zero-dependency build: concatenate src/ into one self-contained index.html.
   There is no bundler and no minifier — the "build" exists so a 4,000-line
   program can live in editable pieces while still shipping as one request. */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
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

const html = read("head.html").replace("/*__GAME__*/", () => js) ;

writeFileSync(join(root, "index.html"), html);

const raw = Buffer.byteLength(html);
const gz = gzipSync(html, { level: 9 }).length;
console.log(
  `index.html  ${(raw / 1024).toFixed(1)} KB raw  ${(gz / 1024).toFixed(1)} KB gzipped  ` +
    `(${parts.length} modules, ${html.split("\n").length} lines)`
);

/* Also emit a bare JS bundle for the headless harness, so the test never has to
   scrape <script> out of markup and can never disagree with what shipped. */
writeFileSync(join(root, "test", "bundle.js"), js);
