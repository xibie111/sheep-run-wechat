import type { Wx } from "../platform";
import { normalizeSaveData } from "../../../src/systems/SaveSystem";
import { STORAGE } from "../../../src/game/Constants";

export const FULL_STORAGE_PREFIX = "sheep-run-wechat-full-v1/";
type Api = Pick<Wx, "getStorageSync" | "setStorageSync">;
export function createWechatStorage(api: Api, log: (event: string, value?: unknown) => void = () => {},
  validate: (key: string, parsed: unknown) => boolean = () => true) {
  const blocked = new Map<string, string>();
  function fail(key: string, error: unknown): never {
    const reason = String(error); blocked.set(key, reason); log("full-storage-error", { key, reason }); throw Error(reason);
  }
  function getItem(key: string): string | null {
    if (blocked.has(key)) throw Error(blocked.get(key));
    try {
      const value = api.getStorageSync(FULL_STORAGE_PREFIX + key);
      if (value === "" || value === null || value === undefined) return null;
      if (typeof value !== "string") throw Error("Expected the full game's serialized storage value");
      if (!validate(key, JSON.parse(value))) throw Error("Stored game data has an invalid or unsupported schema");
      return value;
    } catch (error) { return fail(key, error); }
  }
  function setItem(key: string, value: string): void {
    if (blocked.has(key)) throw Error(blocked.get(key));
    try {
      if (!validate(key, JSON.parse(value))) throw Error("Refusing an invalid game storage write");
      getItem(key);
      api.setStorageSync(FULL_STORAGE_PREFIX + key, value);
      if (api.getStorageSync(FULL_STORAGE_PREFIX + key) !== value) throw Error("Storage readback mismatch");
      log("full-storage-readback-ok", { key });
    } catch (error) { fail(key, error); }
  }
  return { getItem, setItem,
    retry(key: string): boolean { blocked.delete(key); try { getItem(key); return true; } catch { return false; } },
    block: fail, snapshot: () => [...blocked].map(([key, reason]) => ({ key, reason })) };
}
let instance: ReturnType<typeof createWechatStorage> | undefined;
declare const GameGlobal: { __SHEEP_WX_HOST__: { wx: Api; log: (event: string, value?: unknown) => void } };
function storage() {
  const host = GameGlobal.__SHEEP_WX_HOST__;
  if (!host) throw Error("Platform bridge must initialize before full-game stores");
  return instance ??= createWechatStorage(host.wx, host.log, (key, value) => key !== STORAGE.saveKey || normalizeSaveData(value) !== null);
}
/** Explicit build binding; never replaces a functioning window.localStorage. */
export const wxStorage = {
  getItem: (key: string) => storage().getItem(key),
  setItem: (key: string, value: string) => storage().setItem(key, value),
  retry: (key: string) => storage().retry(key),
  block: (key: string, error: unknown) => storage().block(key, error),
  snapshot: () => storage().snapshot(),
};
