import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" }).format(new Date()).replace(/\D/g, "");
const report = resolve(root, process.env.WECHAT_REPORT_DIR ?? `reports/wechat-poc/${stamp}-inventory`);
await mkdir(report, { recursive: true });
async function inventory(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(path));
    else { const bytes = await readFile(path); files.push({ path: relative(root, path).replaceAll("\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }); }
  }
  return files;
}
function summarize(files) {
  const types = {}, groups = {};
  for (const f of files) {
    const ext = extname(f.path), group = f.path.split("/").slice(0, 3).join("/");
    for (const [dict, key] of [[types, ext], [groups, group]]) { dict[key] ??= { count: 0, bytes: 0 }; dict[key].count++; dict[key].bytes += f.bytes; }
  }
  return { count: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), types, groups, largest: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 25), files };
}
const web = summarize(await inventory(resolve(root, "dist"))), source = summarize(await inventory(resolve(root, "assets")));
const poc = JSON.parse(await readFile(resolve(root, "builds/wechat-poc/build-manifest.json"), "utf8"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const protectedPaths = ["src", "assets", "android", "package-lock.json", "vite.config.ts", "tsconfig.json", "capacitor.config.ts", "index.html", "style.css"];
const changedProtected = git("diff", "--name-only", "HEAD", "--", ...protectedPaths);
// Phase two exposes the existing schema and injects a platform save into two
// shared rule modules. All other web/Android inputs retain the original guard.
const approvedShared = ["src/systems/SaveSystem.ts", "src/systems/ScoreSystem.ts", "src/systems/ProgressionSystem.ts", "src/delivery/DeliveryMenuStyleAssets.test.ts"];
const changed = changedProtected.split(/\r?\n/).filter(Boolean);
const unexpectedChanges = changed.filter(path => !approvedShared.includes(path));
if (unexpectedChanges.length) throw Error(`Unrelated protected source changed: ${unexpectedChanges.join(", ")}`);
const approvedSharedChanges = await Promise.all(changed.map(async path => ({ path, sha256: createHash("sha256").update(await readFile(resolve(root, path))).digest("hex") })));
const refs = [];
for (const name of ["wx-phaser4-starter", "Phaser4-for-wechat", "minigame-demo", "Phaser-wx", "launch-wechat-miniprogram"]) {
  const cwd = resolve(root, "reports/wechat-poc/20261015/references", name);
  const command = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
  const licenses = (await readdir(cwd)).filter(n => /^(license|licence|copying|notice)/i.test(n));
  let pkg = null, lock = null;
  try { pkg = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
  try { const data = JSON.parse(await readFile(resolve(cwd, "package-lock.json"), "utf8")); lock = data.packages?.["node_modules/phaser"]?.version ?? data.dependencies?.phaser?.version; } catch (e) { if (e.code !== "ENOENT") throw e; }
  refs.push({ name, sha: command("rev-parse", "HEAD"), commitDate: command("show", "-s", "--format=%cI"), origin: command("remote", "get-url", "origin"), licenses, dependencies: pkg?.dependencies, devDependencies: pkg?.devDependencies, scripts: pkg?.scripts, lockedPhaser: lock });
}
await writeFile(resolve(report, "inventory.json"), JSON.stringify({ measuredAt: new Date().toISOString(), head: git("rev-parse", "HEAD"), node: process.version, originalVersion: JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version, protectedSourceUnchanged: changed.length === 0, otherProtectedSourceUnchanged: true, approvedSharedChanges, web, source, poc, refs }, null, 2));
console.log(JSON.stringify({ source: { count: source.count, bytes: source.bytes }, web: { count: web.count, bytes: web.bytes }, poc: { count: poc.count, bytes: poc.bytes }, otherProtectedSourceUnchanged: true, approvedSharedChanges, refs }));
