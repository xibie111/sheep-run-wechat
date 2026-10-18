import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type Phaser from "phaser";
import { createNativeCanvas, surfaceSelectorMatches } from "./surfaces";
const surface = (display: string, adventureOverlay: string) => ({ dataset: { adventureOverlay }, style: { display } }) as unknown as Pick<HTMLCanvasElement, "dataset" | "style">;
describe("native canvas priority tags", () => {
  it("supports the full RunGoal's comma-separated visible toast query", () => {
    const selector = '[data-adventure-overlay="journey-toast"][style*="display: block"],[data-adventure-overlay="collection-toast"][style*="display: block"],[data-easter-egg="score"][style*="display: block"]';
    expect(surfaceSelectorMatches(surface("block", "collection-toast"), selector)).toBe(true);
    expect(surfaceSelectorMatches(surface("none", "collection-toast"), selector)).toBe(false);
    expect(surfaceSelectorMatches(surface("block", "other"), selector)).toBe(false);
  });
  it("keeps ordinary data lookup and fails explicitly for unsupported layout selectors", () => {
    expect(surfaceSelectorMatches(surface("none", "journey-toast"), '[data-adventure-overlay="journey-toast"]')).toBe(true);
    expect(() => surfaceSelectorMatches(surface("block", "other"), ".any-dom-layout")).toThrow("Unsupported");
  });
  it("releases both lifecycle callbacks when a reusable scene shuts down", () => {
    const events = new EventEmitter(), scene = { events } as unknown as Phaser.Scene;
    vi.stubGlobal("GameGlobal", { __SHEEP_WX_HOST__: { wx: { createCanvas: () => ({}) } } });
    try {
      for (let restart = 0; restart < 4; restart++) {
        createNativeCanvas(scene); expect(events.listenerCount("destroy")).toBe(1); events.emit("shutdown");
        expect(events.listenerCount("destroy")).toBe(0); expect(events.listenerCount("shutdown")).toBe(0);
      }
    } finally { vi.unstubAllGlobals(); }
  });
});
