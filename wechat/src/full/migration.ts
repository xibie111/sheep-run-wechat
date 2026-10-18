import { normalizeSaveData } from "../../../src/systems/SaveSystem";
import { STORAGE } from "../../../src/game/Constants";
import type { Wx } from "../platform";
import type { wxStorage } from "./storage";

export const CORE_SAVE_KEY = "sheep-run-wechat-save-v1";
/** Copy the earlier owned wx save once. Never read web/Android or modify the source key. */
export function migrateCoreStorage(api: Pick<Wx, "getStorageSync">, storage: Pick<typeof wxStorage, "getItem" | "setItem" | "block">,
  log: (event: string, value?: unknown) => void): "current" | "new" | "copied" | "blocked" {
  try {
    if (storage.getItem(STORAGE.saveKey) !== null) return "current";
    const old = api.getStorageSync(CORE_SAVE_KEY);
    if (old === "" || old === undefined || old === null) return "new";
    const data = normalizeSaveData(old);
    if (!data) throw Error("原微信基础闭环存档无效，已保留，禁止默认覆盖");
    storage.setItem(STORAGE.saveKey, JSON.stringify(data)); log("full-core-save-copied", { oldKeyPreserved: true }); return "copied";
  } catch (error) {
    // block deliberately throws after retaining the error; callers keep the
    // original display fallback, while every uncertain primary write stays locked.
    try { storage.block(STORAGE.saveKey, error); } catch { log("full-storage-preflight-error", String(error)); }
    return "blocked";
  }
}
