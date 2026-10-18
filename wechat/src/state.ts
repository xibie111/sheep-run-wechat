import { adaptiveViewportSize, runViewportOrigin } from "../../src/game/Viewport";
import type { WindowInfo, Wx } from "./platform";

export const POC_KEY = "sheep-run-wechat-poc-v1";
export interface Progress { schema: 1; launches: number; stars: number; collisions: number; sfx: boolean }
export function loadProgress(api: Pick<Wx, "getStorageSync">): Progress {
  const raw = api.getStorageSync(POC_KEY);
  if (raw === "" || raw === undefined || raw === null) return { schema: 1, launches: 0, stars: 0, collisions: 0, sfx: true };
  if (typeof raw !== "object") throw new Error("PoC storage is malformed");
  const p = raw as Progress;
  if (p.schema !== 1 || ![p.launches, p.stars, p.collisions].every(n => Number.isSafeInteger(n) && n >= 0) || typeof p.sfx !== "boolean") throw new Error("PoC storage is malformed");
  return { ...p };
}
export function saveProgress(api: Pick<Wx, "getStorageSync" | "setStorageSync">, progress: Progress): void {
  api.setStorageSync(POC_KEY, { ...progress });
  const read = loadProgress(api);
  if (["launches", "stars", "collisions", "sfx"].some(k => read[k as keyof Progress] !== progress[k as keyof Progress])) throw new Error("PoC storage readback mismatch");
}
export function viewMetrics(info: WindowInfo) {
  const size = adaptiveViewportSize(info.windowWidth, info.windowHeight);
  const fit = Math.min(info.windowWidth / size.width, info.windowHeight / size.height);
  const left = (info.windowWidth - size.width * fit) / 2, top = (info.windowHeight - size.height * fit) / 2;
  let safe = info.safeArea ?? { left: 0, top: 0, right: info.windowWidth, bottom: info.windowHeight };
  // Official getWindowInfo documents safeArea in portrait coordinates. If a landscape
  // runtime supplies that form, use symmetric conservative insets until rotation is verified.
  const portraitSafeArea = info.windowWidth > info.windowHeight && safe.bottom > info.windowHeight && safe.right <= info.windowHeight;
  if (portraitSafeArea) {
    const portraitHeight = Math.max(info.screenWidth ?? 0, info.screenHeight ?? 0, info.windowWidth, safe.bottom);
    const portraitWidth = Math.min(info.screenWidth ?? info.windowWidth, info.screenHeight ?? info.windowHeight);
    const horizontal = Math.max(safe.top, portraitHeight - safe.bottom);
    const vertical = Math.max(safe.left, portraitWidth - safe.right);
    safe = { left: horizontal, right: info.windowWidth - horizontal, top: vertical, bottom: info.windowHeight - vertical };
  }
  return { size, fit, left, top, origin: runViewportOrigin(size),
    safeAreaMapping: portraitSafeArea ? "portrait-conservative" : "window",
    dpr: Math.max(1, info.pixelRatio || 1),
    safe: { left: Math.max(0, (safe.left - left) / fit), top: Math.max(0, (safe.top - top) / fit),
      right: Math.max(0, (info.windowWidth - safe.right - left) / fit), bottom: Math.max(0, (info.windowHeight - safe.bottom - top) / fit) } };
}
export function touchPoint(info: WindowInfo, x: number, y: number) {
  const view = viewMetrics(info);
  return { x: (x - view.left) / view.fit, y: (y - view.top) / view.fit };
}
export interface Rect { x: number; y: number; width: number; height: number }
export function contains(rect: Rect, x: number, y: number): boolean { return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height; }

/** A cancelled gesture and UI-owned pointer can never leak a jump. */
export class TouchRouter {
  private owner: { id: number; button: string | null } | null = null;
  down(id: number, button: string | null): boolean {
    if (this.owner) return false;
    this.owner = { id, button }; return button === null;
  }
  move(id: number): boolean { return this.owner?.id === id && this.owner.button === null; }
  up(id: number, button: string | null): { gameplay: boolean; button: string | null } {
    if (this.owner?.id !== id) return { gameplay: false, button: null };
    const owner = this.owner; this.owner = null;
    return { gameplay: owner.button === null, button: owner.button !== null && owner.button === button ? button : null };
  }
  cancel(): void { this.owner = null; }
}
