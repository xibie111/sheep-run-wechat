/** Full original-scene target. Runtime assets are captured offline from the web preparation pipeline. */
import { build } from "vite";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { readFileSync, globSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { sha256 as hash, fullInputs, verifyFullInputs } from "./wechat-full-inputs.mjs";
import { exportFullAudio } from "./wechat-full-audio.mjs";
const root = resolve(import.meta.dirname, ".."), runtimeRoot = resolve(root, "builds/wechat-full-runtime");
const report = resolve(root, process.env.WECHAT_FULL_REPORT ?? `reports/wechat-full/${new Date().toISOString().replace(/\D/g, "")}-build`);
const manifest = JSON.parse(await readFile(resolve(runtimeRoot, "runtime.json"), "utf8"));
const contentProfile = "no-easter-eggs-or-private-letters";
manifest.textures = manifest.textures.filter(texture => texture.key !== "favorite-foods-picnic-v1");
if (!manifest.sourceInputs) throw Error("Runtime textures lack source/build proof; run tools/wechat-capture-runtime.mjs again");
await verifyFullInputs(root, manifest.sourceInputs);
if (hash(await readFile(resolve(root, "dist/assets", manifest.sourceWebMain))) !== manifest.sourceWebMainSha256) throw Error("Original web capture no longer matches the web build");
let local = {}; try { local = JSON.parse(await readFile(resolve(root, "wechat/local.config.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const assetMode = process.env.WECHAT_FULL_ASSET_MODE ?? local.fullAssetMode ?? "hybrid";
if (!["bundled", "hybrid"].includes(assetMode)) throw Error("Invalid full-game asset mode");
const output = resolve(root, process.env.WECHAT_FULL_OUT ?? (assetMode === "bundled" ? "builds/wechat-full-local" : "builds/wechat-full")), remoteRoot = resolve(root, "builds/wechat-full-remote");
if (!output.startsWith(resolve(root, "builds") + "/") && !output.startsWith(resolve(root, "builds") + "\\")) throw Error("Full build output must stay inside this workspace's builds directory");
let assetBaseUrl = assetMode === "hybrid" ? process.env.WECHAT_FULL_ASSET_BASE_URL ?? local.assetBaseUrl ?? "" : "";
if (assetBaseUrl) {
  const url = new URL(assetBaseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /^\d+(\.\d+){3}$/.test(url.hostname)) throw Error("Asset base must be a credential-free HTTPS domain URL without query/fragment");
  assetBaseUrl = url.href.replace(/\/?$/, "/");
}
const renderer = process.env.WECHAT_FULL_RENDERER ?? local.renderer ?? "auto";
if (!["auto", "canvas", "webgl"].includes(renderer)) throw Error("Invalid full-game renderer");
const engine = JSON.parse(await readFile(resolve(root, "node_modules/phaser/package.json"), "utf8")).version;
if (engine !== "4.2.1") throw Error("Review an engine version change explicitly before rebuilding this migration");
await mkdir(output, { recursive: true }); await mkdir(report, { recursive: true });
async function inventory() {
  const files = [];
  for (const file of await readdir(output, { recursive: true, withFileTypes: true })) if (file.isFile() && file.name !== "build-manifest.json") {
    const path = resolve(file.parentPath, file.name), bytes = await readFile(path); files.push({ path: relative(output, path).replaceAll("\\", "/"), bytes: bytes.length, sha256: hash(bytes) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
let old;
try { old = JSON.parse(await readFile(resolve(output, "build-manifest.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
for (const file of await inventory()) {
  const record = old?.files.find(previous => previous.path === file.path);
  if (!record || record.sha256 !== file.sha256) throw Error(`Unowned or edited output; preserve it before rebuilding: ${file.path}`);
}
const sourceInputs = new Map(Object.entries({ ...manifest.sourceInputs, ...await fullInputs(root, ["wechat/src"], [
  "tools/wechat-full-build.mjs", "tools/wechat-full-pipeline.mjs", "tools/wechat-full-audio.mjs", "tools/wechat-full-inputs.mjs", "wechat/tsconfig.json", "builds/wechat-full-runtime/runtime.json",
  "node_modules/phaser/package.json", "node_modules/phaser/LICENSE.md",
]) })), bindings = [], expected = new Set(["platform.js", "game.bundle.js", "runtime.json", "game.js", "game.json", "project.config.json"]);
async function emit(name, bytes) { expected.add(name); await mkdir(dirname(resolve(output, name)), { recursive: true }); await writeFile(resolve(output, name), bytes); }
const aliases = new Map([
  [resolve(root, "src/ui/DisplaySurface.ts"), resolve(root, "wechat/src/full/surfaces.ts")],
  [resolve(root, "src/ui/UiLayout.ts"), resolve(root, "wechat/src/full/safe-area.ts")],
  [resolve(root, "src/systems/AudioSystem.ts"), resolve(root, "wechat/src/full/audio.ts")],
  [resolve(root, "src/ui/TouchTarget.ts"), resolve(root, "wechat/src/full/touch-target.ts")],
  [resolve(root, "src/ui/EasterEggs.ts"), resolve(root, "wechat/src/full/easter-eggs.ts")],
  [resolve(root, "src/data/easterEggs.ts"), resolve(root, "wechat/src/full/easter-egg-copy.ts")],
  [resolve(root, "src/data/mailLetters.ts"), resolve(root, "wechat/src/full/mail-letters.ts")],
]);
const sourcePrefix = resolve(root, "src").replaceAll("\\", "/") + "/";
const plugin = { name: "sheep-full-native-boundaries", enforce: "pre",
  resolveId(source, importer) {
    if (!importer || !source.startsWith(".")) return;
    const file = resolve(dirname(importer), source.endsWith(".ts") ? source : source + ".ts");
    if (importer.replaceAll("\\", "/").endsWith("/wechat/src/full/touch-target.ts") && file === resolve(root, "src/ui/TouchTarget.ts")) return file.replaceAll("\\", "/");
    return aliases.get(file)?.replaceAll("\\", "/");
  },
  transform(input, id) {
    if (id.includes("node_modules") || id.includes("?") || id.includes("\0") || !id.replaceAll("\\", "/").startsWith(root.replaceAll("\\", "/") + "/")) return;
    const name = relative(root, id).replaceAll("\\", "/");
    sourceInputs.set(name, hash(readFileSync(id)));
    if (!id.replaceAll("\\", "/").startsWith(sourcePrefix)) return;
    let code = input; const changes = [];
    code = code.replace(/^import\s+([\w$]+)\s+from\s+(['"])([^'"]+\.(?:png|wav|fnt)\?url)\2\s*;?/gm,
      (_all, variable, _quote, path) => `const ${variable} = ${JSON.stringify(path)};`);
    code = code.replace(/new URL\((['"])([^'"]+)\1,\s*import\.meta\.url\)\.href/g, (_all, _q, path) => JSON.stringify(path));
    code = code.replace(/new URL\((`[^`]+`),\s*import\.meta\.url\)\.href/g, "$1");
    code = code.replace(/import\.meta\.glob\(\s*(['"])([^'"]+)\1\s*,\s*\{[\s\S]*?\}\s*\)/g, (_all, _q, pattern) => {
      const files = globSync(pattern, { cwd: dirname(id) }).map(file => file.replaceAll("\\", "/"));
      return JSON.stringify(Object.fromEntries(files.map(file => [file, file])));
    });
    if (code.includes("window.localStorage")) {
      code = `import { wxStorage as $wxStorage } from ${JSON.stringify(resolve(root, "wechat/src/full/storage.ts"))};\n` + code.replaceAll("window.localStorage", "$wxStorage");
      changes.push("explicit namespaced wx storage");
    }
    if (code.includes("structuredClone(")) {
      code = `import { cloneSnapshot as $wxClone } from ${JSON.stringify(resolve(root, "wechat/src/full/clone.ts"))};\n` + code.replaceAll("structuredClone(", "$wxClone(");
      changes.push("JSON snapshot clone capability");
    }
    if (code.includes("scene.add.nineslice(")) {
      code = `import { nativeNineSlice as $wxNineSlice } from ${JSON.stringify(resolve(root, "wechat/src/full/nine-slice.ts"))};\n` + code.replaceAll("scene.add.nineslice(", "$wxNineSlice(scene, ");
      changes.push("owned UI NineSlice Canvas draw; WebGL retains engine renderer");
    }
    const parent = /((?:this\.)?scene|this)\.game\.canvas\??\.parentElement/g;
    if (parent.test(code)) {
      parent.lastIndex = 0;
      code = code.replace(parent, "$wxSurfaceParent($1)");
      code = code.replace(/\bcanvas\s*=\s*document\.createElement\((["'])canvas\1\)/g, "canvas = $wxCanvas(scene)");
      code = code.replace(/\bcanvas\.remove\(\)/g, "$wxRemove(canvas)");
      code = `import { nativeSurfaceParent as $wxSurfaceParent, createNativeCanvas as $wxCanvas, removeNativeCanvas as $wxRemove } from ${JSON.stringify(resolve(root, "wechat/src/full/surfaces.ts"))};\n` + code;
      changes.push("native offscreen canvas rendered by Phaser; no visible DOM");
    }
    if (changes.length) bindings.push({ source: name, changes });
    return code;
  },
};
// Evaluate only reviewed first-party data modules; this contains no Phaser
// runtime import, filesystem access or third-party installer.
const planned = await build({ configFile: false, root, publicDir: false, plugins: [plugin], build: { write: false, minify: false,
  lib: { entry: resolve(root, "wechat/src/full/resources.ts"), formats: ["es"] }, rolldownOptions: { output: { codeSplitting: false } } } });
const plannedOutput = Array.isArray(planned) ? planned[0] : planned, planCode = plannedOutput.output.find(item => item.type === "chunk").code;
const resourcePlan = (await import(`data:text/javascript;base64,${Buffer.from(planCode).toString("base64")}`)).resourceGroups(manifest.textures);
const texturesByKey = new Map(manifest.textures.map(texture => [texture.key, texture])), localHashes = new Set(); let localArtBytes = 0;
for (const key of [...resourcePlan.boot, ...resourcePlan.wardrobe, ...resourcePlan.run, ...resourcePlan["delivery-select"], ...texturesByKey.keys()]) {
  const texture = texturesByKey.get(key); if (localHashes.has(texture.sha256)) continue;
  if (assetMode === "hybrid" && localArtBytes + texture.bytes > 22_000_000) {
    if (resourcePlan.boot.includes(key)) throw Error("Original startup resources exceed the reviewed local art budget");
    continue;
  }
  localHashes.add(texture.sha256); localArtBytes += texture.bytes;
}
for (const [entry, name] of [["wechat/src/platform.ts", "platform.js"], ["wechat/src/full/main.ts", "game.bundle.js"]]) {
  await build({ configFile: false, root, publicDir: false, plugins: [plugin], define: { __FULL_CONFIG__: JSON.stringify({ renderer }) },
    build: { target: "es2020", outDir: output, emptyOutDir: false, sourcemap: false, minify: true,
      lib: { entry: resolve(root, entry), name: "SheepFull", formats: ["iife"], fileName: () => name }, rolldownOptions: { output: { codeSplitting: false } } } });
}
let packIndex = 0, packBytes = 0;
const filesByHash = new Map(), packages = [], remoteFiles = [];
for (const texture of manifest.textures) {
  const previous = filesByHash.get(texture.sha256);
  if (previous) { Object.assign(texture, previous); continue; }
  const bytes = await readFile(resolve(runtimeRoot, texture.file));
  if (hash(bytes) !== texture.sha256) throw Error("Captured texture mismatch: " + texture.key);
  if (!localHashes.has(texture.sha256)) {
    const file = `textures/${texture.sha256.slice(0, 24)}.png`;
    await mkdir(dirname(resolve(remoteRoot, file)), { recursive: true }); await writeFile(resolve(remoteRoot, file), bytes);
    Object.assign(texture, { file, remote: true }); filesByHash.set(texture.sha256, { file, remote: true });
    remoteFiles.push({ path: file, bytes: bytes.length, sha256: texture.sha256 }); continue;
  }
  if (!packIndex || packBytes + bytes.length > 3_500_000) {
    packIndex++; packBytes = 0; const name = `art${String(packIndex).padStart(2, "0")}`; packages.push(name);
    await emit(`${name}/game.js`, "// Art-only subpackage; no timers or listeners.\n");
  }
  const file = `${packages.at(-1)}/${texture.sha256.slice(0, 24)}.png`;
  await emit(file, bytes); Object.assign(texture, { file, remote: false }); filesByHash.set(texture.sha256, { file, remote: false }); packBytes += bytes.length;
}
const audio = await exportFullAudio(root, output); for (const record of audio) expected.add(record.file); expected.add("music/game.js");
await emit("game.js", "require('./platform.js');\nrequire('./game.bundle.js');\n");
await emit("game.json", JSON.stringify({ deviceOrientation: "landscape", showStatusBar: false, subpackages: [...packages, "music"].map(name => ({ name, root: name + "/" })) }));
await emit("project.config.json", JSON.stringify({ compileType: "game", miniprogramRoot: "./", projectname: "sheep-run-full", appid: local.appid ?? "", setting: { es6: false, minified: false, urlCheck: true }, packOptions: { ignore: [{ type: "file", value: "build-manifest.json" }] } }, null, 2));
await mkdir(resolve(output, "licenses"), { recursive: true });
await emit("licenses/Phaser-MIT.txt", await readFile(resolve(root, "node_modules/phaser/LICENSE.md")));
for (const name of (await readdir(resolve(root, "assets/fonts"))).filter(name => /license|ofl/i.test(name))) await emit(`licenses/${name}`, await readFile(resolve(root, "assets/fonts", name)));
for (const file of await inventory()) if (!expected.has(file.path)) {
  if (!old?.files.some(previous => previous.path === file.path && previous.sha256 === file.sha256)) throw Error(`Unexpected full-game output: ${file.path}`);
  // Only unchanged files owned by the previous manifest can become obsolete.
  // The absolute output was checked above to stay inside workspace builds.
  await unlink(resolve(output, file.path));
}
const inputs = Object.fromEntries([...sourceInputs].sort(([a], [b]) => a.localeCompare(b))); await verifyFullInputs(root, inputs);
const sourceDigest = hash(JSON.stringify(inputs)), runtime = { schema: 1, engine, contentProfile, textures: manifest.textures, fonts: manifest.fonts, animations: manifest.animations, packages, assetMode, assetBaseUrl }, runtimeDigest = hash(JSON.stringify(runtime));
const payload = (await inventory()).filter(file => !["runtime.json", "project.config.json"].includes(file.path)).map(({ path, sha256 }) => ({ path, sha256 }));
const buildId = hash(JSON.stringify({ renderer, sourceDigest, runtimeDigest, payload }));
await emit("runtime.json", JSON.stringify({ ...runtime, buildId })); const files = await inventory();
const total = files.reduce((n, file) => n + file.bytes, 0), main = files.filter(file => !packages.some(name => file.path.startsWith(name + "/")) && !file.path.startsWith("music/")).reduce((n, file) => n + file.bytes, 0);
const result = { builtAt: new Date().toISOString(), buildId, renderer, engine, contentProfile, assetMode, resourceHostConfigured: !!assetBaseUrl,
  resourceHostStatus: !remoteFiles.length ? "BUNDLED" : !assetBaseUrl ? "MISSING" : new URL(assetBaseUrl).hostname.endsWith(".invalid") ? "TEST_FIXTURE_URL_NOT_REAL_HOST" : "CONFIGURED_PLATFORM_NOT_RUN",
  remoteDirectory: relative(root, remoteRoot).replaceAll("\\", "/"), remoteFiles,
  resourceGroups: Object.fromEntries(Object.entries(resourcePlan).map(([name, keys]) => [name, { keys, pngBytes: [...new Set(keys.map(key => texturesByKey.get(key).sha256))].reduce((n, digest) => n + manifest.textures.find(texture => texture.sha256 === digest).bytes, 0) }])),
  revision: existsSync(resolve(root, ".git")) ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim() : null,
  revisionStatus: existsSync(resolve(root, ".git")) ? "GIT_HEAD" : "UNVERSIONED_COPY_SOURCE_HASHES_VERIFIED",
  sourceInputs: inputs, sourceDigest, runtimeDigest, bindings, audio, files, mainBytes: main, totalBytes: total, textures: manifest.textures.length, artSubpackages: packages.length,
  budgetStatus: total <= 30_000_000 && main <= 4_000_000 ? "LOCAL_DISK_ESTIMATE_WITHIN_LIMIT_TOOL_UNVERIFIED" : "FAIL_PACKAGE_BUDGET_DEVELOPMENT_ONLY",
  platformStatus: "NOT_RUN" };
await writeFile(resolve(output, "build-manifest.json"), JSON.stringify(result, null, 2)); await writeFile(resolve(report, `full-build-${buildId.slice(0, 12)}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, buildId, textures: result.textures, mainBytes: main, totalBytes: total, budgetStatus: result.budgetStatus }));
