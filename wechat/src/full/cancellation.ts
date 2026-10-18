/** Preserve a native EventTarget; the missing-only host shim also accepts Event. */
export function dispatchGameCancellation(canvas: Pick<HTMLCanvasElement, "dispatchEvent">, type: "touchcancel" | "pointercancel"): void {
  // DevTools hides Event but exposes a native subclass whose base accepts dispatchEvent.
  const EventConstructor = typeof Event === "function" ? Event : typeof PromiseRejectionEvent === "function"
    ? Object.getPrototypeOf(PromiseRejectionEvent) as typeof Event : undefined;
  canvas.dispatchEvent?.(EventConstructor ? new EventConstructor(type) : { type } as Event);
}
