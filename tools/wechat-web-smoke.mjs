/** Read-only smoke of the original production web output, independent of the wx facade. */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UI_PLAYWRIGHT_PATH || "playwright");
const root = resolve(import.meta.dirname, ".."), dist = resolve(root, "dist");
const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" }).format(new Date()).replace(/\D/g, "");
const out = resolve(root, process.env.WECHAT_REPORT_DIR ?? `reports/wechat-poc/${stamp}-web-review`, "web");
const mainAsset = (await readdir(resolve(dist, "assets"))).find(name => /^main-.*\.js$/.test(name));
assert.ok(mainAsset, "production main module missing");
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1) || "index.html", path = resolve(dist, name);
  if (!path.startsWith(dist + "/") && !path.startsWith(dist + "\\")) { res.writeHead(403); res.end(); return; }
  try { res.setHeader("content-type", ({ ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".wav": "audio/wav" })[extname(path)] ?? "application/octet-stream"); res.end(await readFile(path)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const results = [];
try {
  for (const [width, height] of [[896, 414], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.stack ?? e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.getElementById("game-status")?.textContent === "牧场已就绪，可以开始奔跑。", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(out, `menu-${width}x${height}.png`) });
    // Import the already loaded production module to inspect its existing instance.
    // All navigation and gameplay below still enter through real touch events.
    await page.evaluate(async url => { window.webSmokeGame = (await import(url)).game.instance; }, `/assets/${mainAsset}`);
    const active = key => page.waitForFunction(k => webSmokeGame.scene.isActive(k), key);
    const tapObject = async (key, name) => {
      const p = await page.evaluate(({ key, name }) => {
        const scene = webSmokeGame.scene.getScene(key);
        const find = list => { for (const o of list) { if (o.name === name) return o; if (o.list) { const child = find(o.list); if (child) return child; } } };
        const object = find(scene.children.list); if (!object) throw Error(`missing touch target: ${name}`);
        const b = object.getBounds(), r = webSmokeGame.canvas.getBoundingClientRect(), size = webSmokeGame.scale.gameSize;
        return { x: r.x + b.centerX * r.width / size.width, y: r.y + b.centerY * r.height / size.height };
      }, { key, name });
      await page.touchscreen.tap(p.x, p.y);
    };
    await tapObject("MenuScene", "button:衣橱"); await active("WardrobeScene");
    await tapObject("WardrobeScene", "button:返回"); await active("MenuScene");
    await tapObject("MenuScene", "button:开始游戏"); await active("RunScene");
    const gameplayPoint = await page.evaluate(() => { const r=webSmokeGame.canvas.getBoundingClientRect(); return { x:r.x+r.width*.7, y:r.y+r.height*.65 }; });
    await page.touchscreen.tap(gameplayPoint.x, gameplayPoint.y); await page.waitForTimeout(80);
    const jump = await page.evaluate(() => { const s=webSmokeGame.scene.getScene("RunScene").sheep; return { velocityY:s.body.velocity.y, state:s.motionState }; });
    assert.ok(jump.velocityY < 0, "production touch jump failed");
    const pausePoint = await page.evaluate(() => {
      const b=webSmokeGame.scene.getScene("RunScene").pauseButton.getData("hud-rect"), r=webSmokeGame.canvas.getBoundingClientRect(), size=webSmokeGame.scale.gameSize;
      return { x:r.x+(b.x+b.width/2)*r.width/size.width,y:r.y+(b.y+b.height/2)*r.height/size.height };
    });
    await page.touchscreen.tap(pausePoint.x,pausePoint.y); await active("PauseScene");
    const frozenY = await page.evaluate(() => webSmokeGame.scene.getScene("RunScene").sheep.y);
    await page.waitForTimeout(160); assert.equal(await page.evaluate(() => webSmokeGame.scene.getScene("RunScene").sheep.y), frozenY);
    await page.screenshot({ path: resolve(out, `pause-${width}x${height}.png`) });
    await tapObject("PauseScene", "button:继续游戏"); await active("RunScene");
    await page.waitForTimeout(80); assert.equal(await page.evaluate(() => webSmokeGame.scene.isActive("PauseScene")), false);
    assert.deepEqual(errors, []);
    results.push({ width, height, browser: browser.version(), errors, result: "PASS", mainAsset,
      checks: ["menu boot", "touch wardrobe and back", "touch start", "touch jump", "touch pause freezes physics", "touch resume"], jump,
      canvases: await page.locator("canvas").count() });
    await context.close();
  }
} finally { await writeFile(resolve(out, "result.json"), JSON.stringify(results, null, 2)); await browser.close(); await new Promise(r => server.close(r)); }
console.log(JSON.stringify(results));
