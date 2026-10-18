import type Phaser from "phaser";
import type { Host } from "../platform";
import { viewMetrics } from "../state";
declare const GameGlobal: { __SHEEP_WX_HOST__: Host };
export function fullUiInsets(view: ReturnType<typeof viewMetrics>, capsule?: { left: number; right: number; top: number; bottom: number }) {
  const safe = { ...view.safe };
  if (capsule && [capsule.left, capsule.right, capsule.top, capsule.bottom].every(Number.isFinite) && capsule.right > capsule.left && capsule.bottom > capsule.top &&
    capsule.right > view.left && capsule.left < view.left + view.size.width * view.fit) safe.top = Math.max(safe.top, Math.ceil((capsule.bottom - view.top) / view.fit));
  return safe;
}
export function safeUiInsets(_scene: Phaser.Scene) {
  const host = GameGlobal.__SHEEP_WX_HOST__, view = viewMetrics(host.windowInfo());
  return fullUiInsets(view, host.wx.getMenuButtonBoundingClientRect?.());
}
