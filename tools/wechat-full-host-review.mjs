/** Exact IIFEs in an isolated V8 context with a Canvas-only wx simulation.
 * No browser document, XHR, Image, Event, localStorage or WebGL globals leak in.
 * This is synthetic compatibility evidence, never WeChat or device acceptance.
 */
import { createContext, runInContext } from "node:vm";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.UI_CANVAS_PATH ?? "@napi-rs/canvas");
const root = resolve(import.meta.dirname, ".."), pkg = resolve(root, process.env.WECHAT_FULL_PACKAGE ?? "builds/wechat-full-local");
const out = resolve(root, process.env.WECHAT_FULL_HOST_OUTPUT ?? `reports/wechat-full/${new Date().toISOString().replace(/\D/g, "")}-synthetic-host`);
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(pkg, "build-manifest.json"), "utf8")), hash = bytes => createHash("sha256").update(bytes).digest("hex");
const report = { scope: "ISOLATED_V8_SYNTHETIC_CANVAS_WX_NOT_WECHAT", buildId: manifest.buildId, startedAt: new Date().toISOString(),
  node: process.version, canvas: require((process.env.UI_CANVAS_PATH ?? "@napi-rs/canvas") + "/package.json").version,
  sourceScriptSha256: hash(await readFile(import.meta.filename)), status: "RUNNING", events: [], errors: [], checks: [], images: [], filesystemReads: [], audioCallbacks: 0 };
const listeners = new Map(), stores = new Map(), timers = new Set(), intervals = new Set(), rafs = new Map();
let serial = 0, screen, fatal;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms)).then(() => { if (fatal) throw fatal; });
function timeout(callback, ms, ...args) { const handle = setTimeout(() => { timers.delete(handle);
  try { callback(...args); } catch (error) { fatal = error; report.errors.push(error.stack ?? String(error)); }
}, ms); timers.add(handle); return handle; }
function cancel(handle) { clearTimeout(handle); timers.delete(handle); }
function raf(callback) { const id = ++serial; rafs.set(id, timeout(() => { rafs.delete(id); callback(performance.now()); }, 1000 / 60)); return id; }
function packageFile(path) { const full = resolve(pkg, path); assert.ok(full.startsWith(pkg + "/") || full.startsWith(pkg + "\\")); return full; }
function image() {
  const img = new Image(), native = Object.getOwnPropertyDescriptor(Image.prototype, "src");
  Object.defineProperty(img, "src", { get: () => native.get.call(img), set: path => {
    const text = String(path), data = text.startsWith("data:") ? Buffer.from(text.slice(text.indexOf(",") + 1), "base64") : readFileSync(packageFile(text));
    report.images.push({ path: text.startsWith("data:") ? "ENGINE_DATA_URI" : text, bytes: data.length, sha256: hash(data) }); native.set.call(img, data);
  } });
  return img;
}
const wx = {
  createCanvas() { const c = createCanvas(1, 1), get = c.getContext.bind(c); c.getContext = (type, ...args) => type === "2d" ? get(type, ...args) : null; screen ??= c; return c; },
  createImage: image,
  getWindowInfo: () => ({ windowWidth: 896, windowHeight: 414, pixelRatio: 1, safeArea: { left: 20, right: 884, top: 0, bottom: 404 } }),
  getSystemInfoSync: () => ({ ...wx.getWindowInfo(), platform: "SYNTHETIC_NODE_CANVAS", model: "NAPI-Skia fixture", SDKVersion: "NOT_WECHAT", version: "NOT_WECHAT" }),
  getMenuButtonBoundingClientRect: () => ({ left: 796, right: 881, top: 8, bottom: 40, width: 85, height: 32 }),
  getStorageSync: key => stores.get(key) ?? "",
  setStorageSync: (key, value) => stores.set(key, value),
  getFileSystemManager: () => ({ readFile(o) { report.filesystemReads.push(o.filePath); timeout(() => {
    try { const bytes = readFileSync(packageFile(o.filePath)); o.success({ data: o.encoding ? bytes.toString("utf8") : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }); }
    catch (error) { o.fail(String(error)); }
  }, 0); } }),
  loadSubpackage(o) { timeout(() => existsSync(packageFile(o.name + "/game.js")) ? o.success() : o.fail("Synthetic fixture: missing package"), 0); },
  createInnerAudioContext() { let onPlay = () => {}, onError = () => {}, src = "";
    return { loop: false, autoplay: false, volume: 1, set src(value) { src = value; }, get src() { return src; },
      play() { if (!existsSync(packageFile(src))) { onError("Missing real audio file"); return; } report.audioCallbacks++; onPlay(); }, stop() {}, destroy() {},
      onPlay(cb) { onPlay = cb; }, onError(cb) { onError = cb; } };
  },
  showModal(options) { report.events.push({ type: "modal", title: options.title, content: options.content }); },
  exitMiniProgram() { report.events.push({ type: "exit-request" }); }, requestAnimationFrame: raf,
  cancelAnimationFrame(id) { cancel(rafs.get(id)); rafs.delete(id); },
};
for (const name of ["TouchStart", "TouchMove", "TouchEnd", "TouchCancel", "Hide", "Show", "WindowResize", "Error"]) {
  listeners.set(name, new Set()); wx["on" + name] = cb => listeners.get(name).add(cb); wx["off" + name] = cb => listeners.get(name).delete(cb);
}
const sandbox = { wx, console: { log: (...args) => report.events.push({ type: "log", values: args }), error: (...args) => report.errors.push(args.map(String).join(" ")), warn: (...args) => report.events.push({ type: "warn", values: args }) },
  setTimeout: timeout, clearTimeout: cancel, setInterval: (cb, ms) => { const handle = setInterval(cb, ms); intervals.add(handle); return handle; }, clearInterval: handle => { clearInterval(handle); intervals.delete(handle); },
  ...(process.env.WECHAT_FULL_HOST_CLOCK === "wx" ? {} : { performance }), requestAnimationFrame: raf, cancelAnimationFrame: wx.cancelAnimationFrame };
if (process.env.WECHAT_FULL_HOST_CLOCK === "wx") wx.getPerformance = () => ({ now: () => performance.now() * 1000 });
const context = createContext(sandbox); sandbox.GameGlobal = sandbox;
const evaluate = code => runInContext(code, context, { timeout: 10000 });
const snapshot = () => evaluate("GameGlobal.__SHEEP_WX_FULL__?.snapshot()");
async function until(condition, message, ms = 20000) { const start = Date.now(); while (Date.now() - start < ms) { if (condition()) return; if (snapshot()?.failed) throw Error("Runtime failed: " + JSON.stringify(snapshot().errors)); await wait(20); } throw Error("Timed out: " + message); }
const emit = (name, event) => { for (const cb of listeners.get(name)) cb(event); };
async function tap(x, y) { const changedTouches = [{ identifier: 17, clientX: x, clientY: y }]; emit("TouchStart", { changedTouches }); await wait(35); emit("TouchEnd", { changedTouches }); await wait(100); }
function buttons() { return evaluate(`(() => { const rows = [], game = GameGlobal.__SHEEP_WX_FULL__.game(), v = GameGlobal.__SHEEP_WX_FULL__.snapshot().view;
  for (const s of game.scene.getScenes(true)) { const camera=s.cameras.main; const walk=(list,shown=true)=>{for(const o of list){ const visible=shown&&o.visible!==false&&o.active!==false;
    if(visible&&o.input?.enabled){const b=o.getBounds();rows.push({name:o.name,x:v.left+(b.centerX-camera.scrollX*o.scrollFactorX)*v.fit,y:v.top+(b.centerY-camera.scrollY*o.scrollFactorY)*v.fit});} if(o.list)walk(o.list,visible);}};walk(s.children.list);}return rows;})()`); }
async function press(name) { const button = buttons().find(item => item.name === name); assert.ok(button, `Missing ${name}: ${buttons().map(item => item.name)}`); await tap(button.x, button.y);
  await until(() => !evaluate("GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive('WxAssetScene')"), "real deferred resources"); }
const active = name => evaluate(`GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive(${JSON.stringify(name)})`);
async function shot(name) { await writeFile(resolve(out, name + ".png"), screen.toBuffer("image/png")); }
try {
  report.missingBefore = evaluate("['window','document','screen','performance','navigator','Image','XMLHttpRequest','Event','localStorage','structuredClone','WebGLRenderingContext'].filter(key=>typeof globalThis[key]==='undefined')");
  for (const name of ["platform.js", "game.bundle.js"]) {
    const bytes = await readFile(resolve(pkg, name)); assert.equal(hash(bytes), manifest.files.find(file => file.path === name).sha256); runInContext(bytes.toString(), context, { timeout: 20000, filename: name });
  }
  await until(() => snapshot()?.ready && active("MenuScene"), "original menu");
  assert.equal(snapshot().buildId, manifest.buildId); assert.equal(snapshot().renderer, "CANVAS");
  assert.ok(evaluate("GameGlobal.__SHEEP_WX_HOST__.changes.includes('document')")); assert.ok(report.filesystemReads.includes("runtime.json"));
  report.checks.push("exact platform then full engine IIFEs boot without browser globals; own filesystem XHR loads real runtime/PNG/Chinese fonts"); await shot("menu");
  await press("button:微信设置"); await press("settings:sfx-toggle"); assert.equal(snapshot().audio.settings.sfx, false); await shot("settings"); await press("button:返回");
  await press("button:衣橱"); assert.ok(active("WardrobeScene")); await press("button:page-next"); await shot("wardrobe"); await press("button:返回");
  await press("mailbox-entry"); await press("mailbox-letter:welcome-v1"); let pages = 1;
  while (buttons().some(item => item.name === "mailbox-next")) { await press("mailbox-next"); pages++; assert.ok(pages < 20); }
  await press("mailbox-keep"); await press("button:合上邮箱"); report.checks.push(`original settings, wardrobe paging and ${pages}-page Chinese letter work on real Skia canvas and independent wx store`);
  await press("button:开始游戏"); await until(() => active("RunScene"), "original run"); const before = snapshot(); await wait(400); assert.ok(snapshot().physicsSteps > before.physicsSteps + 5);
  await tap(600, 280); assert.ok(snapshot().run.sheep.velocityY < 0); await shot("jump");
  await press("button:暂停"); const paused = snapshot(); await wait(300); assert.equal(snapshot().physicsSteps, paused.physicsSteps);
  await press("button:继续游戏"); await wait(150); assert.ok(snapshot().physicsSteps > paused.physicsSteps);
  emit("TouchStart", { changedTouches: [{ identifier: 17, clientX: 600, clientY: 280 }] }); emit("TouchCancel", { changedTouches: [{ identifier: 17, clientX: 600, clientY: 280 }] });
  emit("Hide"); const hidden = snapshot(), hiddenAt = Date.now(); await wait(10500); assert.equal(snapshot().physicsSteps, hidden.physicsSteps); assert.equal(snapshot().frames, hidden.frames);
  report.background = { elapsedMs: Date.now() - hiddenAt, beforeFrames: hidden.frames, afterFrames: snapshot().frames, beforePhysicsSteps: hidden.physicsSteps, afterPhysicsSteps: snapshot().physicsSteps };
  emit("Show"); await wait(150); assert.ok(active("PauseScene")); await press("button:继续游戏");
  report.checks.push("original Arcade, tap jump, pause/resume, plain host cancellation, wx lifecycle sleep/wake without a browser event target");
  await press("button:暂停"); await press("button:返回首页"); await until(() => active("MenuScene"), "return menu");
  if (process.env.WECHAT_FULL_HOST_LONG === "1") {
    await press("button:开始游戏"); await until(() => active("RunScene"), "natural original run"); const started = Date.now(); let last = 0; report.longRun = { samples: [], actions: [] };
    const changed = (x, y) => ({ changedTouches: [{ identifier: 17, clientX: x, clientY: y }] });
    async function swipe(high) { emit("TouchStart", changed(600, 232)); await wait(20); emit("TouchMove", changed(600, 232 + (high ? -75 : 75))); await wait(60); emit("TouchEnd", changed(600, 232 + (high ? -75 : 75))); }
    while (Date.now() - started < 65000) {
      const state = snapshot(), run = state.run; assert.ok(active("RunScene"), "synthetic touch bot collided with an actual obstacle");
      const hazard = run.obstacles.filter(o => o.x + o.width > run.sheep.x - 16).sort((a, b) => a.x - b.x)[0];
      const overhead = hazard && ["FlyingBird", "HangingVine", "HangingBranch", "HangingLantern", "FlyingGoose"].includes(hazard.kind), dx = hazard ? hazard.x - run.sheep.x : Infinity;
      if (run.sheep.grounded && Date.now() - last > 350 && dx < run.speed * (overhead ? .1 : hazard?.kind === "TallStack" ? .36 : .3) + 16) {
        report.longRun.actions.push({ at: run.activeMs, kind: overhead ? "crouch" : "high", hazard: hazard.kind, dx }); await swipe(!overhead); last = Date.now();
      } else if (!run.starCount && run.sheep.grounded && Date.now() - last > 700 && dx > run.speed * 1.4 && run.stars.some(star => !star.missed && star.x > run.sheep.x && star.x - run.sheep.x < run.speed * .32)) { await tap(600, 280); last = Date.now(); }
      if (!report.longRun.samples.length || run.activeMs - report.longRun.samples.at(-1).activeMs > 5000) report.longRun.samples.push(run);
      await wait(25);
    }
    report.longRun.elapsedMs = Date.now() - started; report.longRun.snapshot = snapshot(); assert.ok(report.longRun.snapshot.run.activeMs >= 64000); assert.ok(report.longRun.snapshot.run.starCount > 0);
    await shot("natural-continuous"); await press("button:暂停"); await press("button:返回首页"); await until(() => active("MenuScene"), "natural run return");
    report.checks.push("65s unchanged original run under no-browser Canvas host, real elapsed time, only touch commands, real pickups and obstacles");
  }
  assert.deepEqual([...listeners.values()].map(set => set.size), Array(listeners.size).fill(1)); assert.deepEqual(report.errors, []);
  assert.ok([...stores.keys()].every(key => key.startsWith("sheep-run-wechat-full-v1/")));
  report.snapshot = snapshot(); report.hostChanges = evaluate("GameGlobal.__SHEEP_WX_HOST__.changes"); report.storageKeys = [...stores.keys()];
  report.remainingMissing = evaluate("['Event','localStorage','structuredClone','WebGLRenderingContext'].filter(key=>typeof globalThis[key]==='undefined')");
  report.status = "PASS_SYNTHETIC_HOST_ONLY";
} catch (error) { report.status = "FAIL_SYNTHETIC_HOST"; report.failure = error.stack ?? String(error); try { report.snapshot = snapshot(); if (screen) await shot("failure"); } catch {} process.exitCode = 1; }
finally {
  try { evaluate("GameGlobal.__SHEEP_WX_FULL__?.game()?.destroy(true)"); } catch {}
  for (const timer of timers) clearTimeout(timer); for (const timer of intervals) clearInterval(timer);
  report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, "review.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, out, buildId: report.buildId, failure: report.failure }));
}
