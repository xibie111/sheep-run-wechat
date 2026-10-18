import { describe, expect, it, vi } from "vitest";
import { createWechatStorage, FULL_STORAGE_PREFIX } from "./storage";

function fixture() {
  const values = new Map<string, unknown>([["sheep-run-save", "WEB_SENTINEL"], ["sheep-run-wechat-poc-v1", "POC_SENTINEL"]]);
  const api = { getStorageSync: vi.fn((key: string) => values.get(key) ?? ""), setStorageSync: vi.fn((key: string, value: unknown) => { values.set(key, value); }) };
  return { values, api, storage: createWechatStorage(api) };
}
describe("full-game explicit wx storage binding", () => {
  it("roundtrips every original store in a distinct namespace without touching web/PoC keys", () => {
    const { api, values, storage } = fixture();
    for (const key of ["sheep-run-save", "sheep-run-journey-v1", "sheep-run-collections-v1", "sheep-run-delivery-v1"]) {
      const value = JSON.stringify({ version: 1, key }); storage.setItem(key, value); expect(storage.getItem(key)).toBe(value);
    }
    expect(values.get("sheep-run-save")).toBe("WEB_SENTINEL"); expect(values.get("sheep-run-wechat-poc-v1")).toBe("POC_SENTINEL");
    expect([...api.getStorageSync.mock.calls, ...api.setStorageSync.mock.calls].every(([key]) => key.startsWith(FULL_STORAGE_PREFIX))).toBe(true);
  });
  it("preserves malformed bytes and forbids fallback writes until an explicit healthy retry", () => {
    const { values, api, storage } = fixture(); const key = "sheep-run-save";
    values.set(FULL_STORAGE_PREFIX + key, "malformed"); expect(() => storage.getItem(key)).toThrow();
    expect(() => storage.setItem(key, "{}" )).toThrow(); expect(api.setStorageSync).not.toHaveBeenCalled();
    expect(values.get(FULL_STORAGE_PREFIX + key)).toBe("malformed"); values.set(FULL_STORAGE_PREFIX + key, '{"version":5}');
    expect(storage.retry(key)).toBe(true); expect(storage.getItem(key)).toBe('{"version":5}');
  });
  it("locks only the failed key after an uncertain committed write/readback", () => {
    const { api, storage } = fixture(); api.setStorageSync.mockImplementationOnce(() => {});
    expect(() => storage.setItem("one", "{}" )).toThrow("readback");
    expect(() => storage.setItem("one", "{}" )).toThrow(); storage.setItem("two", "{}");
    expect(storage.getItem("two")).toBe("{}"); expect(storage.snapshot()).toHaveLength(1);
  });
  it("reports a syntactically valid unsupported save without replacing it", () => {
    const { api, values } = fixture(), key = "sheep-run-save", raw = '{"version":999,"coins":713}';
    values.set(FULL_STORAGE_PREFIX + key, raw);
    const storage = createWechatStorage(api, undefined, (_key, value) => (value as any).version === 5);
    expect(() => storage.getItem(key)).toThrow("schema"); expect(storage.snapshot()).toHaveLength(1);
    expect(() => storage.setItem(key, '{"version":5}')).toThrow(); expect(api.setStorageSync).not.toHaveBeenCalled();
    expect(values.get(FULL_STORAGE_PREFIX + key)).toBe(raw); expect(storage.retry(key)).toBe(false);
  });
});
