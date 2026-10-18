import { defaultSaveData, normalizeSaveData, type SaveData } from "../../src/systems/SaveSystem";
import type { Wx } from "./platform";

/** Deliberately separate from both the web save and the first-phase PoC key. */
export const WECHAT_SAVE_KEY = "sheep-run-wechat-save-v1";
type Storage = Pick<Wx, "getStorageSync" | "setStorageSync">;
const copy = (data: SaveData): SaveData => JSON.parse(JSON.stringify(data));

export class WechatSave {
  private failures = 0;
  private blocked = false;
  private data = defaultSaveData();
  persisted = false;
  error = "";

  constructor(private readonly api: Storage, private readonly log: (event: string, data?: unknown) => void) {
    this.read();
  }
  get failureCount(): number { return this.failures; }
  get writable(): boolean { return !this.blocked; }
  load(): SaveData { return copy(this.data); }
  loadForTransaction(): SaveData | null {
    if (this.blocked || !this.read()) return null;
    return this.load();
  }
  /** An explicit user retry rereads existing data; it never clears it. */
  retryRead(): boolean { return this.read(); }

  private fail(error: unknown): false {
    this.failures++; this.blocked = true; this.error = String(error);
    this.log("storage-error", { key: WECHAT_SAVE_KEY, error: this.error });
    return false;
  }
  private read(): boolean {
    try {
      const raw = this.api.getStorageSync(WECHAT_SAVE_KEY);
      // wx returns an empty string for an absent key; no legacy/web/PoC reads.
      const data = raw === "" || raw === undefined || raw === null ? defaultSaveData() : normalizeSaveData(raw);
      if (!data) throw new Error("微信存档格式无效或版本不支持，已保留原数据");
      this.persisted = raw !== "" && raw !== undefined && raw !== null;
      this.data = data; this.blocked = false; this.error = "";
      this.log("storage-read-ok", { key: WECHAT_SAVE_KEY, version: data.version });
      return true;
    } catch (error) { return this.fail(error); }
  }
  save(value: SaveData): boolean {
    if (this.blocked) { this.log("storage-write-blocked", { key: WECHAT_SAVE_KEY }); return false; }
    const data = normalizeSaveData(value);
    if (!data) return this.fail(new Error("拒绝写入无效存档"));
    // Check the current persisted value again, protecting corrupt/future data.
    if (!this.read()) return false;
    try {
      this.api.setStorageSync(WECHAT_SAVE_KEY, copy(data));
      const readback = normalizeSaveData(this.api.getStorageSync(WECHAT_SAVE_KEY));
      if (!readback || JSON.stringify(readback) !== JSON.stringify(data)) throw new Error("微信存档写入后读回不一致");
      this.data = readback; this.error = "";
      this.persisted = true;
      this.log("storage-readback-ok", { key: WECHAT_SAVE_KEY, highScore: data.highScore, totalStars: data.totalStars, coins: data.coins });
      return true;
    } catch (error) { return this.fail(error); }
  }
  recordTotalStars(count = 1): SaveData {
    const save = this.loadForTransaction();
    if (!save) return this.load();
    const previous = save.totalStars;
    const amount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    save.totalStars = Math.min(Number.MAX_SAFE_INTEGER, previous + amount);
    this.save(save);
    return this.load();
  }
  recordHighScore(score: number): number {
    const save = this.loadForTransaction();
    if (!save) return this.data.highScore;
    const previous = save.highScore;
    save.highScore = Math.max(previous, Number.isFinite(score) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(score))) : 0);
    return this.save(save) ? save.highScore : previous;
  }
  updateSettings(patch: Partial<SaveData["settings"]>): SaveData {
    const save = this.loadForTransaction();
    if (!save) return this.load();
    save.settings = { ...save.settings, ...patch };
    this.save(save);
    return this.load();
  }
}
