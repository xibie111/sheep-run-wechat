import { describe, expect, it } from "vitest";
import { InputSystem } from "../../src/systems/InputSystem";
import { INPUT, STORAGE } from "../../src/game/Constants";
import { loadProgress, POC_KEY, saveProgress, TouchRouter, touchPoint, viewMetrics } from "./state";

describe("PoC platform boundaries", () => {
  it("keeps progress separate from real saves and checks persisted values", () => {
    const data = new Map<string, unknown>([[STORAGE.saveKey, "player-save"]]);
    const api = { getStorageSync: (k: string) => data.get(k), setStorageSync: (k: string, v: unknown) => { data.set(k, structuredClone(v)); } };
    const p = loadProgress(api); p.stars = 3; p.launches = 1; saveProgress(api, p);
    expect(loadProgress(api)).toEqual(p); expect(data.get(STORAGE.saveKey)).toBe("player-save"); expect(POC_KEY).not.toBe(STORAGE.saveKey);
    expect(() => saveProgress({ ...api, setStorageSync() {} }, { ...p, stars: 4 })).toThrow("mismatch");
  });
  it("surfaces malformed and denied storage rather than replacing the old value", () => {
    expect(() => loadProgress({ getStorageSync: () => ({ schema: 1, stars: -1 }) })).toThrow("malformed");
    expect(() => loadProgress({ getStorageSync: () => { throw Error("denied"); } })).toThrow("denied");
  });
  it.each([1, 2, 3])("maps DPR %s touches uniformly and retains the wide-screen gameplay origin", dpr => {
    const info = { windowWidth: 896, windowHeight: 414, pixelRatio: dpr, safeArea: { left: 44, right: 884, top: 0, bottom: 398 } };
    const v = viewMetrics(info);
    expect(v.size).toEqual({ width: 584, height: 270 }); expect(v.origin.x).toBe(104);
    const point = touchPoint(info, v.left + 101 * v.fit, v.top + 218 * v.fit);
    expect(point.x).toBeCloseTo(101); expect(point.y).toBeCloseTo(218);
    expect(v.safe.left).toBeGreaterThan(28); expect(v.safe.bottom).toBeGreaterThan(10);
  });
  it("keeps the 480-wide narrow-screen world and bounded extreme aspect ratios", () => {
    const v = viewMetrics({ windowWidth: 800, windowHeight: 600, pixelRatio: 2 });
    expect(v.size).toEqual({ width: 480, height: 360 }); expect(v.origin).toEqual({ x: 0, y: 45 });
    const extreme = viewMetrics({ windowWidth: 2000, windowHeight: 300, pixelRatio: 2 });
    expect(extreme.size.width).toBe(960); expect(extreme.left).toBeGreaterThan(0);
  });
  it("conservatively rotates portrait safeArea when supplied by a landscape runtime", () => {
    const v = viewMetrics({ windowWidth: 844, windowHeight: 390, pixelRatio: 3,
      screenWidth: 844, screenHeight: 390, safeArea: { left: 0, right: 390, top: 47, bottom: 810 } });
    expect(v.safeAreaMapping).toBe("portrait-conservative");
    expect(v.safe.left).toBeCloseTo(v.safe.right); expect(v.safe.left * v.fit).toBeCloseTo(47, 0);
    expect(v.size).toEqual({ width: 584, height: 270 });
  });
  it("owns UI touches until release and discards cancellation and second pointers", () => {
    const r = new TouchRouter();
    expect(r.down(1, "pause")).toBe(false); expect(r.down(2, null)).toBe(false);
    expect(r.move(1)).toBe(false); expect(r.up(2, null).gameplay).toBe(false);
    expect(r.up(1, "pause")).toEqual({ gameplay: false, button: "pause" });
    r.down(1, "resume"); r.cancel(); expect(r.up(1, "resume")).toEqual({ gameplay: false, button: null });
    r.down(1, "pause"); expect(r.up(1, null).button).toBe(null);
  });
  it("reuses incremental swipe, crouch timing, cancel and default-off Dash", () => {
    const input = new InputSystem(false);
    input.handleGesture({ type: "down", pointerId: 1, x: 100, y: 100, at: 0 });
    for (const [y, at] of [[90, 10], [78, 20], [68, 30]]) input.handleGesture({ type: "move", pointerId: 1, x: 100, y, at });
    expect(input.update(30, true).jump).toBe("high");
    input.cancel(); input.handleGesture({ type: "down", pointerId: 1, x: 100, y: 100, at: 100 });
    input.handleGesture({ type: "up", pointerId: 1, x: 100, y: 140, at: 130 });
    expect(input.update(130, true).crouching).toBe(true); expect(input.update(130 + INPUT.crouchDurationMs, true).crouching).toBe(false);
    input.cancel(); input.handleGesture({ type: "down", pointerId: 1, x: 100, y: 100, at: 500 });
    expect(input.update(800, true).dashing).toBe(false); input.cancel();
    input.handleGesture({ type: "up", pointerId: 1, x: 100, y: 100, at: 810 }); expect(input.update(820, true).jump).toBe(null);
  });
});
