import { describe, expect, it, vi } from "vitest";
import { migrateCoreStorage, CORE_SAVE_KEY } from "./migration";
import { createWechatStorage, FULL_STORAGE_PREFIX } from "./storage";
import { defaultSaveData } from "../../../src/systems/SaveSystem";
import { STORAGE } from "../../../src/game/Constants";

function fixture() {
  const values = new Map<string, unknown>(), api = { getStorageSync: vi.fn((key: string) => values.get(key) ?? ""), setStorageSync: vi.fn((key: string, value: unknown) => { values.set(key, value); }) };
  return { api, values, storage: createWechatStorage(api), log: vi.fn() };
}
describe("earlier formal wx save preservation", () => {
  it("copies the existing original v5 schema without spending or changing the earlier key", () => {
    const f = fixture(), save = { ...defaultSaveData(99), coins: 713, totalStars: 91, spentStars: 40 }; f.values.set(CORE_SAVE_KEY, save);
    expect(migrateCoreStorage(f.api, f.storage, f.log)).toBe("copied");
    expect(JSON.parse(f.storage.getItem(STORAGE.saveKey)!)).toEqual(save); expect(f.values.get(CORE_SAVE_KEY)).toBe(save);
    expect(f.api.setStorageSync).toHaveBeenCalledOnce();
  });
  it("does not read the earlier key when the full namespace already has data", () => {
    const f = fixture(), data = JSON.stringify(defaultSaveData(27)); f.values.set(FULL_STORAGE_PREFIX + STORAGE.saveKey, data);
    expect(migrateCoreStorage(f.api, f.storage, f.log)).toBe("current"); expect(f.api.getStorageSync).not.toHaveBeenCalledWith(CORE_SAVE_KEY); expect(f.api.setStorageSync).not.toHaveBeenCalled();
  });
  it("blocks fallback primary writes on an earlier-key read failure and copies only after explicit recovery", () => {
    const f = fixture(), read = f.api.getStorageSync.getMockImplementation()!, save = { ...defaultSaveData(), coins: 713 }; f.values.set(CORE_SAVE_KEY, save);
    f.api.getStorageSync.mockImplementation(key => { if (key === CORE_SAVE_KEY) throw Error("earlier read failed"); return read(key); });
    expect(migrateCoreStorage(f.api, f.storage, f.log)).toBe("blocked"); expect(() => f.storage.setItem(STORAGE.saveKey, JSON.stringify(defaultSaveData()))).toThrow();
    expect(f.api.setStorageSync).not.toHaveBeenCalled(); f.api.getStorageSync.mockImplementation(read); expect(f.storage.retry(STORAGE.saveKey)).toBe(true);
    expect(migrateCoreStorage(f.api, f.storage, f.log)).toBe("copied"); expect(JSON.parse(f.storage.getItem(STORAGE.saveKey)!).coins).toBe(713);
  });
  it("preserves an unsupported earlier envelope and never manufactures a new primary", () => {
    const f = fixture(), invalid = { version: 999, coins: 713 }; f.values.set(CORE_SAVE_KEY, invalid);
    expect(migrateCoreStorage(f.api, f.storage, f.log)).toBe("blocked"); expect(f.values.get(CORE_SAVE_KEY)).toBe(invalid); expect(f.api.setStorageSync).not.toHaveBeenCalled();
  });
});
