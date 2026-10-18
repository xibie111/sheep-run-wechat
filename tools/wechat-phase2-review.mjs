/** Exact candidate + browser wx facade. No WeChat/device claims. Touches only; no game mutation. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UI_PLAYWRIGHT_PATH || "playwright");
const root = resolve(import.meta.dirname, ".."), pkg = resolve(root, "builds/wechat-poc");
const stamp = new Date().toISOString().replace(/\D/g, "");
const output = resolve(root, process.env.WECHAT_REVIEW_OUTPUT ?? `reports/wechat-phase2/${stamp}-browser`);
await mkdir(output, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Browser facade — NOT WeChat</title>
<style>html,body{margin:0;background:#15281c;overflow:hidden}canvas{width:100vw!important;height:100vh!important;position:absolute;inset:0;image-rendering:pixelated}</style><body><script>
window.GameGlobal=new URLSearchParams(location.search).has('bare')?{}:window;
window.harness={events:{},modals:[],audio:[],storageCalls:[]};const h=harness,params=new URLSearchParams(location.search);
h.storageDenied=params.has('storageDenied');h.musicDenied=params.has('musicDenied');
localStorage.setItem('sheep-run-save','WEB_SAVE_SENTINEL');localStorage.setItem('sheep-run-wechat-poc-v1','POC_SENTINEL');
if(params.has('malformedStorage'))localStorage.setItem('sheep-run-wechat-save-v1',JSON.stringify({version:999,coins:713}));
if(params.has('stalled'))window.requestAnimationFrame=()=>1;
h.on=(n,cb)=>(h.events[n]??=new Set()).add(cb);h.off=(n,cb)=>h.events[n]?.delete(cb);h.emit=(n,e)=>{for(const cb of h.events[n]??[])cb(e)};
let first=true;
window.wx={createCanvas(){const c=document.createElement('canvas');if(first){first=false;document.body.appendChild(c)}return c},createImage(){return new Image()},
getWindowInfo(){return {windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{left:20,top:0,right:innerWidth-12,bottom:innerHeight-10}}},
getMenuButtonBoundingClientRect(){return {left:innerWidth-100,top:8,right:innerWidth-15,bottom:40,width:85,height:32}},
getSystemInfoSync(){return {...this.getWindowInfo(),platform:'BROWSER_FACADE',SDKVersion:'NOT_WECHAT',version:'NOT_WECHAT',model:'Chromium touch emulation'}},
requestAnimationFrame(cb){return window.requestAnimationFrame(cb)},cancelAnimationFrame(id){window.cancelAnimationFrame(id)},
getStorageSync(key){h.storageCalls.push({op:'read',key});if(h.storageDenied)throw Error('injected storage denial');const v=localStorage.getItem(key);return v?JSON.parse(v):''},
setStorageSync(key,value){h.storageCalls.push({op:'write',key});if(h.storageDenied)throw Error('injected storage denial');localStorage.setItem(key,JSON.stringify(value))},
getFileSystemManager(){return {readFile(o){fetch(o.filePath).then(r=>{if(!r.ok)throw Error(r.status);return o.encoding?r.text():r.arrayBuffer()}).then(data=>o.success({data}),o.fail)}}},
loadSubpackage(o){if(h.musicDenied){o.fail('injected music subpackage failure');return}fetch('music/game.js').then(r=>{if(!r.ok)throw Error(r.status);o.success()},o.fail)},
createInnerAudioContext(){const a=new Audio(),entry={src:'',playing:false,plays:0,stops:0,request:0};h.audio.push(entry);let error;
return {set src(v){entry.src=v;a.src=v},set autoplay(v){a.autoplay=v},set loop(v){a.loop=v},set volume(v){a.volume=v},
play(){const request=++entry.request;a.play().catch(e=>{if(request===entry.request)error?.(String(e))})},stop(){entry.request++;entry.playing=false;entry.stops++;a.pause();a.currentTime=0},destroy(){entry.request++;a.pause();a.removeAttribute('src')},
onPlay(cb){a.addEventListener('playing',()=>{entry.playing=true;entry.plays++;cb()})},onError(cb){error=cb;a.addEventListener('error',()=>cb(a.error?.message))}}},
showModal(o){h.modals.push(o);console.error('WX_FACADE_MODAL',o.title,o.content)},exitMiniProgram(){h.exitRequested=true}};
for(const n of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize','Error']){wx['on'+n]=cb=>h.on(n,cb);wx['off'+n]=cb=>h.off(n,cb)}
for(const [event,name] of [['touchstart','TouchStart'],['touchmove','TouchMove'],['touchend','TouchEnd'],['touchcancel','TouchCancel']])addEventListener(event,e=>{if(e.cancelable)e.preventDefault();h.emit(name,{changedTouches:[...e.changedTouches].map(t=>({identifier:t.identifier,clientX:t.clientX,clientY:t.clientY}))})},{passive:false});
addEventListener('resize',()=>h.emit('WindowResize'));
</script><script src="platform.js"></script><script src="game.bundle.js"></script>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://local"), name = decodeURIComponent(url.pathname).slice(1);
  if (name === "favicon.ico") { res.writeHead(204); res.end(); return; }
  if (!name) { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(url.searchParams.has("bare") ? html.replace('src="game.bundle.js"', 'src="game.bundle.js?bare=1"') : html); return; }
  const path = resolve(pkg, name);
  if (!path.startsWith(pkg + "/") && !path.startsWith(pkg + "\\")) { res.writeHead(403); res.end(); return; }
  try {
    let bytes = await readFile(path); res.setHeader("content-type", ({ ".png": "image/png", ".wav": "audio/wav", ".json": "application/json", ".js": "application/javascript" })[extname(path)] ?? "text/plain");
    if (name === "game.bundle.js" && url.searchParams.has("bare")) bytes = Buffer.from(`(function(window,document,navigator,Image,XMLHttpRequest,HTMLCanvasElement,CanvasRenderingContext2D,WebGLRenderingContext){${bytes.toString()}})(GameGlobal.window,GameGlobal.document,GameGlobal.navigator,GameGlobal.Image,GameGlobal.XMLHttpRequest,GameGlobal.HTMLCanvasElement,GameGlobal.CanvasRenderingContext2D,GameGlobal.WebGLRenderingContext);globalThis.__SHEEP_WX_POC__=GameGlobal.__SHEEP_WX_POC__;`);
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, channel: "msedge", args: ["--autoplay-policy=no-user-gesture-required"] });
const report = { scope: "BROWSER_FACADE_ONLY_NOT_WECHAT", browser: browser.version(), build: JSON.parse(await readFile(resolve(pkg, "build-manifest.json"), "utf8")), runs: [] };
async function session(width = 896, height = 414, dpr = 1, query = "") {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
  const page = await context.newPage(), cdp = await context.newCDPSession(page), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error" || /Texture.*(missing|not found)|Frame.*(missing|not found)/i.test(message.text())) errors.push(message.text()); });
  const snapshot = () => page.evaluate(() => window.__SHEEP_WX_POC__?.snapshot());
  async function touch(type, x = 0, y = 0) {
    const s = await snapshot(); await cdp.send("Input.dispatchTouchEvent", { type,
      touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x: s.view.left + x * s.view.fit, y: s.view.top + y * s.view.fit, id: 1 }] });
  }
  const tap = async (x, y) => { await touch("touchStart", x, y); await page.waitForTimeout(25); await touch("touchEnd"); };
  const button = async id => { const s = await snapshot(), b = s.buttons.find(button => button.id === id); assert.ok(b, `button missing ${id} on ${s.screen}`);
    await tap(b.rect.x + b.rect.width / 2, b.rect.y + b.rect.height / 2); await page.waitForTimeout(80); };
  const swipe = async (high, fast = false) => { await touch("touchStart", 330, 155); for (const delta of fast ? [36] : [8, 16, 24, 36]) { await touch("touchMove", 330, 155 + delta * (high ? -1 : 1)); if (!fast) await page.waitForTimeout(12); } await touch("touchEnd"); };
  const boot = async () => { await page.goto(url + query); await page.waitForFunction(() => window.__SHEEP_WX_POC__?.snapshot().ready, null, { timeout: 25000 }); };
  const restart = async () => { const s = await snapshot(); if (s.screen === "run") await button("pause"); await button("restart"); await page.waitForFunction(() => window.__SHEEP_WX_POC__?.snapshot().screen === "run"); };
  return { context, page, errors, snapshot, touch, tap, button, swipe, boot, restart, cdp };
}
try {
  for (const [width, height, dpr] of [[896, 414, 1], [844, 390, 2], [800, 600, 1]]) {
    const t = await session(width, height, dpr), { page, snapshot, touch, tap, button, swipe, restart } = t;
    const id = `${report.build.config.renderer}-${width}x${height}-dpr${dpr}`, run = { id, checks: [], errors: t.errors }; report.runs.push(run);
    try {
      await t.boot(); let s = await snapshot();
      assert.equal(s.build.id, report.build.identity.id); assert.equal(s.engine, "4.2.1"); assert.equal(s.screen, "menu");
      assert.equal(s.textures.length, 32); assert.ok(s.textures.every(texture => texture.scaleMode === 1));
      if (report.build.config.renderer !== "auto") assert.equal(s.renderer, report.build.config.renderer.toUpperCase());
      assert.equal(await page.locator("canvas").count(), 1); run.checks.push("exact build, 15-frame sheep, 18 real obstacle textures, 3 pickups, Chinese font, one visible canvas menu");
      await page.screenshot({ path: resolve(output, `${id}-menu.png`) });
      await button("settings"); await button("music-down"); await button("sfx-down"); await button("music"); await button("sfx");
      s = await snapshot(); assert.deepEqual(s.progress.settings, { music: false, sfx: false, musicVolume: .9, sfxVolume: .9 });
      await button("music"); await button("sfx"); await page.screenshot({ path: resolve(output, `${id}-settings.png`) }); await button("back");
      assert.equal((await snapshot()).audio.error, "");
      await button("start"); await page.waitForTimeout(70); s = await snapshot(); assert.equal(s.sheep.grounded, true);
      const pauseButton = s.buttons.find(button => button.id === "pause"); assert.ok(pauseButton.rect.y * s.view.fit > 40);
      await touch("touchStart", 330, 180); await touch("touchCancel"); await page.waitForTimeout(60); assert.equal((await snapshot()).sheep.grounded, true);
      await touch("touchStart", 330, 180); s = await snapshot();
      const finger = (id, x, y) => ({ id, x: s.view.left + x * s.view.fit, y: s.view.top + y * s.view.fit });
      await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger(1, 330, 180), finger(2, 390, 185)] });
      await t.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [finger(1, 330, 180), finger(2, 390, 130)] });
      await page.waitForTimeout(40); assert.equal((await snapshot()).sheep.grounded, true); await touch("touchCancel");
      run.checks.push("second-finger swipe cannot take ownership; cancellation clears both touches");
      await tap(330, 180); await page.waitForTimeout(60); s = await snapshot(); assert.ok(s.sheep.velocityY < 0); assert.equal(s.sheep.animation, "sheep-jump");
      await page.screenshot({ path: resolve(output, `${id}-jump.png`) }); run.checks.push("start button does not jump, touchcancel clears input, original tap jump animates, pause avoids simulated capsule");
      await restart(); await swipe(true); await page.waitForTimeout(30); assert.ok((await snapshot()).sheep.velocityY < -350);
      await page.waitForTimeout(900); await swipe(false); await page.waitForTimeout(30); assert.equal((await snapshot()).sheep.height, 30);
      await page.waitForTimeout(340); assert.equal((await snapshot()).sheep.height, 42); run.checks.push("original incremental high swipe, crouch geometry and 320ms expiry");
      await button("pause"); const frozen = await snapshot(); await page.waitForTimeout(120); assert.equal((await snapshot()).physicsSteps, frozen.physicsSteps);
      const b = frozen.buttons.find(button => button.id === "resume").rect;
      await touch("touchStart", b.x + b.width / 2, b.y + b.height / 2); await touch("touchCancel"); assert.equal((await snapshot()).screen, "paused");
      await page.screenshot({ path: resolve(output, `${id}-pause.png`) });
      await page.evaluate(() => harness.emit("Hide")); const hidden = await snapshot(); await page.waitForTimeout(250);
      assert.equal((await snapshot()).frames, hidden.frames); assert.equal((await snapshot()).activeMs, frozen.activeMs);
      assert.ok(await page.evaluate(() => harness.audio.every(a => !a.playing)));
      await page.evaluate(() => harness.emit("Show")); await page.waitForTimeout(100); assert.equal((await snapshot()).screen, "paused");
      assert.equal((await snapshot()).activeMs, frozen.activeMs); await button("resume"); run.checks.push("pause and facade background freeze physics/time/audio; show requires a new resume touch");
      await restart(); await page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().screen === "result", null, { timeout: 6500 });
      s = await snapshot(); assert.ok(s.physicsSteps > 60); assert.ok(s.result.score >= 50); assert.equal(s.result.coinsEarned, Math.min(20, Math.floor(s.result.score / 25)));
      assert.equal(s.progress.highScore, s.result.best); assert.equal(s.progress.coins, s.result.coinBalance);
      const coins = s.progress.coins; await page.waitForTimeout(200); assert.equal((await snapshot()).progress.coins, coins);
      await page.screenshot({ path: resolve(output, `${id}-result.png`) }); run.checks.push("real Arcade hazard ends run, original scoring/coin formula settles once, canvas result");
      await button("restart"); assert.equal((await snapshot()).score < 20, true); await button("pause"); await button("home"); assert.equal((await snapshot()).screen, "menu");
      assert.equal((await snapshot()).audio.error, ""); assert.ok((await snapshot()).audioPlays > 0);
      await button("start"); await page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().screen === "result", null, { timeout: 6500 });
      assert.equal((await snapshot()).progress.coins, coins + (await snapshot()).result.coinsEarned);
      const coinsAfterSecond = (await snapshot()).progress.coins; await button("home");
      run.checks.push("second natural collision advances physics and rewards once after repeated scene disposal/start");
      await page.reload(); await page.waitForFunction(() => window.__SHEEP_WX_POC__?.snapshot().ready);
      s = await snapshot(); assert.equal(s.progress.coins, coinsAfterSecond); assert.equal(s.progress.highScore > 0, true);
      assert.equal(await page.evaluate(() => localStorage.getItem("sheep-run-save")), "WEB_SAVE_SENTINEL");
      assert.equal(await page.evaluate(() => localStorage.getItem("sheep-run-wechat-poc-v1")), "POC_SENTINEL");
      assert.deepEqual(await page.evaluate(() => [...new Set(harness.storageCalls.map(call => call.key))]), ["sheep-run-wechat-save-v1"]);
      assert.ok(await page.evaluate(() => Object.values(harness.events).every(set => set.size === 1)));
      run.checks.push("result restart, pause home, full fresh bundle reload preserves formal save/settings; no legacy key access or duplicate raw listeners");
      run.snapshot = s; run.events = await page.evaluate(() => __SHEEP_WX_POC__.events); assert.deepEqual(t.errors, []); assert.deepEqual(s.errors, []); run.status = "PASS";
    } catch (error) { run.status = "FAIL"; run.failure = String(error); run.snapshot = await snapshot(); run.events = await page.evaluate(() => window.__SHEEP_WX_POC__?.events); await page.screenshot({ path: resolve(output, `${id}-failure.png`) }); throw error; }
    finally { await t.context.close(); }
  }
  // Keep gameplay intact; this bot only observes positions and sends real touch gestures.
  if (process.env.WECHAT_REVIEW_LONG === "1") {
    const t = await session(), run = { id: "touch-bot-continuous", samples: [], recent: [], actions: [], checks: [], errors: t.errors }; report.runs.push(run);
    await t.boot(); await t.button("start"); const start = Date.now(); let lastAction = 0;
    while (Date.now() - start < 65000) {
      const s = await t.snapshot(); run.recent.push(s); if (run.recent.length > 50) run.recent.shift();
      if (s.screen !== "run") { run.snapshot = s; run.events = await t.page.evaluate(() => __SHEEP_WX_POC__.events); await t.page.screenshot({ path: resolve(output, "touch-bot-collision.png") }); }
      assert.equal(s.screen, "run", "touch bot collided; this is not evidence of 60s continuous gameplay");
      const hazard = s.obstacles.filter(o => o.active && o.x + o.width > s.sheep.x - 16).sort((a, b) => a.x - b.x)[0];
      const overhead = hazard && ["FlyingBird", "HangingVine", "HangingBranch", "HangingLantern", "FlyingGoose"].includes(hazard.kind);
      const dx = hazard ? hazard.x - s.sheep.x : Infinity;
      if (s.sheep.grounded && Date.now() - lastAction > 350 && dx < s.speed * (overhead ? .1 : hazard?.kind === "TallStack" ? .36 : .3) + 16) { run.actions.push({ at: s.activeMs, kind: overhead ? "crouch" : "high", hazard: hazard.kind, dx }); await t.swipe(!overhead, true); lastAction = Date.now(); }
      else if (s.collectedThisRun === 0 && s.sheep.grounded && Date.now() - lastAction > 700 && dx > s.speed * 1.4 && s.stars.some(star => star.active && !star.missed && star.x > s.sheep.x && star.x - s.sheep.x < s.speed * .32)) { run.actions.push({ at: s.activeMs, kind: "star-jump" }); await t.tap(330, 180); lastAction = Date.now(); }
      if (!run.samples.length || s.activeMs - run.samples.at(-1).activeMs > 5000) run.samples.push(s);
      await t.page.waitForTimeout(25);
    }
    const s = await t.snapshot(); assert.ok(s.activeMs >= 60000); assert.ok(s.collectedThisRun > 0); assert.ok(s.physicsSteps > 3000);
    assert.deepEqual(t.errors, []); assert.equal(s.audio.error, "");
    run.elapsedWallMs = Date.now() - start; run.snapshot = s; run.events = await t.page.evaluate(() => __SHEEP_WX_POC__.events);
    run.checks.push("65s browser-only touch bot, unchanged spawner/physics, accepted real star overlaps, no repeated pickup"); run.status = "PASS";
    await t.page.screenshot({ path: resolve(output, "touch-bot-continuous.png") }); await t.context.close();
  }
  for (const query of ["?storageDenied", "?malformedStorage", "?musicDenied", "?bare"]) {
    const t = await session(896, 414, 1, query), run = { id: query, checks: [] }; report.runs.push(run); await t.boot();
    if (query === "?bare") { await t.button("start"); await t.page.waitForTimeout(250); assert.ok((await t.snapshot()).physicsSteps > 5); assert.deepEqual(t.errors, []); }
    else if (query === "?musicDenied") {
      await t.button("settings"); assert.ok((await t.snapshot()).audio.error); await t.page.evaluate(() => harness.musicDenied = false); await t.button("retry-settings");
      await t.page.waitForTimeout(250); assert.equal((await t.snapshot()).audio.musicState, "ready"); assert.equal((await t.snapshot()).audio.error, "");
    } else {
      assert.equal((await t.snapshot()).progressLoaded, false); await t.button("settings"); await t.button("sfx"); await t.button("back"); await t.button("start");
      await t.page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().screen === "result", null, { timeout: 6500 });
      assert.equal((await t.snapshot()).result.saveFailed, true);
      assert.equal(await t.page.evaluate(() => harness.storageCalls.filter(call => call.op === "write").length), 0);
      if (query === "?malformedStorage") assert.deepEqual(await t.page.evaluate(() => JSON.parse(localStorage.getItem("sheep-run-wechat-save-v1"))), { version: 999, coins: 713 });
    }
    run.snapshot = await t.snapshot(); run.status = "PASS"; await t.context.close();
  }
  const t = await session(); let missing = true;
  await t.page.route("**/assets/star.png", route => missing ? route.fulfill({ status: 404, body: "injected missing real asset" }) : route.continue());
  await t.page.goto(url); await t.page.waitForFunction(() => harness.modals.some(modal => modal.title === "资源加载失败"));
  assert.equal((await t.snapshot()).ready, false); missing = false;
  await t.page.evaluate(() => harness.modals.at(-1).success({ confirm: true }));
  await t.page.waitForFunction(() => window.__SHEEP_WX_POC__.snapshot().ready); assert.equal((await t.snapshot()).screen, "menu");
  report.runs.push({ id: "real-critical-image-retry", status: "PASS", snapshot: await t.snapshot() }); await t.context.close();
  const stalled = await session(896, 414, 1, "?stalled"); await stalled.page.goto(url + "?stalled");
  // The injected rAF is deliberately stalled, so the assertion must poll by timer too.
  await stalled.page.waitForFunction(() => window.__SHEEP_WX_POC__?.snapshot().failed, null, { timeout: 9000, polling: 100 });
  assert.ok((await stalled.snapshot()).errors.some(error => error.includes("main loop stalled")));
  report.runs.push({ id: "stalled-frame-explicit-error", status: "PASS", snapshot: await stalled.snapshot() }); await stalled.context.close();
  report.status = "PASS";
} catch (error) { report.status = "FAIL"; report.failure = String(error); throw error; }
finally { await writeFile(resolve(output, "review.json"), JSON.stringify(report, null, 2)); await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ status: report.status, scope: report.scope, output, buildId: report.build.identity.id })); }
