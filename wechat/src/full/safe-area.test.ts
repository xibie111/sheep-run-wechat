import { describe, expect, it } from "vitest";
import { fullUiInsets } from "./safe-area";
import { viewMetrics } from "../state";

describe("full native UI safe area and capsule", () => {
  for (const dpr of [1, 2, 3]) it(`keeps the original adaptive world and reserves the actual capsule at DPR ${dpr}`, () => {
    const info = { windowWidth: 896, windowHeight: 414, pixelRatio: dpr, safeArea: { left: 40, top: 0, right: 876, bottom: 404 } };
    const view = viewMetrics(info), capsule = { left: 796, top: 8, right: 881, bottom: 40 }, before = JSON.stringify(view);
    const safe = fullUiInsets(view, capsule); expect(safe.top * view.fit + view.top).toBeGreaterThanOrEqual(capsule.bottom);
    expect(safe.left).toBe(view.safe.left); expect(safe.bottom).toBe(view.safe.bottom); expect(JSON.stringify(view)).toBe(before);
    expect(view.size).toEqual({ width: 584, height: 270 });
  });
  it("retains native safe insets when the capsule API is missing or returns an empty rectangle", () => {
    const view = viewMetrics({ windowWidth: 844, windowHeight: 390, pixelRatio: 2 });
    expect(fullUiInsets(view)).toEqual(view.safe); expect(fullUiInsets(view, { left: 0, top: 0, right: 0, bottom: 0 })).toEqual(view.safe);
  });
});
