import Phaser from "phaser";
import { WORLD } from "../../src/game/Constants";
import { RESULT_BOXES, resultPlacement } from "../../src/ui/ResultLayout";
import { contains, touchPoint, viewMetrics, type Rect } from "./state";
import type { Host } from "./platform";
import type { SaveData } from "../../src/systems/SaveSystem";
import type { WechatResult } from "./session";
import T from "../ui-text.json";

export type Screen = "menu" | "run" | "paused" | "ending" | "result" | "settings";
export interface UiState {
  screen: Screen; score: number; stars: number; save: SaveData; result: WechatResult | null;
  storageError: string; audioError: string; saveVerified: boolean;
  effects: { type: "magnet" | "shield" | "starMultiplier" | "dash"; remainingMs: number }[];
}
export class WechatUI extends Phaser.Scene {
  buttons: { id: string; rect: Rect }[] = [];
  private scoreText?: Phaser.GameObjects.BitmapText;
  private effectText?: Phaser.GameObjects.BitmapText;
  private hintText?: Phaser.GameObjects.BitmapText;
  private statusSignature = "";
  constructor(private readonly host: Host, private readonly state: () => UiState,
    private readonly cameraLayout: (scene: Phaser.Scene, world: boolean) => void) { super("WxUI"); }
  create(): void { this.cameraLayout(this, false); this.refresh(); }
  private label(x: number, y: number, value: string, size = 14, maxWidth = Infinity) {
    const text = this.add.bitmapText(x, y, "poc-font", value, size).setOrigin(0.5);
    if (text.width > maxWidth) text.setScale(maxWidth / text.width);
    return text;
  }
  private button(id: string, rect: Rect, value?: string): void {
    this.buttons.push({ id, rect });
    if (value) {
      this.add.rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height, 0xfff3d6, .96)
        .setStrokeStyle(1, 0x92633d);
      this.label(rect.x + rect.width / 2, rect.y + rect.height / 2, value, 13, rect.width - 8);
    }
  }
  refresh(): void {
    if (!this.sys.displayList) return;
    this.children.removeAll(true); this.buttons = []; this.scoreText = undefined; this.effectText = undefined; this.hintText = undefined;
    this.cameraLayout(this, false);
    const s = this.state(), v = viewMetrics(this.host.windowInfo()), cx = v.size.width / 2, cy = v.size.height / 2;
    this.statusSignature = `${s.screen}|${s.storageError}|${s.audioError}|${s.saveVerified}|${JSON.stringify(s.save.settings)}`;
    if (s.screen === "menu" || s.screen === "settings") {
      this.add.tileSprite(0, 0, v.size.width, v.size.height, "poc-far").setOrigin(0);
      this.add.tileSprite(0, v.origin.y, v.size.width, WORLD.height, "poc-near").setOrigin(0);
    }
    if (s.screen === "menu") {
      this.add.image(cx, v.safe.top + 65, "menu-title").setDisplaySize(220, 102.5);
      this.add.sprite(cx - 120, v.origin.y + WORLD.groundY, "sheep-runner").setOrigin(.5, 1).setDisplaySize(64, 56).play("sheep-idle");
      const start = { x: cx - 76.5, y: v.size.height - v.safe.bottom - 65, width: 153, height: 52 };
      this.add.image(cx, start.y + 26, "menu-start").setDisplaySize(start.width, start.height); this.button("start", start);
      this.label(cx, v.safe.top + 125, `${T.best} ${s.save.highScore}   ${T.stars} ${s.save.totalStars}`, 13, v.size.width - v.safe.left - v.safe.right - 24);
      this.button("settings", { x: v.safe.left + 8, y: v.safe.top + 8, width: 52, height: 30 }, T.settings);
      this.hintText = this.label(cx, v.size.height - v.safe.bottom - 6, T.hint, 11);
      this.storageStatus(cx, v.safe.top + 148, s);
      return;
    }
    if (s.screen === "settings") {
      this.add.rectangle(cx, cy, v.size.width, v.size.height, 0x29190e, .45);
      this.add.rectangle(cx, cy, 304, 232, 0xfff3d6).setStrokeStyle(3, 0x92633d);
      this.label(cx, cy - 96, T.settings, 20);
      for (const [channel, y] of [["music", cy - 57], ["sfx", cy - 15]] as const) {
        const volume = channel === "music" ? s.save.settings.musicVolume : s.save.settings.sfxVolume;
        this.button(channel, { x: cx - 137, y: y - 15, width: 94, height: 30 }, `${T[channel]} ${s.save.settings[channel] ? T.on : T.off}`);
        this.button(`${channel}-down`, { x: cx - 33, y: y - 15, width: 32, height: 30 }, "-");
        this.label(cx + 33, y, `${Math.round(volume * 100)}`, 13);
        this.button(`${channel}-up`, { x: cx + 66, y: y - 15, width: 32, height: 30 }, "+");
      }
      this.storageStatus(cx, cy + 22, s);
      this.label(cx, cy + 45, s.audioError ? T.audioError : "", 11, 270);
      if (s.storageError || s.audioError) this.button("retry-settings", { x: cx - 45, y: cy + 58, width: 90, height: 26 }, T.retry);
      this.button("back", { x: cx - 58, y: cy + 87, width: 116, height: 26 }, T.back);
      return;
    }
    if (s.screen === "result" && s.result) {
      this.add.rectangle(cx, cy, v.size.width, v.size.height, 0x29190e, .42);
      const p = resultPlacement(v.size, v.safe), transform = (r: Rect): Rect =>
        ({ x: p.x + r.x * p.scale, y: p.y + r.y * p.scale, width: r.width * p.scale, height: r.height * p.scale });
      this.add.image(p.x + 240 * p.scale, p.y + 135 * p.scale, "result-panel").setDisplaySize(480 * p.scale, 270 * p.scale);
      const label = (r: Rect, value: string, size: number) => { const b = transform(r); this.label(b.x + b.width / 2, b.y + b.height / 2, value, size * p.scale, b.width); };
      label(RESULT_BOXES.title, T.score, 23); label(RESULT_BOXES.score, String(s.result.score), 34);
      label(RESULT_BOXES.whisper, !s.result.saveFailed && s.result.newRecord ? T.record : "", 14);
      label(RESULT_BOXES.best, s.result.saveFailed ? T.saveError : `${T.best} ${s.result.best}`, 14);
      label(RESULT_BOXES.earned, s.result.saveFailed ? T.saveError : `${T.coins} +${s.result.coinsEarned}`, 14);
      for (const [id, name, box, value] of [["restart", "retry", RESULT_BOXES.retry, T.again], ["home", "home", RESULT_BOXES.home, T.home]] as const) {
        const b = transform(box);
        this.add.image(b.x + b.width / 2, b.y + b.height / 2, `result-${name}`).setDisplaySize(b.width, b.height);
        this.label(b.x + b.width / 2, b.y + b.height / 2, value, 13 * p.scale, b.width - 10); this.button(id, b);
      }
      return;
    }
    const pause = { x: v.size.width - v.safe.right - 66, y: v.safe.top + 5, width: 58, height: 30 };
    const capsule = this.host.wx.getMenuButtonBoundingClientRect?.();
    if (capsule && capsule.width > 0) {
      const a = touchPoint(this.host.windowInfo(), capsule.left, capsule.top), b = touchPoint(this.host.windowInfo(), capsule.right, capsule.bottom);
      if (pause.x + pause.width >= a.x && pause.x <= b.x && pause.y <= b.y) pause.y = b.y + 5;
    }
    this.scoreText = this.label(v.safe.left + 116, v.safe.top + 18, "", 13, Math.max(1, pause.x - v.safe.left - 14));
    this.effectText = this.label(cx, v.safe.top + 44, "", 11);
    this.hintText = this.label(cx, v.size.height - v.safe.bottom - 12, T.hint, 11);
    if (s.screen === "run") this.button("pause", pause, T.pause);
    if (s.screen !== "paused") return;
    this.add.rectangle(cx, cy, v.size.width, v.size.height, 0x29190e, .42);
    this.add.image(cx, cy - 7, "pause-art").setDisplaySize(192, 204);
    for (const [id, y, width, height] of [["resume", cy - 18.375, 140, 39.25], ["restart", cy + 21.625, 113.5, 32.25], ["home", cy + 56, 113.5, 31]] as const) {
      this.button(id, { x: cx - width / 2, y: y - height / 2, width, height });
    }
    this.button("settings", { x: cx - 47, y: cy + 85, width: 94, height: 26 }, T.settings);
  }
  private storageStatus(x: number, y: number, s: UiState): void {
    this.label(x, y, s.storageError ? T.saveError : s.saveVerified ? T.saved : "", 11, 270);
  }
  hit(x: number, y: number): string | null {
    return [...this.buttons].reverse().find(button => contains(button.rect, x, y))?.id ?? (this.state().screen !== "run" ? "modal" : null);
  }
  override update(): void {
    const s = this.state();
    const signature = `${s.screen}|${s.storageError}|${s.audioError}|${s.saveVerified}|${JSON.stringify(s.save.settings)}`;
    if (signature !== this.statusSignature) this.refresh();
    this.scoreText?.setText(`${T.score} ${s.score}   ${T.stars} ${s.stars}`);
    this.effectText?.setText(s.effects.filter(effect => effect.type !== "dash").map(effect => `${T[effect.type as "magnet" | "shield" | "starMultiplier"]} ${Math.ceil(effect.remainingMs / 1000)}`).join("  "));
    if (s.storageError) this.hintText?.setText(T.saveError);
  }
}
