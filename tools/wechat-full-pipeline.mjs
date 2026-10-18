/** Reviewed local preparation/build only. Never invokes Capacitor, upload, release or Git mutations. */
import { execFileSync, execSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(/[-: ]/g, "");
const report = resolve(root, process.env.WECHAT_FULL_REPORT ?? `reports/wechat-full/${stamp.slice(0, 8)}-${stamp.slice(8)}-build`);
await mkdir(report, { recursive: true });
const env = { ...process.env, WECHAT_FULL_REPORT: report };
if (process.argv.includes("--bundled")) env.WECHAT_FULL_ASSET_MODE = "bundled";
const result = { scope: "LOCAL_FULL_BUILD_NOT_WECHAT", startedAt: new Date().toISOString(), commands: [], status: "RUNNING" };
function run(name, script, args = []) {
  const at = new Date().toISOString(); let log = "", status = "PASS";
  try { log = script ? execFileSync(process.execPath, [resolve(root, script), ...args], { cwd: root, env, windowsHide: true, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    : execSync("npm run wechat:typecheck", { cwd: root, env, windowsHide: true, encoding: "utf8" }); }
  catch (error) { status = "FAIL"; log = String(error.stdout ?? "") + String(error.stderr ?? ""); throw Object.assign(error, { buildLog: log }); }
  finally { result.commands.push({ name, at, status, log }); }
  process.stdout.write(log);
  return log;
}
try {
  run("wechat:typecheck"); run("fresh original web build + texture capture", "tools/wechat-capture-runtime.mjs");
  const buildText = run("full independent IIFE build", "tools/wechat-full-build.mjs"), out = JSON.parse(buildText.trim().split(/\r?\n/).at(-1)).output;
  result.build = JSON.parse(await readFile(resolve(out, "build-manifest.json"), "utf8"));
  run("artifact and source verification", "tools/wechat-full-verify.mjs", [out, ...(result.build.assetMode === "hybrid" ? ["--require-budget"] : [])]);
  result.output = out; result.status = "PASS_LOCAL_BUILD_ONLY";
} catch (error) { result.status = "FAIL"; result.failure = String(error); process.exitCode = 1; }
finally {
  for (const [index, command] of result.commands.entries()) { await writeFile(resolve(report, `${index + 1}-build.log`), command.log); delete command.log; }
  result.finishedAt = new Date().toISOString(); await writeFile(resolve(report, "pipeline.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, report, output: result.output, buildId: result.build?.buildId, failure: result.failure }));
}
