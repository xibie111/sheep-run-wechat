import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchGameCancellation } from "./cancellation";

afterEach(() => vi.unstubAllGlobals());
describe("native cancellation dispatch", () => {
  it("uses an actual Event when the existing canvas is a native EventTarget", () => {
    const canvas = new EventTarget(), listener = vi.fn(); canvas.addEventListener("pointercancel", listener);
    dispatchGameCancellation(canvas, "pointercancel"); expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toBeInstanceOf(Event);
  });
  it("uses the host's plain event contract when no Event constructor is exposed", () => {
    vi.stubGlobal("Event", undefined); vi.stubGlobal("PromiseRejectionEvent", undefined); const dispatchEvent = vi.fn();
    dispatchGameCancellation({ dispatchEvent }, "touchcancel"); expect(dispatchEvent).toHaveBeenCalledWith({ type: "touchcancel" });
  });
  it("uses an exposed native subclass's base when DevTools hides Event", () => {
    const NativeEvent = Event, canvas = new EventTarget(), listener = vi.fn();
    class NativeRejectionEvent extends NativeEvent {}
    vi.stubGlobal("Event", undefined); vi.stubGlobal("PromiseRejectionEvent", NativeRejectionEvent);
    canvas.addEventListener("pointercancel", listener);
    dispatchGameCancellation(canvas, "pointercancel");
    expect(listener).toHaveBeenCalledOnce(); expect(listener.mock.calls[0][0]).toBeInstanceOf(NativeEvent);
  });
});
