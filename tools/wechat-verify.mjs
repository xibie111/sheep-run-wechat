/** Read-only verification of a built or frozen PoC. Does not launch/upload anything. */
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, ".."), directory = resolve(process.argv[2] ?? resolve(root, "builds/wechat-poc"));
const hash = data => createHash("sha256").update(data).digest("hex");
const read = name => readFile(resolve(directory, name));
const manifest = JSON.parse(await read("build-manifest.json"));
for (const file of manifest.files) {
  assert.ok(!isAbsolute(file.path) && !file.path.split(/[\\/]/).includes(".."), "invalid manifest path");
  const data = await read(file.path);
  assert.equal(data.length, file.bytes, `size: ${file.path}`);
  assert.equal(hash(data), file.sha256, `hash: ${file.path}`);
}
async function paths(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) result.push(...await paths(path));
    else result.push(relative(directory, path).replaceAll("\\", "/"));
  }
  return result;
}
const known = new Set(["build-manifest.json", ...manifest.files.map(f => f.path)]);
const unexpected = (await paths(directory)).filter(p => !known.has(p));
assert.deepEqual(unexpected, [], "unexpected files (verify before importing into developer tools)");
assert.equal(manifest.count, manifest.files.length);
assert.equal(manifest.bytes, manifest.files.reduce((n, f) => n + f.bytes, 0));
const inputs = Object.fromEntries(Object.entries(manifest.sourceInputs).sort());
for (const [file, expected] of Object.entries(inputs)) assert.equal(hash(await readFile(resolve(root, file))), expected, `source changed: ${file}`);
const sourceDigest = hash(JSON.stringify(inputs));
assert.equal(manifest.identity.sourceDigest, sourceDigest);
const contract = JSON.parse(await read("assets/contract.json"));
const { build, ...baseContract } = contract;
const payload = manifest.files.filter(f => f.path !== "assets/contract.json" && f.path !== "project.config.json")
  .map(f => ({ path: f.path, sha256: f.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
const id = hash(JSON.stringify({ config: manifest.config, sourceDigest, contract: baseContract, payload }));
assert.equal(id, manifest.identity.id); assert.equal(id, build.id);
assert.equal(contract.engine, "4.2.1"); assert.equal(contract.gravity, 1450); assert.equal(contract.dash, false);
assert.equal((await read("game.js")).toString().replaceAll("\r\n", "\n"), "require('./platform.js');\nrequire('./game.bundle.js');\n");
assert.equal(JSON.parse(await read("game.json")).deviceOrientation, "landscape");
const gameConfig = JSON.parse(await read("game.json"));
if (contract.stage === "core-loop") {
  assert.deepEqual(gameConfig.subpackages, [{ name: "music", root: "music/" }]);
  assert.ok(manifest.files.some(file => file.path === "music/game.js"));
  assert.ok(manifest.files.some(file => file.path === contract.audio.music));
}
const project = JSON.parse(await read("project.config.json"));
assert.equal(project.compileType, "game"); assert.equal(project.miniprogramRoot, "./");
assert.ok(!manifest.files.some(f => /(^android\/|\.html$|\.map$|^node_modules\/|^src\/)/.test(f.path)), "unrelated entry/resources in PoC");
console.log(JSON.stringify({ status: "PASS", scope: "LOCAL_ARTIFACT_ONLY_NOT_WECHAT", directory, buildId: id,
  revision: manifest.identity.revision, dirty: manifest.identity.dirty, sourceInputsVerified: Object.keys(inputs).length,
  filesVerified: manifest.files.length, candidateDiskBytes: manifest.bytes, requestedRenderer: manifest.config.renderer,
  mainDiskBytes: manifest.files.filter(file => !file.path.startsWith("music/")).reduce((n, file) => n + file.bytes, 0),
  musicDiskBytes: manifest.files.filter(file => file.path.startsWith("music/")).reduce((n, file) => n + file.bytes, 0),
  projectType: project.compileType, orientation: "landscape", localAppIdConfigured: !!project.appid,
  developerToolsPackageBytes: null, developerTools: "NOT_RUN", androidWechat: "NOT_RUN", iosWechat: "NOT_RUN" }, null, 2));
