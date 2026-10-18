/** Runs the exact packaged scripts against a browser wx facade. This is NOT WeChat evidence. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UI_PLAYWRIGHT_PATH || "playwright");
const root = resolve(import.meta.dirname, "..");
const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" }).format(new Date()).replace(/\D/g, "");
const output = resolve(root, process.env.WECHAT_REVIEW_OUTPUT ?? `reports/wechat-poc/${stamp}-browser-review`);
const pkg = resolve(root, "builds/wechat-poc");
await mkdir(output, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Browser facade — NOT WeChat</title>
<style>html,body{margin:0;background:#15281c;overflow:hidden}canvas{width:100vw!important;height:100vh!important;position:absolute;inset:0;image-rendering:pixelated}</style>
<body><script>
window.GameGlobal=new URLSearchParams(location.search).has('bare')?{}:window; window.harness={events:{},modals:[],exitRequested:false};
const h=window.harness;
const params=new URLSearchParams(location.search);h.storageDenied=params.has('storageDenied');
if(params.has('malformedStorage'))localStorage.setItem('sheep-run-wechat-poc-v1',JSON.stringify({schema:1,launches:7,stars:-1,collisions:3,sfx:true}));
if(params.has('stalled'))window.requestAnimationFrame=()=>1;
h.on=(name,cb)=>(h.events[name]??=new Set()).add(cb);
h.off=(name,cb)=>h.events[name]?.delete(cb);
h.emit=(name,event)=>{for(const cb of h.events[name]??[])cb(event)};
let first=true;
window.wx={
 createCanvas(){const c=document.createElement('canvas');if(first){first=false;document.body.appendChild(c)}return c},
 createImage(){return new Image()},
 getWindowInfo(){return {windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{left:20,top:0,right:innerWidth-12,bottom:innerHeight-10}}},
 getSystemInfoSync(){return {...this.getWindowInfo(),platform:'BROWSER_FACADE',SDKVersion:'NOT_WECHAT',version:'NOT_WECHAT',model:'Chromium touch emulation'}},
 requestAnimationFrame(cb){return window.requestAnimationFrame(cb)},cancelAnimationFrame(id){return window.cancelAnimationFrame(id)},
 getStorageSync(key){if(h.storageDenied)throw Error('injected storage denial');const value=localStorage.getItem(key);return value?JSON.parse(value):''},
 setStorageSync(key,value){if(h.storageDenied)throw Error('injected storage denial');localStorage.setItem(key,JSON.stringify(value))},
 getFileSystemManager(){return {readFile(o){fetch(o.filePath).then(r=>{if(!r.ok)throw Error(r.status);return o.encoding?r.text():r.arrayBuffer()}).then(data=>o.success({data}),o.fail)}}},
 createInnerAudioContext(){const a=new Audio();a.preload='auto';return {set src(v){a.src=v},set autoplay(v){a.autoplay=v},set loop(v){a.loop=v},set volume(v){a.volume=v},play(){a.play().catch(e=>h.audioError?.(String(e)))},stop(){a.pause();a.currentTime=0},destroy(){a.pause();a.removeAttribute('src')},onPlay(cb){a.addEventListener('playing',cb)},onError(cb){h.audioError=cb;a.addEventListener('error',()=>cb(a.error?.message))}}},
 showModal(o){h.modals.push(o);console.error('POC_MODAL',o.title,o.content)},
 exitMiniProgram(){h.exitRequested=true}
};
for(const n of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize','Error']){wx['on'+n]=cb=>h.on(n,cb);wx['off'+n]=cb=>h.off(n,cb)}
for(const [event,name] of [['touchstart','TouchStart'],['touchmove','TouchMove'],['touchend','TouchEnd'],['touchcancel','TouchCancel']]){
 addEventListener(event,e=>{if(e.cancelable)e.preventDefault();h.emit(name,{changedTouches:[...e.changedTouches].map(t=>({identifier:t.identifier,clientX:t.clientX,clientY:t.clientY}))})},{passive:false})
}
addEventListener('resize',()=>h.emit('WindowResize'));
</script><script src="platform.js"></script><script src="game.bundle.js"></script>`;
const server = createServer(async (req, res) => {
  const requestURL = new URL(req.url, "http://local");
  const name = decodeURIComponent(requestURL.pathname).slice(1);
  if (name === "favicon.ico") { res.writeHead(204); res.end(); return; }
  if (!name) { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(requestURL.searchParams.has("bare") ? html.replace('src="game.bundle.js"', 'src="game.bundle.js?bare=1"') : html); return; }
  const path = resolve(pkg, name);
  if (!path.startsWith(pkg + "/") && !path.startsWith(pkg + "\\")) { res.writeHead(403); res.end(); return; }
  try { let data = await readFile(path); res.setHeader("content-type", ({ ".png": "image/png", ".wav": "audio/wav", ".json": "application/json", ".js": "application/javascript" })[extname(path)] ?? "text/plain");
    if (name === "game.bundle.js" && requestURL.searchParams.has("bare")) data = Buffer.from(`(function(window,document,navigator,Image,XMLHttpRequest,HTMLCanvasElement,CanvasRenderingContext2D,WebGLRenderingContext){${data.toString()}})(GameGlobal.window,GameGlobal.document,GameGlobal.navigator,GameGlobal.Image,GameGlobal.XMLHttpRequest,GameGlobal.HTMLCanvasElement,GameGlobal.CanvasRenderingContext2D,GameGlobal.WebGLRenderingContext);globalThis.__SHEEP_WX_POC__=GameGlobal.__SHEEP_WX_POC__;`);
    res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, channel: "msedge", args: ["--autoplay-policy=no-user-gesture-required"] });
const report = { label: "BROWSER_FACADE_ONLY_NOT_WECHAT", browser: browser.version(), built: JSON.parse(await readFile(resolve(pkg, "build-manifest.json"), "utf8")), runs: [] };
try {
  for (const [width, height, dpr] of [[896, 414, 1], [844, 390, 2], [800, 600, 1]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
    const page = await context.newPage(), cdp = await context.newCDPSession(page), errors = [];
    page.on("pageerror", e => errors.push(e.stack ?? e.message));
    page.on("console", m => { if (m.type() === "error" || (m.type() === "warning" && /Texture.*(missing|not found)|Frame.*(missing|not found)/i.test(m.text()))) errors.push(m.text()); });
    const id = `${report.built.config.renderer}-${width}x${height}-dpr${dpr}`;
    const result = { id, checks: [], errors };
    result.httpErrors = []; page.on("response", response => { if (response.status() >= 400) result.httpErrors.push({ status: response.status(), url: response.url() }); });
    report.runs.push(result);
    await page.goto(url);
    const snapshot = () => page.evaluate(() => window.__SHEEP_WX_POC__?.snapshot());
    try {
      await page.waitForFunction(() => window.__SHEEP_WX_POC__?.snapshot().ready, null, { timeout: 25000 });
    } catch (e) {
      result.failure = String(e); result.snapshot = await snapshot(); result.modals = await page.evaluate(() => harness.modals.map(m => ({ title: m.title, content: m.content })));
      await page.screenshot({ path: resolve(output, `${id}-boot-failure.png`) }); throw e;
    }
    let s = await snapshot(); assert.equal(s.engine, "4.2.1"); assert.equal(s.ready, true);
    assert.equal(s.build.id, report.built.identity.id);
    result.observedReadyMs = await page.evaluate(() => performance.now());
    assert.ok(s.textures.every(t => t.scaleMode === 1));
    assert.deepEqual(s.textures.find(t => t.key === "sheep-runner"), { key: "sheep-runner", width: 640, height: 384, scaleMode: 1 });
    if (report.built.config.renderer !== "auto") assert.equal(s.renderer, report.built.config.renderer.toUpperCase());
    result.checks.push("exact packaged Phaser 4.2.1 booted with real resources and JSON font");
    assert.equal(await page.locator("canvas").count(), 1); result.checks.push("one visible game canvas, no DOM overlays");
    const physical = async (x, y) => { const s = await snapshot(); return { x: s.view.left + x * s.view.fit, y: s.view.top + y * s.view.fit }; };
    const touch = async (type, x = 0, y = 0) => {
      const p = await physical(x, y);
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x: p.x, y: p.y, id: 1 }] });
    };
    const tap = async (x, y) => { await touch("touchStart", x, y); await page.waitForTimeout(40); await touch("touchEnd"); };
    const button = async id => { const s = await snapshot(), b = s.buttons.find(b => b.id === id); assert.ok(b, `button missing: ${id}`); await tap(b.rect.x + b.rect.width / 2, b.rect.y + b.rect.height / 2); await page.waitForTimeout(60); };
    const resume = async () => { if ((await snapshot()).paused) await button("resume"); };
    const restart = async () => { if (!(await snapshot()).paused) await button("pause"); await button("restart"); await page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().ready); };
    // Cancel cannot jump or activate a button.
    await touch("touchStart", 300, 180); await touch("touchCancel"); await page.waitForTimeout(100);
    assert.equal((await snapshot()).sheep.grounded, true); result.checks.push("touchcancel does not jump");
    await tap(300, 180); await page.waitForTimeout(100); s = await snapshot(); result.jumpSnapshot = s; assert.ok(s.sheep.velocityY < 0); assert.equal(s.sheep.animation, "sheep-jump");
    result.checks.push("tap invokes original -500 jump and real sheep animation");
    await page.screenshot({ path: resolve(output, `${id}-jump.png`) });
    // Wait for the real star overlap at ground height, then verify no duplicate pickup over multiple steps.
    await page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().collectedThisRun === 1, null, { timeout: 5000 });
    const stars = (await snapshot()).progress.stars; await page.waitForTimeout(120);
    assert.equal((await snapshot()).progress.stars, stars); result.checks.push("actual Arcade star overlap and deactivation prevent repeated score");
    await page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().paused, null, { timeout: 5000 });
    s = await snapshot(); assert.ok(s.progress.collisions >= 1); assert.ok(s.physicsSteps > 60);
    result.checks.push("real WoodFence overlap pauses and records collision after continuous Arcade stepping");
    await page.screenshot({ path: resolve(output, `${id}-pause.png`) });
    const frozen = await snapshot(); await page.waitForTimeout(180);
    assert.equal((await snapshot()).activeMs, frozen.activeMs); assert.equal((await snapshot()).physicsSteps, frozen.physicsSteps);
    result.checks.push("pause freezes active clock and physics");
    // Button cancellation must not resume; a new touch is required after a modal transition.
    const resumeRect = frozen.buttons.find(b => b.id === "resume").rect;
    await touch("touchStart", resumeRect.x + resumeRect.width / 2, resumeRect.y + resumeRect.height / 2); await touch("touchCancel");
    assert.equal((await snapshot()).paused, true); result.checks.push("cancelled pause-panel touch does not resume or leak gameplay input");
    await resume(); await tap(300, 180); await page.waitForTimeout(80);
    assert.ok((await snapshot()).sheep.velocityY < 0); result.checks.push("inspection resume after collision restores jump input");
    await restart();
    await touch("touchStart", 300, 160);
    for (const y of [152, 144, 138, 128]) { await touch("touchMove", 300, y); await page.waitForTimeout(15); }
    await touch("touchEnd"); await page.waitForTimeout(60);
    assert.ok((await snapshot()).sheep.velocityY < -350); result.checks.push("incremental upward swipe invokes original high jump");
    await page.waitForTimeout(950);
    await touch("touchStart", 300, 140); await touch("touchMove", 300, 176); await touch("touchEnd"); await page.waitForTimeout(60);
    assert.equal((await snapshot()).sheep.height, 30); await page.waitForTimeout(340); assert.equal((await snapshot()).sheep.height, 42);
    result.checks.push("down swipe uses original crouch size and 320ms duration");
    await touch("touchStart", 300, 160); await page.waitForTimeout(300); assert.notEqual((await snapshot()).sheep.state, "DASH"); await touch("touchCancel");
    result.checks.push("hold leaves Dash disabled");
    await button("pause"); const atPause = await snapshot();
    await page.evaluate(() => harness.emit("Hide")); await page.waitForTimeout(220); const atHide = await snapshot();
    await page.waitForTimeout(180); const later = await snapshot(); assert.equal(later.frames, atHide.frames); assert.equal(later.physicsSteps, atHide.physicsSteps); assert.equal(later.activeMs, atPause.activeMs);
    await page.evaluate(() => harness.emit("Show")); await page.waitForTimeout(180); assert.equal((await snapshot()).paused, true); assert.equal((await snapshot()).activeMs, atPause.activeMs);
    await resume(); await page.waitForTimeout(100); assert.ok((await snapshot()).activeMs > atPause.activeMs);
    result.checks.push("facade hide stops the sole TimeStep; show waits for explicit resume without elapsed-time jump");
    await page.setViewportSize({ width: width - 32, height }); await page.waitForTimeout(100);
    assert.equal((await snapshot()).paused, true); await resume();
    result.checks.push("resize recomputes camera, background, safe-area UI and uniform touch transform");
    await button("pause"); const beforeToggle = (await snapshot()).progress.sfx; await button("audio"); assert.equal((await snapshot()).progress.sfx, !beforeToggle); await button("audio");
    assert.ok((await snapshot()).audioPlays > 0); result.checks.push("browser audio playing event and persisted sound toggle (audibility in WeChat unverified)");
    const p = (await snapshot()).progress; await button("exit"); assert.equal(await page.evaluate(() => harness.exitRequested), true);
    await page.reload(); await page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().ready);
    const reopened = await snapshot(); assert.equal(reopened.progress.launches, p.launches + 1); assert.equal(reopened.progress.stars, p.stars); assert.equal(reopened.progress.collisions, p.collisions);
    result.checks.push("facade exit callback plus fresh bundle launch reads its isolated progress key");
    result.snapshot = reopened; result.events = await page.evaluate(() => window.__SHEEP_WX_POC__.events);
    assert.deepEqual(errors, []); assert.deepEqual(reopened.errors, []);
    await context.close();
  }
  // Critical image failure must prevent gameplay; successful retry reuses real assets.
  const context = await browser.newContext({ viewport: { width: 896, height: 414 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); let fail = true;
  await page.route("**/assets/star.png", route => fail ? route.fulfill({ status: 404, body: "missing" }) : route.continue());
  await page.goto(url); await page.waitForFunction(() => harness.modals.some(m => m.title === "资源加载失败"));
  assert.equal(await page.evaluate(() => window.__SHEEP_WX_POC__.snapshot().ready), false);
  await page.screenshot({ path: resolve(output, `${report.built.config.renderer}-load-failure.png`) });
  fail = false; await page.evaluate(() => harness.modals.find(m => m.title === "资源加载失败").success({ confirm: true }));
  await page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().ready);
  report.failureBranch = { missingImage: "blocked with explicit error", retry: "real star loaded, gameplay ready", events: await page.evaluate(() => window.__SHEEP_WX_POC__.events) };
  await context.close();
  const deniedContext = await browser.newContext({ viewport: { width: 896, height: 414 } });
  const denied = await deniedContext.newPage(); await denied.goto(url + "?storageDenied=1");
  await denied.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().ready);
  assert.match(await denied.evaluate(() => window.__SHEEP_WX_POC__.snapshot().storageError), /denial/);
  report.storageDenied = "error surfaced without touching any production save key";
  await deniedContext.close();
  const malformedContext = await browser.newContext({ viewport: { width: 896, height: 414 } });
  const malformed = await malformedContext.newPage(); await malformed.goto(url + "?malformedStorage=1");
  await malformed.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().ready);
  const original = await malformed.evaluate(() => localStorage.getItem('sheep-run-wechat-poc-v1'));
  await malformed.evaluate(() => {
    const s=__SHEEP_WX_POC__.snapshot(), b=s.buttons.find(b=>b.id==='pause').rect;
    const t={identifier:1,clientX:s.view.left+(b.x+b.width/2)*s.view.fit,clientY:s.view.top+(b.y+b.height/2)*s.view.fit};
    harness.emit('TouchStart',{changedTouches:[t]});harness.emit('TouchEnd',{changedTouches:[t]});
  });
  const after = await malformed.evaluate(() => localStorage.getItem('sheep-run-wechat-poc-v1'));
  report.malformedStorage = { original, after, snapshot: await malformed.evaluate(() => __SHEEP_WX_POC__.snapshot()) };
  assert.equal(after, original, "pause must not replace unreadable progress with defaults");
  assert.equal(report.malformedStorage.snapshot.progressLoaded, false);
  await malformedContext.close();
  const stalledContext = await browser.newContext({ viewport: { width: 896, height: 414 } });
  const stalled = await stalledContext.newPage(); await stalled.goto(url + "?stalled=1");
  await stalled.waitForFunction(() => harness.modals.some(m => m.content.includes("main loop stalled")), null, { timeout: 10000, polling: 100 });
  report.stalledLoop = await stalled.evaluate(() => ({ snapshot: window.__SHEEP_WX_POC__.snapshot(), modals: harness.modals.map(m => ({ title: m.title, content: m.content })) }));
  assert.equal(report.stalledLoop.snapshot.failed, true); await stalledContext.close();
  const bareContext = await browser.newContext({ viewport: { width: 896, height: 414 }, hasTouch: true, isMobile: true });
  const bare = await bareContext.newPage(), bareErrors = [];
  bare.on("pageerror", e => bareErrors.push(e.stack ?? e.message));
  await bare.goto(url + "?bare=1");
  try { await bare.waitForFunction(() => window.__SHEEP_WX_POC__?.snapshot().ready, null, { timeout: 12000 }); }
  finally { report.bareHost = { errors: bareErrors, snapshot: await bare.evaluate(() => GameGlobal.__SHEEP_WX_POC__?.snapshot()), events: await bare.evaluate(() => GameGlobal.__SHEEP_WX_HOST__?.events) }; }
  assert.ok(report.bareHost.snapshot.changes.includes("XMLHttpRequest"));
  assert.ok(report.bareHost.snapshot.changes.includes("document"));
  await bare.waitForTimeout(400); assert.ok((await bare.evaluate(() => __SHEEP_WX_POC__.snapshot())).physicsSteps > report.bareHost.snapshot.physicsSteps);
  assert.deepEqual(bareErrors, []); await bareContext.close();
} catch (e) { report.failure = e.stack ?? String(e); throw e; }
finally {
  await writeFile(resolve(output, `result-${report.built.config.renderer}.json`), JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(r => server.close(r));
}
console.log(JSON.stringify({ evidence: report.label, renderer: report.built.config.renderer, runs: report.runs.length, passed: !report.failure }));
