import { describe, expect, it, vi } from "vitest";
import { defaultSaveData } from "../../src/systems/SaveSystem";
import { WechatSave, WECHAT_SAVE_KEY } from "./save";
import { WechatSession } from "./session";

function storage(initial: unknown = "") {
  let value = initial;
  const api = { getStorageSync: vi.fn((_key: string): unknown => structuredClone(value)),
    setStorageSync: vi.fn((_key: string, data: unknown) => { value = structuredClone(data); }) };
  const save = new WechatSave(api, vi.fn());
  return { save, api, raw: () => value };
}
describe("isolated formal WeChat save", () => {
  it("uses only its own key and reads committed schema 5 in a fresh session", () => {
    const { save, api } = storage();
    save.recordTotalStars(); save.recordHighScore(125);
    const next = new WechatSave(api, vi.fn());
    expect(next.load()).toMatchObject({ version: 5, totalStars: 1, highScore: 125, spentStars: 0, coins: 0 });
    expect(new Set([...api.getStorageSync.mock.calls, ...api.setStorageSync.mock.calls].map(call => call[0])))
      .toEqual(new Set([WECHAT_SAVE_KEY]));
  });
  it.each([{ ...defaultSaveData(), coins: -1 }, { ...defaultSaveData(), version: 999 }, "bad JSON"])(
    "preserves malformed/future storage, including settings and settlement attempts", raw => {
      const { save, api } = storage(raw);
      save.updateSettings({ sfx: false }); save.recordTotalStars(); new WechatSession(save).finish();
      expect(save.writable).toBe(false); expect(save.error).not.toBe("");
      expect(api.setStorageSync).not.toHaveBeenCalled();
    });
  it("does not overwrite defaults after a read exception; explicit retry rereads old data", () => {
    const { api } = storage({ ...defaultSaveData(), highScore: 99 });
    api.getStorageSync.mockImplementationOnce(() => { throw Error("denied"); });
    const save = new WechatSave(api, vi.fn());
    save.updateSettings({ music: false }); expect(api.setStorageSync).not.toHaveBeenCalled();
    expect(save.retryRead()).toBe(true); expect(save.load().highScore).toBe(99);
  });
  it("flags a readback mismatch and prevents further uncertain writes", () => {
    const { save, api } = storage(defaultSaveData());
    api.setStorageSync.mockImplementation(() => {});
    expect(save.recordHighScore(200)).toBe(0);
    expect(save.writable).toBe(false);
    save.recordTotalStars(); expect(api.setStorageSync).toHaveBeenCalledTimes(1);
  });
  it("retains original score, immediate stars, best and capped coin reward exactly once", () => {
    const { save, api } = storage();
    const run = new WechatSession(save);
    run.score.update(190, 1000); run.score.awardPassedObstacle(); run.score.awardStar(2);
    expect(run.score.score).toBe(247); // floor(190*.12) + 25 + 100*2
    expect(save.load().totalStars).toBe(1);
    const first = run.finish(), writes = api.setStorageSync.mock.calls.length;
    expect(first).toEqual({ score: 247, best: 247, newRecord: true, coinsEarned: 9, coinBalance: 9 });
    expect(run.finish()).toEqual(first); expect(api.setStorageSync).toHaveBeenCalledTimes(writes);
    const second = new WechatSession(save); second.score.update(10000, 1000);
    expect(second.finish().coinsEarned).toBe(20); expect(save.load().coins).toBe(29);
  });
  it("reports failed settlement without inventing a successful balance", () => {
    const { save, api } = storage(defaultSaveData());
    const run = new WechatSession(save); run.score.awardStar();
    api.setStorageSync.mockImplementation(() => { throw Error("disk full"); });
    expect(run.finish()).toMatchObject({ saveFailed: true, best: 0, coinsEarned: 4, coinBalance: 0 });
    const writes = api.setStorageSync.mock.calls.length;
    run.finish(); expect(api.setStorageSync).toHaveBeenCalledTimes(writes);
  });
});
