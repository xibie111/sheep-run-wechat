/** Exact full-scene candidate on the browser facade. Never WeChat/device acceptance. */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { browserFacadeHtml } from "./wechat-browser-facade.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UI_PLAYWRIGHT_PATH || "playwright");
const root = resolve(import.meta.dirname, ".."), pkg = resolve(root, "builds/wechat-full");
const stamp = new Date().toISOString().replace(/\D/g, "");
const output = resolve(root, process.env.WECHAT_FULL_REVIEW_OUTPUT ?? `reports/wechat-full/${stamp}-browser`);
await mkdir(output, { recursive: true });
const html = browserFacadeHtml.replace("loadSubpackage(o){if(h.musicDenied)", "loadSubpackage(o){if(h.musicDenied)")
  .replace("fetch('music/game.js')", "fetch(o.name+'/game.js')");
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
const browser = await chromium.launch({ headless: true, channel: "msedge", args: ["--autoplay-policy=no-user-gesture-required"] });
const result = { scope: "FULL_ORIGINAL_SCENES_BROWSER_FACADE_NOT_WECHAT", build: JSON.parse(await readFile(resolve(pkg, "build-manifest.json"), "utf8")), checks: [], errors: [], status: "RUNNING" };
try {
  const context = await browser.newContext({ viewport: { width: 896, height: 414 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); page.on("pageerror", error => result.errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error" || /Texture.*missing|Frame.*not found/.test(message.text())) result.errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) result.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const snapshot = () => page.evaluate(() => window.GameGlobal.__SHEEP_WX_FULL__?.snapshot());
  try { await page.waitForFunction(() => GameGlobal.__SHEEP_WX_FULL__?.snapshot().scenes.some(scene => scene.key === "MenuScene" && scene.active), null, { timeout: 45000 }); }
  finally { result.boot = await snapshot(); await page.screenshot({ path: resolve(output, "full-boot.png") }); }
  assert.equal(result.boot.ready, true); assert.deepEqual(result.boot.errors, []);
  assert.equal(await page.locator("canvas").count(), 1, "visible DOM overlays leaked into the full game");
  await page.waitForTimeout(250); await page.screenshot({ path: resolve(output, "full-menu.png") });
  result.checks.push("original MenuScene with all full runtime art/fonts/animations, one visible game canvas");
  async function buttons() { return page.evaluate(() => {
    const game = GameGlobal.__SHEEP_WX_FULL__.game(), rows = [];
    for (const scene of game.scene.getScenes(true)) {
      const walk = (list, shown = true) => { for (const object of list) {
        const visible = shown && object.visible !== false && object.active !== false;
        if (object.input?.enabled && visible) { const b = object.getBounds(); rows.push({ scene: scene.sys.settings.key, name: object.name, x: b.centerX, y: b.centerY, width: b.width, height: b.height, scrollX: object.scrollFactorX, scrollY: object.scrollFactorY }); }
        if (object.list) walk(object.list, visible);
      } }; walk(scene.children.list);
    }
    return rows;
  }); }
  async function press(name) {
    const list = await buttons(), target = list.find(button => button.name === name); assert.ok(target, `Missing original target ${name}: ${list.map(item => item.name).join(", ")}`);
    const position = await page.evaluate(target => {
      const game = GameGlobal.__SHEEP_WX_FULL__.game(), snapshot = GameGlobal.__SHEEP_WX_FULL__.snapshot(), camera = game.scene.getScene(target.scene).cameras.main;
      return { x: snapshot.view.left + (target.x - camera.scrollX * target.scrollX) * snapshot.view.fit,
        y: snapshot.view.top + (target.y - camera.scrollY * target.scrollY) * snapshot.view.fit };
    }, target);
    await page.touchscreen.tap(position.x, position.y); await page.waitForTimeout(150);
  }
  result.menuButtons = await buttons();
  await press("button:衣橱"); await page.waitForFunction(() => GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive("WardrobeScene"));
  result.wardrobeButtons = await buttons(); await page.screenshot({ path: resolve(output, "full-wardrobe.png") });
  result.checks.push("real touch enters original WardrobeScene and renders full skin/purchase UI");
  await press("button:返回"); await page.waitForFunction(() => GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive("MenuScene"));
  await press("button:开始游戏"); await page.waitForFunction(() => GameGlobal.__SHEEP_WX_FULL__.game().scene.isActive("RunScene"));
  await page.touchscreen.tap(600, 280); await page.waitForTimeout(80);
  result.jump = await snapshot(); assert.ok(result.jump.run.sheep.velocityY < 0); await page.screenshot({ path: resolve(output, "full-run-jump.png") });
  result.checks.push("original full RunScene starts and original touch jump uses real Arcade sheep");
  await page.waitForTimeout(500); result.running = await snapshot(); assert.ok(result.running.physicsSteps > 10);
  assert.deepEqual(result.errors, []); result.status = "PASS"; await context.close();
} catch (error) { result.status = "FAIL"; result.failure = String(error); throw error; }
finally {
  await writeFile(resolve(output, "review.json"), JSON.stringify(result, null, 2)); await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ status: result.status, output, failure: result.failure }));
}
