import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export const sha256 = data => createHash("sha256").update(data).digest("hex");
export async function fullInputs(root, directories, extra) {
  const inputs = new Map();
  for (const directory of directories) {
    for (const entry of await readdir(resolve(root, directory), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || entry.name.endsWith(".test.ts")) continue;
      const path = resolve(entry.parentPath, entry.name), key = path.slice(root.length + 1).replaceAll("\\", "/");
      inputs.set(key, sha256(await readFile(path)));
    }
  }
  for (const name of extra) inputs.set(name, sha256(await readFile(resolve(root, name))));
  return Object.fromEntries([...inputs].sort(([a], [b]) => a.localeCompare(b)));
}
export async function verifyFullInputs(root, inputs) {
  for (const [name, expected] of Object.entries(inputs)) {
    if (sha256(await readFile(resolve(root, name))) !== expected) throw Error(`Source changed; rebuild/capture this input: ${name}`);
  }
}
