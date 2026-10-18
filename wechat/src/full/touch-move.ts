import type Phaser from "phaser";
import type { WindowInfo, WxTouch } from "../platform";

/** Phaser 4.2.1 Pointer methods omitted from its public declarations. */
interface MovingPointer extends Phaser.Input.Pointer { touchmove(touch: WxTouch, event: unknown): void }
interface MoveManager {
  pointers: MovingPointer[]; activePointer: MovingPointer; isOver: boolean;
  setCanvasOver(event: unknown): void; setCanvasOut(event: unknown): void;
  updateInputPlugins(type: number, pointers: MovingPointer[]): void;
}

/**
 * wx owns screen touches; DevTools' elementFromPoint returns a different canvas wrapper.
 * Adapted from Phaser InputManager.onTouchMove, MIT, (c) 2026 Richard Davey, Phaser Studio Inc.
 * Full notice is retained in the build's licenses/Phaser-MIT.txt.
 */
export function moveScreenTouches(manager: MoveManager, event: { changedTouches: WxTouch[] }, window: WindowInfo, moveType: number): void {
  const moved: MovingPointer[] = [];
  for (const touch of event.changedTouches) {
    const pointer = manager.pointers.slice(1).find(pointer => pointer.active && pointer.identifier === touch.identifier);
    if (!pointer) continue;
    const inside = touch.clientX >= 0 && touch.clientY >= 0 && touch.clientX < window.windowWidth && touch.clientY < window.windowHeight;
    if (!manager.isOver && inside) manager.setCanvasOver(event);
    else if (manager.isOver && !inside) manager.setCanvasOut(event);
    if (inside) { pointer.touchmove(touch, event); manager.activePointer = pointer; moved.push(pointer); }
  }
  manager.updateInputPlugins(moveType, moved);
}
