import { SaveSystem, type SaveData } from "../../../src/systems/SaveSystem";
import type { AudioCue, AudioChannel } from "../../../src/systems/AudioSystem";
import type { Host, Wx } from "../platform";
import { PASTURE_MUSIC } from "../../../src/data/musicAssets";

export type { AudioCue, AudioChannel } from "../../../src/systems/AudioSystem";
declare const GameGlobal: { __SHEEP_WX_HOST__: Host };
type Context = ReturnType<Wx["createInnerAudioContext"]>;
export class AudioSystem {
  private contexts = new Map<string, Context>();
  private armed = false;
  private stopped = false;
  private destroyed = false;
  private musicLoaded = false;
  private musicLoading = false;
  private musicPlaying = false;
  private settings?: SaveData["settings"];
  error = "";
  plays = 0;
  private get host() { return GameGlobal.__SHEEP_WX_HOST__; }
  get currentSettings() { return { ...(this.settings ??= SaveSystem.load().settings) }; }
  private fail(error: unknown): void { this.error = typeof error === "string" ? error : JSON.stringify(error); this.host.log("full-audio-error", error); }
  private context(name: string, path: string, loop: boolean): Context {
    let context = this.contexts.get(name);
    if (!context) {
      context = this.host.wx.createInnerAudioContext(); context.src = path; context.loop = loop; context.autoplay = false;
      context.onError(error => { if (this.destroyed || this.contexts.get(name) !== context) return; if (loop) this.musicPlaying = false; this.fail(error); });
      context.onPlay(() => {
        if (this.destroyed || this.stopped || this.contexts.get(name) !== context) { context!.stop(); return; }
        this.plays++; this.host.log("full-audio-play", { name, audibility: "NOT_MEASURED" });
      });
      this.contexts.set(name, context);
    }
    return context;
  }
  initializeAfterGesture(): boolean {
    if (this.destroyed) return false;
    this.armed = true; this.stopped = false; this.startMusic(); return true;
  }
  retryAfterGesture(): boolean {
    if (this.destroyed) return false;
    this.suspend(); for (const context of this.contexts.values()) context.destroy(); this.contexts.clear();
    const stored = SaveSystem.loadForTransaction(); if (stored) this.settings = { ...stored.settings };
    this.error = "";
    return this.initializeAfterGesture();
  }
  play(cue: AudioCue): void {
    const settings = this.currentSettings;
    if (!this.armed || this.stopped || this.destroyed || !settings.sfx || settings.sfxVolume <= 0) return;
    try { const context = this.context(cue, `assets/${cue}.wav`, false); context.volume = settings.sfxVolume; context.stop(); context.play(); }
    catch (error) { this.fail(error); }
  }
  private startMusic(): void {
    const settings = this.currentSettings;
    if (!this.armed || this.stopped || this.destroyed || this.error || !settings.music || settings.musicVolume <= 0) return;
    if (!this.musicLoaded) {
      if (this.musicLoading) return;
      if (!this.host.wx.loadSubpackage) { this.fail("wx.loadSubpackage unavailable"); return; }
      this.musicLoading = true;
      try { this.host.wx.loadSubpackage({ name: "music", success: () => {
        this.musicLoading = false; if (this.destroyed) return; this.musicLoaded = true; this.startMusic();
      }, fail: error => { this.musicLoading = false; if (!this.destroyed) this.fail(error); } }); }
      catch (error) { this.musicLoading = false; this.fail(error); }
      return;
    }
    try { const context = this.context("music", "music/pasture-morning.wav", true); context.volume = settings.musicVolume * PASTURE_MUSIC.volume;
      if (!this.musicPlaying) { context.play(); this.musicPlaying = true; } }
    catch (error) { this.fail(error); }
  }
  private apply(): void {
    const settings = this.currentSettings;
    for (const [name, context] of this.contexts) {
      if (name === "music") { context.volume = settings.musicVolume * PASTURE_MUSIC.volume; if (!settings.music || settings.musicVolume === 0) { context.stop(); this.musicPlaying = false; } }
      else { context.volume = settings.sfxVolume; if (!settings.sfx || settings.sfxVolume === 0) context.stop(); }
    }
    this.startMusic();
  }
  private updateSettings(patch: Partial<SaveData["settings"]>): void {
    this.settings = { ...this.currentSettings, ...patch }; SaveSystem.updateSettings(this.settings); this.apply();
  }
  toggleMusic(): boolean { this.updateSettings({ music: !this.currentSettings.music }); return this.currentSettings.music; }
  toggleSfx(): boolean { this.updateSettings({ sfx: !this.currentSettings.sfx }); return this.currentSettings.sfx; }
  adjustVolume(channel: AudioChannel, direction: -1 | 1): number {
    const key = channel === "music" ? "musicVolume" : "sfxVolume";
    const value = Math.round(Math.max(0, Math.min(1, this.currentSettings[key] + direction * .1)) * 10) / 10;
    this.updateSettings({ [key]: value }); return value;
  }
  suspend(): void { this.stopped = true; this.musicPlaying = false; for (const context of this.contexts.values()) context.stop(); }
  destroy(): void { if (this.destroyed) return; this.suspend(); this.destroyed = true; for (const context of this.contexts.values()) context.destroy(); this.contexts.clear(); }
}
