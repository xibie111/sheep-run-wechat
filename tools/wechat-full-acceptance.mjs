/** Original full-scene touch acceptance on a browser facade. Never WeChat/device proof. */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { browserFacadeHtml } from "./wechat-browser-facade.mjs";
import { collectUiLayout } from "./wechat-ui-layout-audit.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UI_PLAYWRIGHT_PATH || "playwright");
const root = resolve(import.meta.dirname, ".."), pkg = resolve(root, process.env.WECHAT_FULL_PACKAGE ?? "builds/wechat-full");
const output = resolve(root, process.env.WECHAT_FULL_REVIEW_OUTPUT ?? `reports/wechat-full/${new Date().toISOString().replace(/\D/g, "")}-browser`);
const screen = { width: Number(process.env.WECHAT_FULL_WIDTH ?? 896), height: Number(process.env.WECHAT_FULL_HEIGHT ?? 414), dpr: Number(process.env.WECHAT_FULL_DPR ?? 1) };
assert.ok(Object.values(screen).every(value => Number.isFinite(value) && value > 0), "invalid local test viewport");
await mkdir(output, { recursive: true });
const html = browserFacadeHtml.replace("fetch('music/game.js')", "fetch(o.name+'/game.js')");
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1);
  if (!name) { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(html); return; }
  if (name === "favicon.ico") { res.writeHead(204); res.end(); return; }
  const path = resolve(pkg, name);
  if (!path.startsWith(pkg + "/") && !path.startsWith(pkg + "\\")) { res.writeHead(403); res.end(); return; }
  try { const bytes = await readFile(path); res.setHeader("content-type", ({ ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".wav": "audio/wav" })[extname(path)] ?? "application/octet-stream"); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`, prefix = "sheep-run-wechat-full-v1/";
const browser = await chromium.launch({ headless: true, channel: "msedge", args: ["--autoplay-policy=no-user-gesture-required"] });
const report = { scope: "FULL_ORIGINAL_SCENES_BROWSER_FACADE_NOT_WECHAT", browser: browser.version(), scriptSha256: createHash("sha256").update(await readFile(import.meta.filename)).digest("hex"), build: JSON.parse(await readFile(resolve(pkg, "build-manifest.json"), "utf8")), runs: [], status: "RUNNING" };
let current;
async function session(id, { fixtures = {}, query = "", width = screen.width, height = screen.height, dpr = screen.dpr } = {}) {
  const run = { id, fixtureKeys: Object.keys(fixtures), window: { width, height, dpr }, checks: [], errors: [], status: "RUNNING" }; report.runs.push(run); current = run;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: dpr });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const runtime = JSON.parse(await readFile(resolve(pkg, "runtime.json"), "utf8"));
  if (runtime.assetBaseUrl && new URL(runtime.assetBaseUrl).hostname.endsWith(".invalid")) {
    run.remoteTransport = "TEST_FIXTURE_LOCAL_BYTES_INTERCEPT_NOT_REAL_HOST";
    await page.route(runtime.assetBaseUrl + "**", async route => {
      const path = new URL(route.request().url()).pathname.slice(new URL(runtime.assetBaseUrl).pathname.length);
      assert.ok(report.build.remoteFiles.some(file => file.path === path));
      await route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: await readFile(resolve(root, report.build.remoteDirectory, path)) });
    });
  }
  page.on("pageerror", error => run.errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error" || /Texture.*missing|Frame.*not found/.test(message.text())) run.errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) run.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.addInitScript(({ fixtures, prefix }) => {
    if (!location.protocol.startsWith("http") || sessionStorage.getItem("full-fixtures")) return;
    for (const [key, value] of Object.entries(fixtures)) localStorage.setItem(prefix + key, JSON.stringify(JSON.stringify(value)));
    sessionStorage.setItem("full-fixtures", "1");
  }, { fixtures, prefix });
  const snapshot = () => page.evaluate(() => GameGlobal.__SHEEP_WX_FULL__?.snapshot());
  const catalog = () => page.evaluate(() => GameGlobal.__SHEEP_WX_FULL__.catalog());
  async function waitScene(key) { await page.waitForFunction(key => GameGlobal.__SHEEP_WX_FULL__?.game().scene.isActive(key), key); }
  async function boot() {
    const started = performance.now(); await page.goto(url + query); await waitScene("MenuScene"); const s = await snapshot(); run.browserFacadeBootMs = Math.round(performance.now() - started);
    assert.equal(s.ready, true); assert.equal(s.buildId, report.build.buildId); assert.deepEqual(s.errors, []); assert.equal(await page.locator("canvas").count(), 1, "DOM display canvas leaked");
    if (report.build.renderer === "canvas") assert.equal(s.renderer, "CANVAS"); if (report.build.renderer === "webgl") assert.equal(s.renderer, "WEBGL"); run.bootRenderer = s.renderer;
  }
  async function buttons() { return page.evaluate(() => {
    const rows = []; for (const scene of GameGlobal.__SHEEP_WX_FULL__.game().scene.getScenes(true)) {
      const walk = (list, shown = true) => { for (const object of list) {
        const visible = shown && object.visible !== false && object.active !== false;
        if (object.input?.enabled && visible) { const b = object.getBounds(); rows.push({ scene: scene.sys.settings.key, name: object.name, x: b.centerX, y: b.centerY, scrollX: object.scrollFactorX, scrollY: object.scrollFactorY }); }
        if (object.list) walk(object.list, visible);
      } }; walk(scene.children.list);
    } return rows;
  }); }
  async function position(name) {
    const list = await buttons(), target = list.find(button => button.name === name); assert.ok(target, `Missing touch target ${name}: ${list.map(item => item.name).join(", ")}`);
    return page.evaluate(target => {
      const game = GameGlobal.__SHEEP_WX_FULL__.game(), { view } = GameGlobal.__SHEEP_WX_FULL__.snapshot(), camera = game.scene.getScene(target.scene).cameras.main;
      return { x: view.left + (target.x - camera.scrollX * target.scrollX) * view.fit, y: view.top + (target.y - camera.scrollY * target.scrollY) * view.fit };
    }, target);
  }
  async function press(name, waitAssets = true) {
    const p = await position(name); await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(100);
    if (waitAssets) await page.waitForFunction(() => !GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive("WxAssetScene") || !!GameGlobal.__SHEEP_WX_FULL__.snapshot().resources.error, null, { timeout: 25000 });
    if (process.env.WECHAT_FULL_UI_AUDIT === "1") {
      (run.uiLayouts ??= []).push({ after: name, ...await page.evaluate(collectUiLayout) });
    }
  }
  async function swipe(high, hold = false) {
    const x = width * .67, y = height * .56;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] }); await page.waitForTimeout(20);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (high ? -75 : 75), id: 1 }] }); await page.waitForTimeout(60);
    const state = await snapshot(); if (!hold) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); return state;
  }
  async function cancel() { await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }); await page.waitForTimeout(60); }
  async function surface(kind) { return (await snapshot()).surfaces.find(item => item.visible && item.metadata.adventureOverlay === kind)?.metadata; }
  async function shot(name) {
    await page.screenshot({ path: resolve(output, `${id}-${name}.png`) });
    if (process.env.WECHAT_FULL_UI_AUDIT === "1") (run.uiLayouts ??= []).push({ shot: name, ...await page.evaluate(collectUiLayout) });
  }
  async function finish(allowedErrors = []) {
    run.snapshot = await snapshot(); run.events = await page.evaluate(() => GameGlobal.__SHEEP_WX_HOST__.events); assert.deepEqual(run.snapshot.errors, []);
    if (process.env.WECHAT_FULL_UI_AUDIT === "1") assert.deepEqual((run.uiLayouts ?? []).flatMap(layout => layout.issues), [], "visible UI text overlaps or exceeds its field");
    assert.deepEqual(run.errors.filter(error => !allowedErrors.some(pattern => pattern.test(error))), []); assert.equal(run.snapshot.audio.error, "");
    if (allowedErrors.length) run.expectedInjectedErrors = [...run.errors];
    assert.ok(await page.evaluate(() => Object.values(harness.events).every(set => set.size === 1)), "raw wx listeners duplicated");
    assert.equal(await page.evaluate(() => localStorage.getItem("sheep-run-save")), "WEB_SAVE_SENTINEL"); assert.equal(await page.evaluate(() => localStorage.getItem("sheep-run-wechat-poc-v1")), "POC_SENTINEL");
    run.status = "PASS"; await context.close();
  }
  run._page = page; return { run, page, context, cdp, snapshot, catalog, boot, waitScene, buttons, position, press, swipe, cancel, surface, shot, finish };
}
try {
  if (process.env.WECHAT_FULL_MISSING_HOST === "1") {
    const t = await session("missing-own-resource-host"); await t.boot(); await t.press("button:开始游戏");
    assert.ok((await t.snapshot()).resources.error.includes("assetBaseUrl")); assert.equal(await t.page.evaluate(() => GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive("RunScene")), false);
    await t.shot("explicit-error"); await t.press("button:返回"); await t.waitScene("MenuScene");
    t.run.checks.push("same default package boots real menu; missing owned resource URL blocks full run explicitly and permits return, no placeholder or fake scene");
    await t.finish([/^\[sheep-wx-full\] resource load failed Error: 未配置本项目的 HTTPS 素材地址/]); report.status = "PASS";
  } else {
  if (process.env.WECHAT_FULL_ONLY_CONTENT !== "1") {
  const t = await session("full-features"); await t.boot(); report.catalog = await t.catalog(); await t.shot("menu");
  const noPrivateContent = report.build.contentProfile === "no-easter-eggs-or-private-letters";
  if (noPrivateContent) {
    assert.ok(!(await t.buttons()).some(button => button.name.startsWith("easter-egg:")));
    const sheep = await t.page.evaluate(() => { const api = GameGlobal.__SHEEP_WX_FULL__, scene = api.game().scene.getScene("MenuScene"), b = scene.children.getByName("menu-sheep").getBounds(), v = api.snapshot().view;
      return { x: v.left + b.centerX * v.fit, y: v.top + b.centerY * v.fit }; });
    for (let tap = 0; tap < 3; tap++) await t.page.touchscreen.tap(sheep.x, sheep.y);
    assert.ok(!(await t.snapshot()).surfaces.some(surface => surface.metadata.easterEgg));
    assert.ok((await t.buttons()).some(button => button.name === "button:开始游戏"));
    t.run.checks.push("WeChat content removal: no menu/bedtime/score Easter-egg surface or target; triple tapping the real sheep leaves the menu usable");
  }
  await t.press("button:微信设置"); await t.waitScene("WxSettingsScene"); await t.press("settings:music-down"); await t.press("settings:sfx-toggle");
  assert.equal((await t.snapshot()).save.settings.musicVolume, .9); assert.equal((await t.snapshot()).save.settings.sfx, false);
  await t.press("settings:sfx-toggle"); await t.shot("settings");
  if ((await t.snapshot()).renderer === "CANVAS") {
    t.run.canvasPanelSample = await t.page.evaluate(() => { const canvas = GameGlobal.__SHEEP_WX_FULL__.game().canvas; return [...canvas.getContext("2d").getImageData(Math.floor(canvas.width * .52), Math.floor(canvas.height * .74), 1, 1).data]; });
    const [r, g, b] = t.run.canvasPanelSample; assert.ok(r > 200 && g > 150 && b > 90, "original paper panel is invisible in the actual Canvas framebuffer");
  }
  await t.press("button:返回"); await t.waitScene("MenuScene");
  t.run.checks.push("canvas settings persist original channel toggles and volume");
  await t.press("button:收藏册"); for (const season of ["spring", "summer", "autumn", "winter"]) { await t.press("collection-tab:" + season); await t.press("collection-card:0"); }
  await t.shot("collection-winter"); await t.press("button:合上收藏册"); await t.press("button:成就册");
  await t.press("achievement-card:0"); await t.shot("achievement-detail"); await t.press("button:合上手账"); let journalPages = 1;
  while ((await t.buttons()).some(item => item.name === "journey-next")) { await t.press("journey-next"); journalPages++; assert.ok(journalPages < 20); }
  await t.shot("journal-last-page"); await t.press("button:合上手账"); t.run.checks.push(`collection four seasons/cards and journey ${journalPages} pages/detail/close`);
  await t.press("mailbox-entry");
  if (noPrivateContent) {
    assert.ok(!(await t.buttons()).some(button => button.name.startsWith("mailbox-letter:")));
    const lines = JSON.parse((await t.surface("mailbox")).lines).map(line => line.text);
    assert.ok(!lines.includes("私人信件")); assert.ok(lines.includes("送信小旅行")); assert.ok(lines.includes("居民故事"));
    await t.shot("mailbox-no-private-letters");
    t.run.checks.push("both personal letters and their empty list are absent; original delivery and resident entries remain usable");
  } else {
    await t.press("mailbox-letter:welcome-v1"); let letterPages = 1;
    while ((await t.buttons()).some(item => item.name === "mailbox-next")) { await t.press("mailbox-next"); letterPages++; assert.ok(letterPages < 25); }
    await t.shot("letter-final"); await t.press("mailbox-keep"); assert.ok(JSON.parse((await t.surface("mailbox")).readIds).includes("welcome-v1"));
    t.run.checks.push(`original Chinese letter ${letterPages} pages and persisted read record`);
  }
  await t.press("mailbox-delivery"); const chapterIds = new Set(); let pages = 0;
  do {
    const panel = await t.surface("delivery-panel"); assert.ok(panel); for (const id of JSON.parse(panel.visibleChapterIds)) chapterIds.add(id); await t.shot("delivery-page-" + pages++);
    if (!(await t.buttons()).some(item => item.name === "delivery-next")) break; await t.press("delivery-next"); assert.ok(pages < 15);
  } while (true);
  assert.deepEqual([...chapterIds].sort(), (await t.catalog()).chapters.map(item => item.id).sort()); t.run.checks.push(`all ${chapterIds.size} original chapters listed with original locks`);
  while ((await t.buttons()).some(item => item.name === "delivery-previous")) await t.press("delivery-previous");
  await t.press("delivery-album"); await t.shot("stamp-album"); await t.press("delivery-back"); await t.press("delivery-back"); await t.press("mailbox-residents");
  for (const resident of (await t.catalog()).residents) { await t.press("resident-resident:" + resident.id); await t.shot("resident-" + resident.id); await t.press("resident-back"); }
  await t.press("resident-letters"); await t.shot("resident-letters"); await t.press("resident-back"); await t.press("resident-back"); await t.press("button:合上邮箱");
  t.run.checks.push("resident profiles/stage locks/letters and nested modal returns use actual touch ownership");
  await t.page.setViewportSize({ width: 1200, height: 675 }); await t.page.waitForTimeout(150);
  await t.press("button:衣橱"); await t.waitScene("WardrobeScene"); await t.press("button:返回"); await t.waitScene("MenuScene");
  await t.page.setViewportSize({ width: screen.width, height: screen.height }); await t.page.waitForTimeout(150);
  t.run.checks.push("wx resize owns a wider screen and keeps the far-right wardrobe touch target usable");
  await t.press("button:衣橱"); const skinIds = new Set();
  for (let page = 0; page < 8; page++) { const cards = (await t.buttons()).filter(item => item.name.startsWith("skin-card:")); for (const card of cards) { skinIds.add(card.name.slice(10)); await t.press(card.name); } await t.shot("wardrobe-" + page); if (page < 7) await t.press("button:page-next"); }
  assert.deepEqual([...skinIds].sort(), (await t.catalog()).skins.map(item => item.id).sort()); await t.press("button:返回"); t.run.checks.push("all 36 original sheep skins and eight wardrobe pages render via actual touch");
  await t.press("button:开始游戏"); await t.waitScene("RunScene"); await t.page.touchscreen.tap(screen.width * .67, screen.height * .67); await t.page.waitForTimeout(60);
  const jump = await t.snapshot(); assert.ok(jump.run.sheep.velocityY < 0); t.run.jump = jump.run.sheep; await t.shot("jump"); await t.press("button:暂停"); const paused = await t.snapshot();
  assert.ok(paused.scenes.some(scene => scene.key === "RunScene" && scene.paused)); await t.page.waitForTimeout(250); assert.equal((await t.snapshot()).run.activeMs, paused.run.activeMs);
  await t.press("button:微信设置"); await t.press("button:返回"); await t.press("button:重新开始"); await t.waitScene("RunScene");
  const high = await t.swipe(true, true); assert.ok(high.run.sheep.velocityY < -250); await t.cancel(); await t.page.waitForFunction(() => GameGlobal.__SHEEP_WX_FULL__.snapshot().run.sheep.grounded);
  const crouch = await t.swipe(false, true); assert.ok(crouch.run.sheep.height < high.run.sheep.height); await t.cancel(); assert.equal((await t.snapshot()).run.sheep.height, high.run.sheep.height);
  if (noPrivateContent) assert.ok(!(await t.snapshot()).surfaces.some(surface => surface.metadata.easterEgg));
  t.run.checks.push("tap/high swipe/held crouch/cancel/pause/restart run the original Arcade and gesture rules");
  await t.press("button:暂停"); await t.press("button:重新开始"); await t.waitScene("RunScene");
  const firstFinger = { x: screen.width * .67, y: screen.height * .48, id: 1 }, secondFinger = { x: screen.width * .74, y: screen.height * .58, id: 2 };
  await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [firstFinger] });
  await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [firstFinger, secondFinger] });
  await t.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [firstFinger, { ...secondFinger, y: screen.height * .34 }] });
  await t.cancel(); assert.equal((await t.snapshot()).run.sheep.grounded, true);
  t.run.checks.push("second finger's swipe cannot own a jump; native touchcancel clears both pointers");
  await t.page.evaluate(() => harness.emit("Hide")); const hidden = await t.snapshot(); await t.page.waitForTimeout(10100);
  assert.equal((await t.snapshot()).physicsSteps, hidden.physicsSteps); assert.equal((await t.snapshot()).run.activeMs, hidden.run.activeMs); assert.equal(await t.page.evaluate(() => harness.audio.some(item => item.playing)), false);
  await t.page.evaluate(() => harness.emit("Show")); await t.page.waitForTimeout(200); assert.equal((await t.snapshot()).run.activeMs, hidden.run.activeMs); await t.press("button:继续游戏"); await t.waitScene("RunScene");
  t.run.checks.push("10s facade background sleeps sole loop/physics/time/audio, foreground retains pause");
  await t.page.waitForFunction(() => GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive("ResultScene"), null, { timeout: 10000 }); const result = (await t.snapshot()).result;
  if (noPrivateContent) {
    const names = await t.page.evaluate(() => { const walk = list => list.flatMap(object => [object.name, ...(object.list ? walk(object.list) : [])]); return walk(GameGlobal.__SHEEP_WX_FULL__.game().scene.getScene("ResultScene").children.list); });
    assert.ok(!names.includes("result-whisper") && !names.includes("result-new-record"));
    t.run.checks.push("personal result whispers removed while natural collision, record art and earned coins keep the original rules");
  }
  assert.ok(result.score > 0); assert.ok(result.coinsEarned > 0); assert.equal(result.saveFailed, undefined); await t.shot("result"); await t.press("button:查看这次旅行"); await t.shot("trip-card"); await t.press("button:收好旅行卡");
  await t.press("button:再跑一次"); await t.waitScene("RunScene"); await t.press("button:暂停"); await t.press("button:返回首页"); const saved = (await t.snapshot()).save;
  await t.page.reload(); await t.waitScene("MenuScene"); assert.deepEqual((await t.snapshot()).save, saved); await t.press("mailbox-entry");
  if (noPrivateContent) assert.ok(!(await t.buttons()).some(button => button.name.startsWith("mailbox-letter:")));
  else assert.ok(JSON.parse((await t.surface("mailbox")).readIds).includes("welcome-v1"));
  await t.press("button:合上邮箱");
  t.run.checks.push("natural obstacle death/original reward/trip card/retry/home/fresh bundle reload preserve save/letter/settings"); await t.finish();

  const funded = { version: 5, highScore: 0, totalStars: 200, spentStars: 0, coins: 1000, selectedSkin: "white", unlockedSkins: ["white"], upgrades: { jump: 0, speed: 0, magnet: 0, dash: 0 }, settings: { music: true, sfx: true, musicVolume: 1, sfxVolume: 1 } };
  const p = await session("purchase-fixture", { fixtures: { "sheep-run-save": funded } }); await p.boot(); await p.press("button:衣橱");
  await p.press("skin-card:black"); await p.press("button:解锁"); assert.equal((await p.snapshot()).save.totalStars, 200); assert.equal((await p.snapshot()).save.spentStars, 0);
  await p.press("skin-card:golden"); await p.press("button:购买"); assert.equal((await p.snapshot()).save.coins, 960); await p.press("button:装备"); assert.equal((await p.snapshot()).save.selectedSkin, "golden");
  for (let page = 0; !(await p.buttons()).some(item => item.name === "skin-card:strawberry-v1"); page++) { assert.ok(page < 8); await p.press("button:page-next"); }
  await p.press("skin-card:strawberry-v1"); await p.press("button:购买"); assert.equal((await p.snapshot()).save.totalStars, 200); assert.equal((await p.snapshot()).save.spentStars, 40);
  await p.press("button:装备"); await p.press("button:返回"); await p.press("button:开始游戏"); await p.waitScene("RunScene"); assert.equal((await p.snapshot()).run.skinId, "strawberry-v1"); await p.shot("equipped-run");
  await p.press("button:暂停"); await p.press("button:返回首页"); await p.press("button:开始游戏"); await p.waitScene("RunScene");
  assert.equal(await p.page.evaluate(() => { const game = GameGlobal.__SHEEP_WX_FULL__.game(), sheep = game.scene.getScene("RunScene").sheep; return sheep.anims.currentFrame.frame.texture === game.textures.get(sheep.texture.key); }), true, "animation still points at a released texture");
  await p.press("button:暂停"); await p.press("button:返回首页"); await p.page.reload(); await p.waitScene("MenuScene"); assert.equal((await p.snapshot()).save.selectedSkin, "strawberry-v1"); assert.equal((await p.snapshot()).save.spentStars, 40);
  p.run.checks.push("isolated funded TEST FIXTURE: cumulative unlock does not spend; coin/star purchases and equip retain exact rules and persist into actual RunScene/reload"); await p.finish();

  const invalid = { version: 999, coins: 713 }, f = await session("invalid-save-preservation", { fixtures: { "sheep-run-save": invalid } }); await f.boot();
  assert.ok((await f.snapshot()).storageErrors.some(item => item.key === "sheep-run-save")); await f.press("button:微信设置"); await f.press("settings:sfx-toggle");
  assert.equal((await f.snapshot()).audio.settings.sfx, false, "session mute must work while persistence is blocked"); await f.press("button:重试");
  assert.equal((await f.snapshot()).audio.settings.sfx, false, "failed retry must preserve session mute");
  assert.deepEqual(await f.page.evaluate(prefix => JSON.parse(JSON.parse(localStorage.getItem(prefix + "sheep-run-save"))), prefix), invalid);
  assert.equal(await f.page.evaluate(() => harness.storageCalls.filter(call => call.op === "write" && call.key.endsWith("/sheep-run-save")).length), 0);
  f.run.checks.push("unsupported save remains intact through settings/retry with no default primary write"); await f.shot("error"); await f.finish();
  const m = await session("music-retry", { query: "?musicDenied" }); await m.boot(); await m.press("button:微信设置"); assert.ok((await m.snapshot()).audio.error);
  await m.page.evaluate(() => harness.musicDenied = false); await m.press("button:重试"); await m.page.waitForTimeout(300); assert.equal((await m.snapshot()).audio.error, ""); assert.ok((await m.snapshot()).audio.plays > 0);
  m.run.checks.push("explicit native music subpackage retry; callback is not device audibility"); await m.finish();
  if (process.env.WECHAT_FULL_FAILURES === "1") {
    const i = await session("critical-font-retry"), font = JSON.parse(await readFile(resolve(pkg, "runtime.json"), "utf8")).textures.find(texture => texture.key === "pasture-display-64"); let deny = true;
    await i.page.route("**/" + font.file, route => deny ? route.fulfill({ status: 404, body: "injected missing genuine font image" }) : route.continue());
    await i.page.goto(url); await i.page.waitForFunction(() => harness.modals.some(modal => modal.title === "资源加载失败")); assert.equal((await i.snapshot()).ready, false);
    deny = false; await i.page.evaluate(() => harness.modals.at(-1).success({ confirm: true })); await i.waitScene("MenuScene");
    i.run.checks.push("real original Chinese font image failure blocks ready; native retry reloads the exact genuine resource");
    await i.finish([/^HTTP 404 .*\.png$/, /^Failed to load resource:.*404/, /^WX_FACADE_MODAL 资源加载失败 Error: Images failed: pasture-display-64$/]);
    const j = await session("critical-json-retry"); let jsonDenied = true;
    await j.page.route("**/runtime.json", route => jsonDenied ? route.fulfill({ status: 404, body: "injected missing genuine runtime manifest" }) : route.continue());
    await j.page.goto(url); await j.page.waitForFunction(() => harness.modals.some(modal => modal.title === "资源加载失败")); assert.equal((await j.snapshot()).ready, false);
    jsonDenied = false; await j.page.evaluate(() => harness.modals.at(-1).success({ confirm: true })); await j.waitScene("MenuScene");
    j.run.checks.push("runtime atlas/font/animation JSON missing never starts a substitute game; native retry restores exact manifest");
    await j.finish([/^HTTP 404 .*\/runtime\.json$/, /^Failed to load resource:.*404/, /^WX_FACADE_MODAL 资源加载失败 运行资源清单加载失败$/]);
    const a = await session("deferred-art-retry"); await a.boot(); const runtime = JSON.parse(await readFile(resolve(pkg, "runtime.json"), "utf8")), texture = runtime.textures.find(texture => texture.key === "scenery-rainbow"); let imageDenied = true;
    await a.page.route("**/" + texture.file, async route => {
      if (imageDenied) { await route.fulfill({ status: 404, body: "injected missing genuine postcard" }); return; }
      const assetRoot = texture.remote ? resolve(root, report.build.remoteDirectory) : pkg;
      await route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: await readFile(resolve(assetRoot, texture.file)) });
    });
    await a.press("button:成就册"); assert.ok((await a.snapshot()).resources.error.includes("scenery-rainbow")); await a.shot("failure");
    imageDenied = false; await a.press("assets:continue"); assert.equal((await a.snapshot()).resources.error, ""); assert.equal((await a.surface("journey-book"))?.open, "true");
    a.run.checks.push("deferred genuine postcard failure stays on canvas retry; original journey opens only after image successfully loads");
    await a.finish([/^HTTP 404 .*\.png$/, /^Failed to load resource:.*404/, /^\[sheep-wx-full\] resource load failed Error: Images failed: scenery-rainbow$/]);
  }
  }
  if (process.env.WECHAT_FULL_ONLY_CONTENT === "1") { const meta = await session("catalog"); await meta.boot(); report.catalog = await meta.catalog(); await meta.finish(); }
  if (process.env.WECHAT_FULL_CHAPTERS === "1") {
    const c = await session("chapter-entry-fixture", { fixtures: { "sheep-run-delivery-v1": { version: 1, completedIds: report.catalog.chapters.map(chapter => chapter.id) } } });
    await c.boot(); c.run.chapters = [];
    await c.press("mailbox-entry"); await c.press("button:合上邮箱");
    c.run.menuDestroyListeners = await c.page.evaluate(() => GameGlobal.__SHEEP_WX_FULL__.game().scene.getScene("MenuScene").events.listenerCount("destroy"));
    c.run.listenerSamples = [];
    for (const chapter of report.catalog.chapters) {
      await c.press("mailbox-entry"); await c.press("mailbox-delivery");
      for (let page = 0; !(await c.buttons()).some(item => item.name === "delivery-chapter:" + chapter.id); page++) { assert.ok(page < 6); await c.press("delivery-next"); }
      await c.press("delivery-chapter:" + chapter.id); await c.press("delivery-start"); await c.waitScene("RunScene"); await c.page.waitForTimeout(600);
      const state = await c.snapshot(); assert.equal(state.run.delivery.chapterId, chapter.id); assert.ok(state.run.delivery.distance > 0); assert.ok(state.run.activeMs > 0); assert.deepEqual(state.errors, []);
      c.run.chapters.push({ id: chapter.id, run: state.run }); await c.shot(chapter.id);
      await c.press("button:暂停"); await c.press("button:返回首页"); await c.waitScene("MenuScene");
      // The original route exit reopens the mailbox.
      await c.press("button:合上邮箱");
      const listeners = await c.page.evaluate(() => GameGlobal.__SHEEP_WX_FULL__.game().scene.getScene("MenuScene").events.listenerCount("destroy"));
      c.run.listenerSamples.push(listeners); assert.equal(listeners, c.run.menuDestroyListeners, "scene restart retains old canvas cleanup callbacks");
    }
    await c.press("mailbox-entry"); await c.press("mailbox-residents"); await c.press("resident-group"); await c.shot("resident-group"); await c.press("resident-back");
    for (const resident of report.catalog.residents) {
      await c.press("resident-resident:" + resident.id); await c.press("resident-keepsake"); await c.shot("keepsake-" + resident.id); await c.press("resident-back"); await c.press("resident-back");
    }
    await c.press("resident-letters"); const letters = new Set();
    for (let step = 0; step < 20; step++) {
      const target = (await c.buttons()).find(item => item.name.startsWith("resident-letter:") && !letters.has(item.name));
      if (target) {
        await c.press(target.name); while ((await c.buttons()).some(item => item.name === "resident-next")) await c.press("resident-next");
        await c.shot("letter-" + target.name.replace(":", "-")); await c.press("resident-keep"); letters.add(target.name); continue;
      }
      if (!(await c.buttons()).some(item => item.name === "resident-next")) break; await c.press("resident-next");
    }
    assert.equal(letters.size, 9); c.run.readResidentLetters = [...letters];
    await c.page.reload(); await c.waitScene("MenuScene"); const archive = await c.page.evaluate(prefix => JSON.parse(JSON.parse(localStorage.getItem(prefix + "sheep-run-mailbox-v1"))), prefix);
    assert.equal(archive.readIds.filter(id => id.startsWith("resident-")).length, 9);
    c.run.checks.push("isolated completed-ID TEST FIXTURE: all 11 original routes enter with real scenery/physics; original unlock-derived resident group and three keepsakes load on demand"); await c.finish();
  }
  if (process.env.WECHAT_FULL_ONLY_CONTENT === "1") {
    const idsIn = async file => [...(await readFile(resolve(root, file), "utf8")).matchAll(/\bid:\s*["']([^"']+)["']/g)].map(match => match[1]);
    const badges = await idsIn("src/data/pastureCollections.ts"), seenIds = await idsIn("src/scenery/sceneryCatalog.ts"); assert.equal(badges.length, 12); assert.equal(seenIds.length, 9);
    const b = await session("collection-and-postcard-fixture", { fixtures: { "sheep-run-collections-v1": { version: 1, badges }, "sheep-run-scenery-v1": { version: 1, seenIds } } });
    await b.boot(); await b.press("button:收藏册");
    for (const season of ["spring", "summer", "autumn", "winter"]) {
      await b.press("collection-tab:" + season); for (let card = 0; card < 3; card++) await b.press("collection-card:" + card);
      await b.press("collection-reward"); await b.shot("reward-" + season); await b.press("button:合上手账");
    }
    await b.press("collection-complete-reward"); let pages = 1;
    while ((await b.buttons()).some(item => item.name === "journey-next")) { await b.press("journey-next"); pages++; assert.ok(pages < 20); }
    await b.shot("complete-letter"); await b.press("button:合上手账"); await b.press("button:合上收藏册"); await b.press("button:成就册");
    const postcards = new Set();
    for (let page = 0; page < 16; page++) {
      const data = await b.surface("journey-book");
      if (Number(data.page) >= Number(data.sceneryStartPage)) for (const target of (await b.buttons()).filter(item => item.name.startsWith("achievement-card:"))) {
        await b.press(target.name); const card = await b.surface("journey-book"); assert.equal(card.mode, "postcard"); postcards.add(card.postcard); await b.shot("postcard-" + card.postcard); await b.press("button:合上手账");
      }
      if (!(await b.buttons()).some(item => item.name === "journey-next")) break; await b.press("journey-next");
    }
    assert.equal(postcards.size, 9); b.run.checks.push(`isolated badge/postcard TEST FIXTURE: all 12 collected cards, four seasonal reward letters, complete letter ${pages} pages and all nine original postcards render and keep original reading rules`); await b.finish();
  }
  if (process.env.WECHAT_FULL_ROUTE === "1") {
    const route = await session("natural-delivery-route"); await route.boot(); await route.press("mailbox-entry"); await route.press("mailbox-delivery");
    await route.press("delivery-chapter:hill-goodnight-v1"); await route.press("delivery-start"); await route.waitScene("RunScene");
    const start = Date.now(); let last = 0, endingShot = false; route.run.samples = []; route.run.actions = [];
    while (Date.now() - start < 95000) {
      const s = await route.snapshot(), run = s.run; assert.equal(run.delivery.chapterId, "hill-goodnight-v1"); assert.notEqual(run.delivery.state, "failed", "touch robot hit an authored obstacle");
      if (run.delivery.state === "complete") break;
      if (run.delivery.state === "ending" && !endingShot) { await route.page.waitForTimeout(2000); await route.shot("original-ending"); endingShot = true; continue; }
      const hazard = run.obstacles.filter(o => o.x + o.width > run.sheep.x - 16).sort((a, b) => a.x - b.x)[0];
      const overhead = hazard && ["FlyingBird", "HangingVine", "HangingBranch", "HangingLantern", "FlyingGoose"].includes(hazard.kind), dx = hazard ? hazard.x - run.sheep.x : Infinity;
      if (run.sheep.grounded && Date.now() - last > 350 && dx < run.speed * (overhead ? .1 : hazard?.kind === "TallStack" ? .36 : .3) + 16) {
        route.run.actions.push({ at: run.activeMs, kind: overhead ? "crouch" : "high", hazard: hazard.kind, dx }); await route.swipe(!overhead); last = Date.now();
      }
      if (!route.run.samples.length || run.activeMs - route.run.samples.at(-1).activeMs > 5000) route.run.samples.push(run); await route.page.waitForTimeout(25);
    }
    assert.equal((await route.snapshot()).run.delivery.state, "complete"); route.run.completed = (await route.snapshot()).run; await route.shot("success-panel");
    // The original non-challenge route shows its postcard in the success panel;
    // its separate postcard action is available from the completed chapter brief.
    if (!(await route.buttons()).some(item => item.name === "delivery-card")) {
      await route.press("delivery-back"); await route.waitScene("MenuScene"); await route.press("mailbox-delivery"); await route.press("delivery-chapter:hill-goodnight-v1");
    }
    await route.press("delivery-card"); await route.shot("postcard");
    await route.press("delivery-back"); await route.press("delivery-back"); await route.waitScene("MenuScene"); await route.page.reload(); await route.waitScene("MenuScene");
    const saved = await route.page.evaluate(prefix => JSON.parse(JSON.parse(localStorage.getItem(prefix + "sheep-run-delivery-v1"))), prefix); assert.ok(saved.completedIds.includes("hill-goodnight-v1"));
    route.run.elapsedWallMs = Date.now() - start; route.run.checks.push("unseeded original route naturally completed by touch robot, actual ending/postcard/success and persisted chapter completion; no speed/time/entity mutation"); await route.finish();
  }
  if (process.env.WECHAT_FULL_LONG === "1") {
    const observeMs = Number(process.env.WECHAT_FULL_LONG_MS ?? 65000);
    assert.ok(Number.isFinite(observeMs) && observeMs >= 65000 && observeMs <= 600000, "long observation must be 65–600 seconds");
    const l = await session("natural-touch-bot"); await l.boot(); await l.press("button:开始游戏");
    await l.page.evaluate(() => {
      const scene = GameGlobal.__SHEEP_WX_FULL__.game().scene.getScene("RunScene"), picked = new WeakSet(), frames = new Set();
      window.starAudit = { acceptedEpochs: 0, invalidCollectedBodies: 0, observedPhysicsSteps: 0, animationFrames: [] };
      scene.physics.world.on("worldstep", () => {
        starAudit.observedPhysicsSteps++; frames.add(String(scene.sheep.frame.name)); starAudit.animationFrames = [...frames];
        for (const star of scene.stars.getChildren()) {
          if (!star.collected) { picked.delete(star); continue; }
          if (star.active || star.visible || star.body.enable) starAudit.invalidCollectedBodies++;
          if (!picked.has(star)) { picked.add(star); starAudit.acceptedEpochs++; }
        }
      });
    });
    const started = Date.now(); let last = 0; l.run.samples = []; l.run.actions = [];
    while (Date.now() - started < observeMs) {
      const s = await l.snapshot(); assert.ok(s.scenes.some(scene => scene.key === "RunScene" && scene.active), "natural touch bot collided"); const run = s.run;
      const hazard = run.obstacles.filter(o => o.x + o.width > run.sheep.x - 16).sort((a, b) => a.x - b.x)[0], overhead = hazard && ["FlyingBird", "HangingVine", "HangingBranch", "HangingLantern", "FlyingGoose"].includes(hazard.kind), dx = hazard ? hazard.x - run.sheep.x : Infinity;
      if (run.sheep.grounded && Date.now() - last > 350 && dx < run.speed * (overhead ? .1 : hazard?.kind === "TallStack" ? .36 : .3) + 16) { l.run.actions.push({ at: run.activeMs, kind: overhead ? "crouch" : "high", hazard: hazard.kind, dx }); await l.swipe(!overhead); last = Date.now(); }
      else if (run.starCount === 0 && run.sheep.grounded && Date.now() - last > 700 && dx > run.speed * 1.4 && run.stars.some(star => !star.missed && star.x > run.sheep.x && star.x - run.sheep.x < run.speed * .32)) { await l.page.touchscreen.tap(screen.width * .67, screen.height * .67); last = Date.now(); }
      if (!l.run.samples.length || run.activeMs - l.run.samples.at(-1).activeMs > 5000) l.run.samples.push(run); await l.page.waitForTimeout(25);
    }
    const s = await l.snapshot(); assert.ok(s.run.activeMs >= observeMs - 1000); assert.ok(s.run.starCount > 0); assert.ok(s.physicsSteps > 3000); l.run.elapsedWallMs = Date.now() - started;
    l.run.starAudit = await l.page.evaluate(() => starAudit); assert.equal(l.run.starAudit.acceptedEpochs, s.run.starCount); assert.equal(l.run.starAudit.invalidCollectedBodies, 0); assert.ok(l.run.starAudit.animationFrames.length > 2);
    await l.shot("continuous"); l.run.checks.push(`${observeMs / 1000}s touch robot on unchanged original full scene, real stars/physics, no time/speed/entity injection`); await l.finish();
  }
  report.status = "PASS";
  }
} catch (error) {
  report.status = "FAIL"; report.failure = String(error); if (current) { current.status = "FAIL"; current.failure = String(error);
    if (current._page && !current._page.isClosed()) { current.snapshot = await current._page.evaluate(() => GameGlobal.__SHEEP_WX_FULL__?.snapshot()); await current._page.screenshot({ path: resolve(output, "failure.png") }); }
  } throw error;
} finally {
  for (const run of report.runs) delete run._page;
  await writeFile(resolve(output, "review.json"), JSON.stringify(report, null, 2)); await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ status: report.status, output, failure: report.failure, buildId: report.build.buildId }));
}
