import type { AudioCue } from "../../src/systems/AudioSystem";
import { PASTURE_MUSIC } from "../../src/data/musicAssets";
import type { Host, Wx } from "./platform";
import type { WechatSave } from "./save";

type Context = ReturnType<Wx["createInnerAudioContext"]>;
/** One bounded context per used cue, one music context, no audio/game timer. */
export class WechatAudio {
  private readonly cues = new Map<AudioCue, Context>();
  private music?: Context;
  private armed = false;
  private foreground = true;
  private disposed = false;
  private musicState: "unloaded" | "loading" | "ready" | "failed" = "unloaded";
  private musicPlaying = false;
  private plays = 0;
  error = "";

  constructor(private readonly api: Wx, private readonly save: WechatSave, private readonly log: Host["log"]) {}
  private fail(error: unknown): void {
    this.error = String(error); this.log("audio-error", this.error);
  }
  private create(src: string, loop: boolean): Context {
    const context = this.api.createInnerAudioContext();
    context.src = src; context.loop = loop; context.autoplay = false;
    context.onError(error => { if (loop) this.musicPlaying = false; this.fail(error); });
    context.onPlay(() => {
      this.plays++; this.log("audio-play", { src, plays: this.plays, audibility: "NOT_MEASURED" });
    });
    return context;
  }
  gesture(): void {
    if (this.disposed) return;
    this.armed = true; this.foreground = true; this.startMusic();
  }
  play(cue: AudioCue): void {
    const settings = this.save.load().settings;
    if (this.disposed || !this.armed || !this.foreground || !settings.sfx || settings.sfxVolume <= 0) return;
    try {
      let context = this.cues.get(cue);
      if (!context) { context = this.create(`assets/${cue}.wav`, false); this.cues.set(cue, context); }
      context.volume = settings.sfxVolume;
      context.stop(); context.play();
    } catch (error) { this.fail(error); }
  }
  private startMusic(): void {
    const settings = this.save.load().settings;
    if (this.disposed || !this.armed || !this.foreground || !settings.music || settings.musicVolume <= 0) return;
    if (this.musicState === "unloaded") {
      if (!this.api.loadSubpackage) { this.musicState = "failed"; this.fail("wx.loadSubpackage 不可用，音乐未加载"); return; }
      this.musicState = "loading";
      try {
        this.api.loadSubpackage({ name: "music", success: () => {
          if (this.disposed) return;
          this.musicState = "ready"; this.error = ""; this.startMusic();
        }, fail: error => { this.musicState = "failed"; this.fail(error); } });
      } catch (error) { this.musicState = "failed"; this.fail(error); }
      return;
    }
    if (this.musicState !== "ready") return;
    try {
      this.music ??= this.create("music/pasture-morning.wav", true);
      this.music.volume = settings.musicVolume * PASTURE_MUSIC.volume;
      if (!this.musicPlaying) { this.music.play(); this.musicPlaying = true; }
    } catch (error) { this.musicPlaying = false; this.fail(error); }
  }
  settingsChanged(): void {
    const settings = this.save.load().settings;
    for (const context of this.cues.values()) { context.stop(); context.volume = settings.sfxVolume; }
    if (!settings.music || settings.musicVolume <= 0) { this.music?.stop(); this.musicPlaying = false; }
    this.startMusic();
  }
  retryMusic(): void {
    if (this.musicState === "failed") this.musicState = "unloaded";
    this.error = ""; this.startMusic();
  }
  suspend(): void {
    this.foreground = false;
    for (const context of this.cues.values()) context.stop();
    this.music?.stop(); this.musicPlaying = false;
    this.log("audio-stopped", { contexts: this.cues.size + (this.music ? 1 : 0) });
  }
  snapshot() {
    return { plays: this.plays, contexts: this.cues.size + (this.music ? 1 : 0), musicState: this.musicState,
      musicPlaying: this.musicPlaying, foreground: this.foreground, error: this.error };
  }
  destroy(): void {
    if (this.disposed) return;
    this.suspend(); this.disposed = true;
    for (const context of this.cues.values()) context.destroy();
    this.cues.clear(); this.music?.destroy(); this.music = undefined;
  }
}
