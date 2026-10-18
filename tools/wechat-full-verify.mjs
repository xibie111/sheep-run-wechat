/** Read-only full artifact/source verification. No login, upload or device claim. */
import { readFile, readdir } from "node:fs/promises";
import { resolve, isAbsolute, relative } from "node:path";
import assert from "node:assert/strict";
import { sha256, verifyFullInputs } from "./wechat-full-inputs.mjs";
const root = resolve(import.meta.dirname, ".."), args = process.argv.slice(2), directory = resolve(args.find(arg => !arg.startsWith("--")) ?? resolve(root, "builds/wechat-full"));
const read = name => readFile(resolve(directory, name));
const manifest = JSON.parse(await read("build-manifest.json")), runtime = JSON.parse(await read("runtime.json"));
const actual = [];
for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) if (entry.isFile()) actual.push(relative(directory, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"));
assert.deepEqual(actual.sort(), ["build-manifest.json", ...manifest.files.map(file => file.path)].sort(), "unlisted package file");
for (const file of manifest.files) {
  assert.ok(!isAbsolute(file.path) && !file.path.split(/[\\/]/).includes(".."), "invalid package path");
  const data = await read(file.path); assert.equal(data.length, file.bytes, `size ${file.path}`); assert.equal(sha256(data), file.sha256, `hash ${file.path}`);
}
const inputs = Object.fromEntries(Object.entries(manifest.sourceInputs).sort(([a], [b]) => a.localeCompare(b)));
assert.equal(sha256(JSON.stringify(inputs)), manifest.sourceDigest);
if (!args.includes("--artifact-only")) await verifyFullInputs(root, inputs);
const { buildId, ...core } = runtime; assert.equal(sha256(JSON.stringify(core)), manifest.runtimeDigest);
const payload = manifest.files.filter(file => !["runtime.json", "project.config.json"].includes(file.path)).map(({ path, sha256 }) => ({ path, sha256 }));
const expected = sha256(JSON.stringify({ renderer: manifest.renderer, sourceDigest: manifest.sourceDigest, runtimeDigest: manifest.runtimeDigest, payload }));
assert.equal(buildId, expected); assert.equal(buildId, manifest.buildId); assert.equal(runtime.engine, "4.2.1"); assert.equal(runtime.schema, 1);
assert.equal((await read("game.js")).toString(), "require('./platform.js');\nrequire('./game.bundle.js');\n");
const config = JSON.parse(await read("game.json")), project = JSON.parse(await read("project.config.json"));
assert.equal(config.deviceOrientation, "landscape"); assert.equal(project.compileType, "game"); assert.equal(project.miniprogramRoot, "./");
assert.deepEqual(config.subpackages, [...runtime.packages, "music"].map(name => ({ name, root: name + "/" })));
assert.ok(!actual.some(path => /(^android\/|\.html$|\.map$|^node_modules\/|^src\/|^assets\/.*(?:original|source))/i.test(path)), "unrelated platform/source payload");
const byKey = new Map(runtime.textures.map(texture => [texture.key, texture]));
if (runtime.contentProfile === "no-easter-eggs-or-private-letters") {
  assert.equal(manifest.contentProfile, runtime.contentProfile);
  assert.ok(!byKey.has("favorite-foods-picnic-v1"), "removed Easter-egg art is still packaged");
  const gameCode = (await read("game.bundle.js")).toString();
  assert.ok(!/["'](?:welcome-v1|goodnight-v1)["']/.test(gameCode), "removed private letter IDs are still bundled");
  for (const removed of ["easter-egg:sheep", "easter-egg:food", "easter-egg:letter-blocker",
    "催眠羊，我喜欢你。", "催眠羊真厉害！", "没关系，我陪催眠羊再跑一次。", "今天是不是特别特别累？回到宿舍"]) {
    assert.ok(!gameCode.includes(removed), `removed private content is still bundled: ${removed}`);
  }
}
assert.equal(byKey.size, runtime.textures.length); assert.equal(manifest.textures, runtime.textures.length);
const remoteRoot = resolve(root, manifest.remoteDirectory ?? "builds/wechat-full-remote");
assert.ok(remoteRoot.startsWith(resolve(root, "builds") + "/") || remoteRoot.startsWith(resolve(root, "builds") + "\\"), "remote asset directory escaped workspace builds");
for (const file of manifest.remoteFiles ?? []) {
  assert.ok(!isAbsolute(file.path) && !file.path.split(/[\\/]/).includes(".."), "invalid remote asset path");
  const bytes = await readFile(resolve(remoteRoot, file.path)); assert.equal(bytes.length, file.bytes); assert.equal(sha256(bytes), file.sha256, `remote hash ${file.path}`);
}
for (const texture of runtime.textures) {
  const file = (texture.remote ? manifest.remoteFiles : manifest.files).find(file => file.path === texture.file); assert.ok(file, `missing real texture: ${texture.key}`); assert.equal(file.sha256, texture.sha256);
  for (const frame of texture.frames) assert.ok(frame.cutX >= 0 && frame.cutY >= 0 && frame.cutX + frame.cutWidth <= texture.width && frame.cutY + frame.cutHeight <= texture.height, `frame outside ${texture.key}`);
  if (texture.key.startsWith("sheep-runner")) for (let frame = 0; frame < 15; frame++) assert.ok(texture.frames.some(item => String(item.name) === String(frame)), `missing sheep animation frame ${texture.key}/${frame}`);
}
for (const font of runtime.fonts) assert.ok(byKey.has(font.texture) && Object.keys(font.data.chars).length > 0, `font ${font.key}`);
for (const animation of runtime.animations.anims) for (const frame of animation.frames) assert.ok(byKey.get(frame.key)?.frames.some(item => String(item.name) === String(frame.frame)), `animation frame ${animation.key}/${frame.frame}`);
const total = manifest.files.reduce((n, file) => n + file.bytes, 0), main = manifest.files.filter(file => !config.subpackages.some(sub => file.path.startsWith(sub.root))).reduce((n, file) => n + file.bytes, 0);
assert.equal(total, manifest.totalBytes); assert.equal(main, manifest.mainBytes);
if (args.includes("--require-budget")) assert.ok(main <= 4_000_000 && total <= 30_000_000, "local disk estimate exceeds current published package budget");
console.log(JSON.stringify({ status: "PASS_ARTIFACT_INTEGRITY_ONLY", directory, buildId, engine: runtime.engine, currentSources: args.includes("--artifact-only") ? "NOT_CHECKED" : "MATCH", sourceInputs: Object.keys(inputs).length,
  files: manifest.files.length, textures: byKey.size, fonts: runtime.fonts.length, animations: runtime.animations.anims.length, mainDiskBytes: main, totalDiskBytes: total,
  remoteAssets: manifest.remoteFiles?.length ?? 0, remotePngBytes: manifest.remoteFiles?.reduce((n, file) => n + file.bytes, 0) ?? 0, resourceHostConfigured: manifest.resourceHostConfigured,
  budgetStatus: manifest.budgetStatus, ownAppIdConfigured: !!project.appid, developerToolsPackageBytes: null, developerTools: "NOT_RUN", androidWechat: "NOT_RUN", iosWechat: "NOT_RUN" }, null, 2));
