/* Minimum viable DOM so the whole game boots in Node against a real WebGL
   context (headless-gl -> ANGLE, under Xvfb). Every member here is actually
   required by something; document.body is easy to forget and setMode touches
   it on the first frame. */
import glMod from "gl";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function boot({ w = 640, h = 360, dpr = 1.5, seed } = {}) {
  const GL = glMod(w, h, { preserveDrawingBuffer: true, antialias: false });
  if (!GL) throw new Error("headless-gl failed to create a context (is xvfb running?)");
  if (process.env.GLTRACE) {
    /* Wrap every entry point and report the first call that raises a flag.
       getError clears, so this has to be the only place that reads it. */
    const proto = Object.getPrototypeOf(GL);
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (k === "getError" || typeof GL[k] !== "function") continue;
      const f = GL[k].bind(GL);
      GL[k] = (...args) => {
        const r = f(...args);
        const e = GL.getError();
        if (e) console.log("GL 0x" + e.toString(16) + " from " + k + "(" +
          args.map(x => (x && x.length > 8) ? "<len " + x.length + ">" : String(x)).join(", ") + ")");
        return r;
      };
    }
  }

  const listeners = {};
  const mk = () => {
    const e = {
      style: {}, dataset: {}, children: [], textContent: "", value: 0, _cls: new Set(),
      classList: {
        add(c) { e._cls.add(c); }, remove(c) { e._cls.delete(c); },
        toggle(c, o) { if (o === undefined) o = !e._cls.has(c); o ? e._cls.add(c) : e._cls.delete(c); return o; },
        contains(c) { return e._cls.has(c); },
      },
      addEventListener() {}, removeEventListener() {}, setPointerCapture() {},
      querySelector: () => mk(), querySelectorAll: () => [],
      getContext: () => GL, appendChild() {}, closest: () => null,
      setAttribute() {}, getAttribute: () => null,
      get offsetWidth() { return 100; },
      get innerHTML() { return e._html || ""; }, set innerHTML(v) { e._html = v; },
    };
    Object.defineProperty(e, "width", { get() { return e._w || w; }, set(v) { e._w = v; } });
    Object.defineProperty(e, "height", { get() { return e._h || h; }, set(v) { e._h = v; } });
    return e;
  };
  const cache = {};
  const sandbox = {
    console,
    document: {
      getElementById(id) { return cache[id] || (cache[id] = mk()); },
      querySelector: (s) => cache[s] || (cache[s] = mk()),
      body: mk(), documentElement: mk(), pointerLockElement: null,
      addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    },
    getComputedStyle: () => ({ paddingLeft: "0px", paddingRight: "0px", paddingBottom: "0px", paddingTop: "0px", getPropertyValue: () => "0" }),
    innerWidth: w, innerHeight: h, devicePixelRatio: dpr,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() {},
    requestAnimationFrame: () => 0,
    performance: { now: () => Date.now() },
    navigator: { maxTouchPoints: 2 },
    matchMedia: () => ({ matches: false }),
    AudioContext: undefined, webkitAudioContext: undefined,   // audio stays silent
    setTimeout, clearTimeout, Date, Math, JSON,
    /* Host-realm typed arrays. vm.createContext gives the sandbox its own
       intrinsics, so a Float32Array built in there fails headless-gl's
       instanceof check and every bufferData raises INVALID_VALUE. That is the
       harness lying, not the game — suspect the test before the code. */
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array,
    Int8Array, Int16Array, Int32Array, ArrayBuffer, DataView, Map, Set,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  const src = readFileSync(join(here, process.env.MINIFIED ? "bundle.min.js" : "bundle.js"), "utf8");
  vm.runInContext('"use strict";\n' + src, ctx, { filename: "bundle.js" });

  const K = sandbox.__kino;
  if (!K) throw new Error("game did not export __kino");
  if (seed !== undefined) K.rndSeed?.(seed);
  return { K, GL, sandbox, listeners };
}

export function pixels(GL, w, h) {
  const buf = new Uint8Array(w * h * 4);
  GL.readPixels(0, 0, w, h, GL.RGBA, GL.UNSIGNED_BYTE, buf);
  return buf;
}
export function stats(buf) {
  const lum = [];
  for (let i = 0; i < buf.length; i += 4)
    lum.push(0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]);
  lum.sort((a, b) => a - b);
  const at = (p) => lum[Math.min(lum.length - 1, Math.floor(lum.length * p))];
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  return { p50: at(0.5), p90: at(0.9), p99: at(0.99), max: lum[lum.length - 1], mean, sd };
}
export function diff(a, b) {
  let changed = 0, strong = 0, max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > 1) changed++;
    if (d > 16) strong++;
    if (d > max) max = d;
  }
  const n = a.length / 4;
  return { changed: (changed / n * 100).toFixed(1) + "%", strong: (strong / n * 100).toFixed(1) + "%", max };
}
