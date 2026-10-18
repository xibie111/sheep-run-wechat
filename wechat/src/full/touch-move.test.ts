import { describe, expect, it, vi } from "vitest";
import { moveScreenTouches } from "./touch-move";

function setup() {
  const mouse = { active: true, identifier: 1, touchmove: vi.fn() };
  const finger = { active: true, identifier: 1, touchmove: vi.fn() };
  const other = { active: true, identifier: 2, touchmove: vi.fn() };
  const manager = { pointers: [mouse, finger, other], activePointer: mouse, isOver: false,
    setCanvasOver: vi.fn(() => { manager.isOver = true; }), setCanvasOut: vi.fn(() => { manager.isOver = false; }), updateInputPlugins: vi.fn() };
  const move = (identifier: number, x: number, y: number) => {
    const event = { changedTouches: [{ identifier, clientX: x, clientY: y }] };
    moveScreenTouches(manager as unknown as Parameters<typeof moveScreenTouches>[0], event, { windowWidth: 844, windowHeight: 390, pixelRatio: 3 }, 4);
    return event;
  };
  return { manager, mouse, finger, other, move };
}

describe("native screen touch movement", () => {
  it("updates the original active finger and input plugins without DOM identity checks", () => {
    const { manager, finger, mouse, move } = setup(), event = move(1, 700, 290);
    expect(finger.touchmove).toHaveBeenCalledWith(event.changedTouches[0], event);
    expect(mouse.touchmove).not.toHaveBeenCalled(); expect(manager.activePointer).toBe(finger);
    expect(manager.setCanvasOver).toHaveBeenCalledOnce(); expect(manager.updateInputPlugins).toHaveBeenCalledWith(4, [finger]);
  });
  it("keeps touch identifiers independent and ignores ended fingers", () => {
    const { manager, finger, other, move } = setup(); move(2, 700, 175);
    expect(finger.touchmove).not.toHaveBeenCalled(); expect(other.touchmove).toHaveBeenCalledOnce();
    other.active = false; move(2, 700, 290); expect(other.touchmove).toHaveBeenCalledOnce();
    expect(manager.updateInputPlugins).toHaveBeenLastCalledWith(4, []);
  });
  it("marks leaving the screen without treating it as a valid swipe", () => {
    const { manager, finger, move } = setup(); move(1, 700, 175); move(1, 845, 175);
    expect(manager.setCanvasOut).toHaveBeenCalledOnce(); expect(finger.touchmove).toHaveBeenCalledOnce();
    expect(manager.updateInputPlugins).toHaveBeenLastCalledWith(4, []);
  });
});
