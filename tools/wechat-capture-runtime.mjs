/** Capture exact first-party prepared textures from the existing production web game.
 * This is an offline asset preparation step, not WeChat acceptance evidence. */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fullInputs, verifyFullInputs } from "./wechat-full-inputs.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UI_PLAYWRIGHT_PATH || "playwright");
const root = resolve(import.meta.dirname, ".."), dist = resolve(root, "dist");
const out = resolve(root, "builds/wechat-full-runtime");
const report = resolve(root, process.env.WECHAT_FULL_REPORT ?? `reports/wechat-full/${new Date().toISOString().replace(/\D/g, "")}-capture`);
await mkdir(resolve(out, "textures"), { recursive: true }); await mkdir(report, { recursive: true });
// Always build the original target from the pinned current inputs. An old dist
// directory must never be presented as a capture of the current source tree.
const sourceInputs = await fullInputs(root, ["src", "assets"], ["index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "tools/wechat-capture-runtime.mjs", "tools/wechat-full-inputs.mjs"]);
const buildLog = execSync("npm run build", { cwd: root, windowsHide: true, encoding: "utf8", stdio: "pipe" });
await writeFile(resolve(report, "capture-web-build.log"), buildLog); await verifyFullInputs(root, sourceInputs);
const main = (await readdir(resolve(dist, "assets"))).find(name => /^main-.*\.js$/.test(name));
assert.ok(main, "Build the original web target first");
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1) || "index.html";
  const file = resolve(dist, name);
  if (!file.startsWith(dist + "/") && !file.startsWith(dist + "\\")) { res.writeHead(403); res.end(); return; }
  try { const bytes = await readFile(file); res.setHeader("content-type", ({ ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".wav": "audio/wav" })[extname(file)] ?? "application/octet-stream"); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const capture = { scope: "OFFLINE_ORIGINAL_WEB_TEXTURE_CAPTURE_NOT_WECHAT", status: "RUNNING", textures: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 896, height: 414 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); page.on("pageerror", error => capture.errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.getElementById("game-status")?.textContent === "牧场已就绪，可以开始奔跑。", null, { timeout: 40000 });
  await page.evaluate(async url => { window.captureGame = (await import(url)).game.instance; }, `/assets/${main}`);
  const manifest = await page.evaluate(() => {
    const game = window.captureGame;
    return { textures: game.textures.getTextureKeys().sort().map(key => {
      const texture = game.textures.get(key);
      if (texture.source.length !== 1) throw Error(`Review multi-source texture: ${key}`);
      const source = texture.getSourceImage();
      return { key, width: source.width, height: source.height, firstFrame: texture.firstFrame,
        frames: Object.entries(texture.frames).map(([name, frame]) => ({ name, cutX: frame.cutX, cutY: frame.cutY,
          cutWidth: frame.cutWidth, cutHeight: frame.cutHeight, rotated: frame.rotated,
          pivotX: frame.pivotX, pivotY: frame.pivotY, customPivot: frame.customPivot,
          trimmed: frame.data.trim, sourceSize: frame.data.sourceSize, spriteSourceSize: frame.data.spriteSourceSize })) };
    }), fonts: game.cache.bitmapFont.getKeys().sort().map(key => ({ key, ...game.cache.bitmapFont.get(key) })),
      animations: game.anims.toJSON(), engine: game.config.gameTitle || "Phaser", scenes: Object.keys(game.scene.keys) };
  });
  for (const [index, texture] of manifest.textures.entries()) {
    const data = await page.evaluate(key => {
      const source = window.captureGame.textures.get(key).getSourceImage();
      const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.drawImage(source, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    }, texture.key);
    const bytes = Buffer.from(data, "base64"), file = `textures/${String(index).padStart(4, "0")}.png`;
    await writeFile(resolve(out, file), bytes);
    texture.file = file; texture.bytes = bytes.length; texture.sha256 = createHash("sha256").update(bytes).digest("hex");
    capture.textures.push({ key: texture.key, file, bytes: bytes.length, width: texture.width, height: texture.height, sha256: texture.sha256 });
  }
  assert.deepEqual(capture.errors, []);
  capture.capturedAt = new Date().toISOString(); manifest.sourceWebMain = main;
  manifest.sourceWebMainSha256 = createHash("sha256").update(await readFile(resolve(dist, "assets", main))).digest("hex");
  manifest.sourceCaptureScriptSha256 = createHash("sha256").update(await readFile(import.meta.filename)).digest("hex");
  await verifyFullInputs(root, sourceInputs); manifest.sourceInputs = sourceInputs;
  await writeFile(resolve(out, "runtime.json"), JSON.stringify(manifest));
  await page.screenshot({ path: resolve(report, "original-menu-capture.png") });
  capture.status = "PASS"; capture.fonts = manifest.fonts.length; capture.animations = manifest.animations.anims.length;
  capture.totalPngBytes = capture.textures.reduce((sum, texture) => sum + texture.bytes, 0);
  capture.webMainSha256 = manifest.sourceWebMainSha256;
} catch (error) { capture.status = "FAIL"; capture.failure = String(error); throw error; }
finally {
  await writeFile(resolve(report, "runtime-capture.json"), JSON.stringify(capture, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ status: capture.status, textures: capture.textures.length, bytes: capture.totalPngBytes, fonts: capture.fonts, animations: capture.animations, out }));
}
