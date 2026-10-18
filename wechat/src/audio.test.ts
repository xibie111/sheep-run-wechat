import { describe, expect, it, vi } from "vitest";
import { WechatAudio } from "./audio";
import { WechatSave } from "./save";
import type { Wx } from "./platform";

function setup() {
  let data: unknown = "", loaded: (() => void) | undefined;
  const contexts: { src: string; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; volume: number }[] = [];
  const api = { getStorageSync: () => structuredClone(data), setStorageSync: (_key: string, value: unknown) => { data = structuredClone(value); },
    loadSubpackage: vi.fn((options: { success: () => void }) => { loaded = options.success; }),
    createInnerAudioContext: vi.fn(() => {
      const context = { src: "", volume: 1, play: vi.fn(), stop: vi.fn(), destroy: vi.fn(), onError: vi.fn(), onPlay: vi.fn() };
      contexts.push(context); return context;
    }),
  } as unknown as Wx;
  const save = new WechatSave(api, vi.fn()), audio = new WechatAudio(api, save, vi.fn());
  return { audio, save, contexts, loaded: () => loaded?.() };
}
describe("native WeChat audio lifecycle", () => {
  it("does not start late-loaded music in the background; requires a new gesture", () => {
    const { audio, loaded, contexts } = setup();
    audio.gesture(); audio.suspend(); loaded(); expect(contexts).toHaveLength(0);
    audio.gesture(); expect(contexts).toHaveLength(1); expect(contexts[0].src).toBe("music/pasture-morning.wav");
    expect(contexts[0].play).toHaveBeenCalledTimes(1);
    audio.gesture(); expect(contexts[0].play).toHaveBeenCalledTimes(1);
  });
  it("stops all contexts, honors independent switches and keeps cue contexts bounded", () => {
    const { audio, save, loaded, contexts } = setup();
    audio.gesture(); loaded(); audio.play("jump"); audio.play("jump"); expect(contexts).toHaveLength(2);
    save.updateSettings({ sfx: false, music: false }); audio.settingsChanged(); audio.play("jump");
    expect(contexts[1].play).toHaveBeenCalledTimes(2); expect(contexts[0].stop).toHaveBeenCalled();
    audio.suspend(); audio.play("hit"); expect(contexts).toHaveLength(2);
    audio.destroy(); contexts.forEach(context => expect(context.destroy).toHaveBeenCalledOnce());
  });
  it("ignores completed subpackage loading after destruction", () => {
    const { audio, loaded, contexts } = setup();
    audio.gesture(); audio.destroy(); loaded(); expect(contexts).toHaveLength(0);
  });
});
