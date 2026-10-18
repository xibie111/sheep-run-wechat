import { build } from "vite";
import { mkdir, readFile, writeFile, copyFile, readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const root = resolve(import.meta.dirname, ".."), out = resolve(root, "builds/wechat-poc");
const sourceInputs = new Map();
let local = {};
try { local = JSON.parse(await readFile(resolve(root, "wechat/local.config.json"), "utf8")); }
catch (e) { if (e.code !== "ENOENT") throw e; }
if (local.renderer && !["auto", "canvas", "webgl"].includes(local.renderer)) throw Error("Invalid PoC renderer");
const renderer = process.env.WECHAT_POC_RENDERER ?? local.renderer ?? "auto";
if (!["auto", "canvas", "webgl"].includes(renderer)) throw Error("Invalid PoC renderer");
const config = { renderer, debugPhysics: process.env.WECHAT_POC_DEBUG === "1" || (local.debugPhysics ?? false) };
const engine = JSON.parse(await readFile(resolve(root, "node_modules/phaser/package.json"), "utf8"));
if (engine.version !== "4.2.1") throw Error(`PoC expects Phaser 4.2.1, found ${engine.version}`);
await mkdir(resolve(out, "assets"), { recursive: true });
for (const [entry, name] of [["platform", "platform.js"], ["game", "game.bundle.js"]]) {
  await build({ configFile: false, root, publicDir: false,
    // Data catalogs still supply original keys/geometry; don't emit every chapter's URL as a library asset.
    plugins: [{ name: "wechat-package-relative-data-paths", enforce: "pre", transform(code, id) {
      if (id.replaceAll("\\", "/").startsWith(root.replaceAll("\\", "/") + "/") && !id.includes("node_modules") && !id.includes("?")) {
        sourceInputs.set(relative(root, id).replaceAll("\\", "/"), createHash("sha256").update(readFileSync(id)).digest("hex"));
      }
      if (!id.replaceAll("\\", "/").includes("/src/data/")) return;
      return code.replace(/new URL\((['"])(\.\.\/\.\.\/assets\/[^'"]+)\1,\s*import\.meta\.url\)\.href/g, (_m, _q, path) => JSON.stringify(path.slice(6)));
    } }],
    define: { __POC_CONFIG__: JSON.stringify(config) },
    build: { target: "es2020", outDir: out, emptyOutDir: false, sourcemap: false, minify: true,
      lib: { entry: resolve(root, `wechat/src/${entry}.ts`), name: `SheepPoc${entry}`, formats: ["iife"], fileName: () => name },
      rolldownOptions: { output: { codeSplitting: false } } } });
}
const assets = {
  "white-sheet.png": "assets/skins/runtime-v1/white-sheet.png",
  "star.png": "assets/collectibles/mirror-star-v1.png",
};
const provenance = [];
for (const [dest, source] of Object.entries(assets)) {
  const data = await readFile(resolve(root, source));
  await copyFile(resolve(root, source), resolve(out, "assets", dest));
  provenance.push({ output: `assets/${dest}`, source, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
}
const bundledPython = resolve(process.env.USERPROFILE ?? "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
const python = process.env.WECHAT_PYTHON ?? (existsSync(bundledPython) ? bundledPython : process.platform === "win32" ? "python" : "python3");
execFileSync(python, [resolve(root, "tools/wechat-prepare-assets.py"), resolve(out, "assets")], { stdio: "inherit", windowsHide: true });
provenance.push(...JSON.parse(await readFile(resolve(out, "assets/preparation.json"), "utf8")).records);
// Preserve original glyph metrics/alpha. Convert XML to Phaser's cache layout; no runtime DOMParser.
const xml = await readFile(resolve(root, "assets/fonts/pasture-display-64.fnt"), "utf8");
const attrs = tag => Object.fromEntries([...tag.matchAll(/([a-zA-Z]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const info = attrs(xml.match(/<info\s[^>]+/)[0]), common = attrs(xml.match(/<common\s[^>]+/)[0]);
const font = { font: info.face, size: +info.size, lineHeight: +common.lineHeight, chars: {} };
for (const match of xml.matchAll(/<char\s[^>]+/g)) {
  const a = attrs(match[0]), x = +a.x, y = +a.y, w = +a.width, h = +a.height;
  font.chars[a.id] = { x, y, width: w, height: h, centerX: Math.floor(w / 2), centerY: Math.floor(h / 2),
    xOffset: +a.xoffset, yOffset: +a.yoffset, xAdvance: +a.xadvance, data: {}, kerning: {},
    u0: x / +common.scaleW, v0: 1 - y / +common.scaleH, u1: (x + w) / +common.scaleW, v1: 1 - (y + h) / +common.scaleH };
}
for (const match of xml.matchAll(/<kerning\s[^>]+/g)) { const a = attrs(match[0]); font.chars[a.second].kerning[a.first] = +a.amount; }
const strings = Object.values(JSON.parse(await readFile(resolve(root, "wechat/ui-text.json"), "utf8"))).join("") + "0123456789 /+-";
for (const c of strings) if (!font.chars[c.charCodeAt(0)]) throw Error(`Existing font lacks glyph: ${c}`);
await writeFile(resolve(out, "assets/font.json"), JSON.stringify(font));
// Export only the reviewed first-party cue table; keep original pitches/envelopes/notes.
const audioSource = await readFile(resolve(root, "src/systems/AudioSystem.ts"), "utf8");
const cueTable = audioSource.match(/const CUES:[^=]+=(\s*\{[\s\S]*?\n\});/);
if (!cueTable) throw Error("Recheck original cue table before exporting WAV");
const cues = runInNewContext(`(${cueTable[1]})`, Object.create(null), { timeout: 100 });
for (const [name, cue] of Object.entries(cues)) {
if (!/^[A-Za-z]+$/.test(name) || !["sine", "triangle", "sawtooth"].includes(cue.wave)) throw Error("Unsupported original audio cue");
const { frequency, duration } = cue, rate = 22050, count = Math.ceil(duration * rate), peak = cue.peakGain ?? 0.055;
const wav = Buffer.alloc(44 + count * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) {
  const t = i / rate;
  let cycles = frequency * t;
  for (let n = 0; n < (cue.notes?.length ?? 0); n++) {
    const note = cue.notes[n], previous = n ? cue.notes[n - 1].frequency : frequency;
    cycles += (note.frequency - previous) * Math.max(0, t - note.offsetSeconds);
  }
  const sine = Math.sin(2 * Math.PI * cycles), wave = cue.wave === "sine" ? sine : cue.wave === "triangle" ? 2 / Math.PI * Math.asin(sine) : 2 * (cycles - Math.floor(cycles + .5));
  wav.writeInt16LE(Math.round(wave * peak * Math.pow(0.0001 / peak, t / duration) * 32767), 44 + i * 2);
}
await writeFile(resolve(out, `assets/${name}.wav`), wav);
}
await writeFile(resolve(out, "assets/contract.json"), JSON.stringify({ stage: "core-loop", engine: engine.version, gravity: 1450, dash: false, audio: { cues, music: "music/pasture-morning.wav" } }));
await copyFile(resolve(root, "wechat/game.json"), resolve(out, "game.json"));
await writeFile(resolve(out, "game.js"), "require('./platform.js');\nrequire('./game.bundle.js');\n");
await writeFile(resolve(out, "project.config.json"), JSON.stringify({ description: "Sheep Run Phaser 4.2.1 core loop candidate", projectname: "sheep-run-wechat", compileType: "game", miniprogramRoot: "./", appid: local.appid ?? "", setting: { es6: false, minified: false, urlCheck: true }, packOptions: { ignore: [{ type: "file", value: "build-manifest.json" }] } }, null, 2));
await mkdir(resolve(out, "licenses"), { recursive: true });
await copyFile(resolve(root, "node_modules/phaser/LICENSE.md"), resolve(out, "licenses/Phaser-MIT.txt"));
for (const name of (await readdir(resolve(root, "assets/fonts"))).filter(n => /license|ofl/i.test(n))) await copyFile(resolve(root, "assets/fonts", name), resolve(out, "licenses", name));
async function inventory(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(path));
    else if (entry.name !== "build-manifest.json") { const data = await readFile(path); files.push({ path: relative(out, path).replaceAll("\\", "/"), bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") }); }
  }
  return files;
}
let files = await inventory(out);
// Unexpected emitted catalogs must fail visibly; only the explicit PoC allowlist is packaged.
const allowed = new Set(["platform.js", "game.bundle.js", "game.js", "game.json", "project.config.json", ...Object.keys(assets).map(n => `assets/${n}`), ...provenance.map(record => record.output), ...Object.keys(cues).map(name => `assets/${name}.wav`), "music/game.js", "assets/preparation.json", "assets/font.json", "assets/contract.json"]);
for (const file of files) if (!allowed.has(file.path) && !file.path.startsWith("licenses/")) throw Error(`Unexpected PoC package file: ${file.path}`);
for (const file of ["tools/wechat-build.mjs", "tools/wechat-prepare-assets.py", "wechat/game.json", "wechat/tsconfig.json", "wechat/ui-text.json", "package.json", "package-lock.json", "src/systems/AudioSystem.ts", "assets/fonts/pasture-display-64.fnt", "assets/seasons/additional-obstacles-v1/frames.json", "assets/seasons/new-obstacles-v2/frames.json", "assets/seasons/expanded-obstacles-v3/frames.json", ...provenance.map(record => record.source)]) {
  sourceInputs.set(file, createHash("sha256").update(await readFile(resolve(root, file))).digest("hex"));
}
const inputs = Object.fromEntries([...sourceInputs].sort());
const sourceDigest = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
const contract = JSON.parse(await readFile(resolve(out, "assets/contract.json"), "utf8"));
// Exclude only the self-containing contract and local AppID configuration from content identity.
// Their final file hashes are still verified by the complete manifest below.
const payload = files.filter(f => f.path !== "assets/contract.json" && f.path !== "project.config.json")
  .map(f => ({ path: f.path, sha256: f.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
const id = createHash("sha256").update(JSON.stringify({ config, sourceDigest, contract, payload })).digest("hex");
const revision = existsSync(resolve(root, ".git")) ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim() : null;
const dirty = existsSync(resolve(root, ".git")) ? execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim().length > 0 : null;
const identity = { id, revision, dirty, sourceDigest };
await writeFile(resolve(out, "assets/contract.json"), JSON.stringify({ ...contract, build: identity }));
files = await inventory(out);
const manifest = { builtAt: new Date().toISOString(), engine: engine.version, config, identity, bytes: files.reduce((n, f) => n + f.bytes, 0), count: files.length, files, provenance, sourceInputs: inputs };
await writeFile(resolve(out, "build-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ out, buildId: id, bytes: manifest.bytes, count: manifest.count, config }));
