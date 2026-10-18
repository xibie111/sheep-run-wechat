import Phaser from "phaser";
import { AudioSystem } from "./audio";
import { SaveSystem } from "../../../src/systems/SaveSystem";
import { addSceneButton } from "../../../src/ui/SceneButton";
import { addDisplayText } from "../../../src/ui/DisplayText";
import { addUiPanel } from "../../../src/ui/PastureUi";
import { watchViewport } from "../../../src/game/Viewport";
import { wxStorage } from "./storage";
import { migrateCoreStorage } from "./migration";
import type { Host } from "../platform";
declare const GameGlobal: { __SHEEP_WX_HOST__: Host };

export const SETTINGS_KEY = "WxSettingsScene";
/** The original shipped menu has no volume controls; retain the completed wx controls. */
export class NativeSettings extends Phaser.Scene {
  private returnScene = "MenuScene";
  private stopLayout?: () => void;
  constructor() { super(SETTINGS_KEY); }
  init(data?: { returnScene?: string }): void { this.returnScene = data?.returnScene ?? "MenuScene"; }
  create(): void {
    this.draw();
    this.events.once("shutdown", () => { this.stopLayout?.(); this.stopLayout = undefined; });
  }
  private draw(): void {
    this.stopLayout?.(); for (const child of [...this.children.list]) child.destroy();
    const audio = this.registry.get("audioSystem") as AudioSystem, settings = audio.currentSettings;
    const shade = this.add.rectangle(0, 0, 1, 1, 0x29190e, .55).setOrigin(0);
    const root = this.add.container(0, 0);
    root.add(addUiPanel(this, 0, 0, 316, 242));
    root.add(addDisplayText(this, 0, -97, "设置", 24));
    for (const [channel, label, y] of [["music", "音乐", -49], ["sfx", "音效", 1]] as const) {
      const volumeKey = channel === "music" ? "musicVolume" : "sfxVolume";
      const act = (fn: () => void) => () => { audio.initializeAfterGesture(); fn(); this.draw(); };
      root.add(addSceneButton(this, -89, y, `${label}${settings[channel] ? "开" : "关"}`,
        act(() => { if (channel === "music") audio.toggleMusic(); else audio.toggleSfx(); }), { width: 95, height: 36 }).setName(`settings:${channel}-toggle`));
      root.add(addSceneButton(this, -12, y, "-", act(() => { audio.adjustVolume(channel, -1); }), { width: 34, height: 36 }).setName(`settings:${channel}-down`));
      root.add(addDisplayText(this, 31, y, String(Math.round(settings[volumeKey] * 100)), 14));
      root.add(addSceneButton(this, 78, y, "+", act(() => { audio.adjustVolume(channel, 1); }), { width: 34, height: 36 }).setName(`settings:${channel}-up`));
    }
    const storageFailed = wxStorage.snapshot().length > 0;
    root.add(addDisplayText(this, 0, 43, storageFailed ? "保存失败" : audio.error ? "声音加载失败" : "", 12));
    if (storageFailed || audio.error) root.add(addSceneButton(this, 0, 68, "重试", () => {
      for (const item of wxStorage.snapshot()) wxStorage.retry(item.key);
      const host = GameGlobal.__SHEEP_WX_HOST__; migrateCoreStorage(host.wx, wxStorage, host.log);
      audio.retryAfterGesture(); this.draw();
    }, { width: 84, height: 28 }));
    root.add(addSceneButton(this, 0, 102, "返回", () => {
      if (this.returnScene === "PauseScene") audio.suspend();
      this.scene.resume(this.returnScene); this.scene.stop();
    }, { width: 110, height: 30, style: "back" }));
    this.stopLayout = watchViewport(this, size => { root.setPosition(size.width / 2, size.height / 2); shade.setSize(size.width, size.height); });
  }
}
