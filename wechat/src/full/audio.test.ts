import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSystem } from "./audio";

const save = vi.hoisted(() => ({ settings: { music: true, sfx: true, musicVolume: 1, sfxVolume: 1 } }));
const storage = vi.hoisted(() => ({ failed: false }));
vi.mock("../../../src/systems/SaveSystem", () => ({ SaveSystem: {
  load: () => save,
  loadForTransaction: () => storage.failed ? null : save,
  updateSettings: (patch: object) => { if (storage.failed) return { ...save, settings: { ...save.settings, ...patch } }; Object.assign(save.settings, patch); return save; },
} }));
function fixture() {
  const contexts: any[] = [], loads: any[] = [];
  const wx = { loadSubpackage: vi.fn(options => { loads.push(options); }), createInnerAudioContext: vi.fn(() => {
    let played = () => {}, failed = (_value: unknown) => {};
    const context = { src: "", volume: 0, loop: false, autoplay: false,
      play: vi.fn(() => played()), stop: vi.fn(), destroy: vi.fn(), onPlay: (fn: () => void) => { played = fn; },
      onError: (fn: (value: unknown) => void) => { failed = fn; }, error: (value: unknown) => failed(value), latePlay: () => played() };
    contexts.push(context); return context;
  }) };
  vi.stubGlobal("GameGlobal", { __SHEEP_WX_HOST__: { wx, log: vi.fn() } });
  return { audio: new AudioSystem(), wx, contexts, loads };
}
beforeEach(() => { storage.failed = false; Object.assign(save.settings, { music: true, sfx: true, musicVolume: 1, sfxVolume: 1 }); });
describe("full native audio lifetime and retry", () => {
  it("requires touch, bounds cue contexts, and applies the original channel volumes", () => {
    const { audio, contexts, loads, wx } = fixture(); audio.play("jump"); expect(contexts).toHaveLength(0);
    audio.initializeAfterGesture(); audio.initializeAfterGesture(); expect(wx.loadSubpackage).toHaveBeenCalledTimes(1);
    loads[0].success(); audio.play("jump"); audio.play("jump"); expect(contexts).toHaveLength(2);
    expect(contexts[0].volume).toBe(.28); expect(contexts[1].play).toHaveBeenCalledTimes(2);
    audio.adjustVolume("sfx", -1); expect(contexts[1].volume).toBe(.9);
    audio.toggleSfx(); audio.play("jump"); expect(contexts[1].play).toHaveBeenCalledTimes(2);
    expect(contexts[1].stop).toHaveBeenCalled(); audio.destroy();
  });
  it("does not start music when a delayed subpackage completes in the background", () => {
    const { audio, loads, contexts } = fixture(); audio.initializeAfterGesture(); audio.suspend(); loads[0].success();
    expect(contexts).toHaveLength(0); audio.initializeAfterGesture(); expect(contexts).toHaveLength(1);
    audio.suspend(); const stops = contexts[0].stop.mock.calls.length; contexts[0].latePlay();
    expect(contexts[0].stop).toHaveBeenCalledTimes(stops + 1); audio.destroy();
  });
  it("retries a failed music load explicitly and disposes failed playback contexts", () => {
    const { audio, loads, contexts } = fixture(); audio.initializeAfterGesture(); loads[0].fail("network failure");
    expect(audio.error).toContain("network failure"); audio.initializeAfterGesture(); expect(loads).toHaveLength(1);
    audio.retryAfterGesture(); expect(audio.error).toBe("");
    loads[1].success(); contexts[0].error("decoder failure"); expect(audio.error).toContain("decoder failure");
    audio.retryAfterGesture(); expect(contexts[0].destroy).toHaveBeenCalledOnce();
    expect(contexts).toHaveLength(2); expect(audio.error).toBe(""); contexts[0].error("stale error"); expect(audio.error).toBe(""); audio.destroy();
  });
  it("ignores delayed subpackage callbacks after destruction", () => {
    const { audio, loads, contexts } = fixture(); audio.initializeAfterGesture(); audio.destroy(); loads[0].success();
    expect(contexts).toHaveLength(0); expect(audio.initializeAfterGesture()).toBe(false); expect(audio.retryAfterGesture()).toBe(false);
  });
  it("honors session mute when persistence fails without replacing the previous stored settings", () => {
    const { audio, loads, contexts } = fixture(); audio.initializeAfterGesture(); loads[0].success(); storage.failed = true;
    audio.toggleSfx(); audio.toggleMusic(); audio.adjustVolume("sfx", -1);
    expect(audio.currentSettings).toEqual({ music: false, sfx: false, musicVolume: 1, sfxVolume: .9 });
    expect(save.settings.sfx).toBe(true); expect(save.settings.music).toBe(true); audio.play("jump"); expect(contexts).toHaveLength(1);
    audio.retryAfterGesture(); expect(audio.currentSettings.sfx).toBe(false);
    storage.failed = false; audio.retryAfterGesture(); expect(audio.currentSettings.sfx).toBe(true); audio.destroy();
  });
});
