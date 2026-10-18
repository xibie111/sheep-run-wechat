/** First-party, bounded Phaser host bridge. No third-party adapter code copied. */
import { fillMissing } from "./host-capabilities";
export { fillMissing } from "./host-capabilities";
export interface WxTouch { identifier: number; clientX: number; clientY: number }
export interface TouchEvent { changedTouches: WxTouch[] }
export interface WindowInfo {
  windowWidth: number; windowHeight: number; pixelRatio: number;
  screenWidth?: number; screenHeight?: number;
  safeArea?: { left: number; right: number; top: number; bottom: number };
}
export interface Wx {
  createCanvas(): HTMLCanvasElement;
  createImage(): HTMLImageElement;
  getWindowInfo?(): WindowInfo;
  getSystemInfoSync(): WindowInfo & Record<string, unknown>;
  getDeviceInfo?(): Record<string, unknown>;
  getAppBaseInfo?(): Record<string, unknown>;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  getFileSystemManager(): { readFile(options: { filePath: string; encoding?: string; success: (r: { data: string | ArrayBuffer }) => void; fail: (e: unknown) => void }): void };
  createInnerAudioContext(): { src: string; loop: boolean; autoplay: boolean; volume: number; play(): void; stop(): void; destroy(): void; onError(cb: (e: unknown) => void): void; onPlay(cb: () => void): void };
  loadSubpackage?(options: { name: string; success: () => void; fail: (e: unknown) => void }): unknown;
  getMenuButtonBoundingClientRect?(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
  onTouchStart(cb: (e: TouchEvent) => void): void; offTouchStart(cb: (e: TouchEvent) => void): void;
  onTouchMove(cb: (e: TouchEvent) => void): void; offTouchMove(cb: (e: TouchEvent) => void): void;
  onTouchEnd(cb: (e: TouchEvent) => void): void; offTouchEnd(cb: (e: TouchEvent) => void): void;
  onTouchCancel(cb: (e: TouchEvent) => void): void; offTouchCancel(cb: (e: TouchEvent) => void): void;
  onHide(cb: () => void): void; offHide(cb: () => void): void;
  onShow(cb: () => void): void; offShow(cb: () => void): void;
  onWindowResize(cb: () => void): void; offWindowResize(cb: () => void): void;
  onError?(cb: (e: unknown) => void): void; offError?(cb: (e: unknown) => void): void;
  showModal(options: { title: string; content: string; confirmText?: string; showCancel?: boolean; success?: (r: { confirm: boolean }) => void }): void;
  exitMiniProgram(options: { fail: (e: unknown) => void }): void;
  requestAnimationFrame?(cb: FrameRequestCallback): number;
  cancelAnimationFrame?(id: number): void;
  getPerformance?(): { now(): number };
  setDeviceOrientation?(options: { value: "landscape"; success: () => void; fail: (reason: unknown) => void }): void;
}
export interface Host {
  wx: Wx; canvas: HTMLCanvasElement; changes: string[];
  windowInfo(): WindowInfo;
  log(event: string, data?: unknown): void;
  events: { at: string; event: string; data?: unknown }[];
  webgl: boolean;
}
declare const GameGlobal: Record<string, any>;
declare const wx: Wx;

/** Only local text/JSON/arraybuffer requests required by this PoC; remote is deliberately unsupported. */
export function localXHR(api: Wx) {
  return class LocalXHR {
    responseType = ""; response: unknown = null; responseText = ""; responseURL = "";
    readyState = 0; status = 0; timeout = 0; withCredentials = false;
    onload: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    ontimeout: ((e: unknown) => void) | null = null;
    private path = ""; private cancelled = false; private timer?: ReturnType<typeof setTimeout>;
    open(method: string, path: string): void {
      if (method !== "GET" || /(^[a-z]+:|^\/|\.\.)/i.test(path)) throw new Error(`PoC XHR only accepts package-relative GET: ${path}`);
      this.path = path; this.responseURL = path; this.readyState = 1;
    }
    setRequestHeader(): void {} // Package reads have no HTTP headers.
    overrideMimeType(): void {}
    abort(): void { this.cancelled = true; clearTimeout(this.timer); }
    send(): void {
      if (this.responseType !== "" && this.responseType !== "text" && this.responseType !== "arraybuffer") throw new Error(`Unsupported PoC responseType: ${this.responseType}`);
      const finish = (ok: boolean, data: unknown): void => {
        if (this.cancelled) return;
        this.cancelled = true; clearTimeout(this.timer);
        this.readyState = 4; this.status = ok ? 200 : 404;
        this.response = data; this.responseText = typeof data === "string" ? data : "";
        const event = { target: this, lengthComputable: false };
        if (ok) this.onload?.(event); else this.onerror?.(event);
      };
      if (this.timeout > 0) this.timer = setTimeout(() => {
        if (this.cancelled) return;
        this.cancelled = true; this.ontimeout?.({ target: this });
      }, this.timeout);
      api.getFileSystemManager().readFile({ filePath: this.path,
        ...(this.responseType === "arraybuffer" ? {} : { encoding: "utf8" }),
        success: r => finish(true, r.data), fail: e => finish(false, e) });
    }
  };
}

export function installHost(api: Wx, root: Record<string, any>): Host {
  const changes: string[] = [], events: Host["events"] = [];
  const log: Host["log"] = (event, data) => {
    events.push({ at: new Date().toISOString(), event, data });
    if (events.length > 400) events.shift();
    console.log("[sheep-wx-poc]", event, data ?? "");
  };
  const windowInfo = (): WindowInfo => api.getWindowInfo?.() ?? api.getSystemInfoSync();
  const canvas = api.createCanvas(); // First created canvas is the WeChat screen canvas.
  const put = (target: Record<string, any>, key: string, value: unknown, label?: string) => fillMissing(target, key, value, changes, label);
  put(root, "window", root);
  const win = root.window;
  // Phaser ScaleManager reads the global reference before probing orientation.
  // An absent API needs an empty reference, not fabricated orientation events.
  put(root, "screen", win.screen ?? {}); put(win, "screen", root.screen);
  const providedClock = root.performance ?? win.performance ?? globalThis.performance;
  let clock = providedClock, clockSource = "provided performance.now";
  if (!clock && api.getPerformance) {
    const nativeClock = api.getPerformance();
    // The current official Performance.now contract is microseconds; Phaser is ms.
    clock = { now: () => nativeClock.now() / 1000 };
    clockSource = "wx.getPerformance.now microseconds / 1000";
  }
  if (typeof clock?.now !== "function") throw new Error("No usable performance.now or wx.getPerformance clock");
  put(root, "performance", clock); put(win, "performance", clock);
  const info = windowInfo();
  const rect = () => ({ x: 0, y: 0, left: 0, top: 0, right: windowInfo().windowWidth, bottom: windowInfo().windowHeight,
    width: windowInfo().windowWidth, height: windowInfo().windowHeight,
    toJSON(): Record<string, number> { const { x, y, left, top, right, bottom, width, height } = this; return { x, y, left, top, right, bottom, width, height }; } });
  function element(tagName: string): Record<string, any> {
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const el: Record<string, any> = { tagName: tagName.toUpperCase(), nodeType: 1, style: {}, children: [],
      clientWidth: info.windowWidth, clientHeight: info.windowHeight,
      addEventListener: (name: string, cb: (...args: any[]) => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(cb); },
      removeEventListener: (name: string, cb: (...args: any[]) => void) => listeners.get(name)?.delete(cb),
      dispatchEvent: (e: { type: string }) => { for (const cb of listeners.get(e.type) ?? []) cb(e); },
      appendChild: (child: any) => { el.children.push(child); child.parentNode = el; return child; },
      removeChild: (child: any) => { el.children = el.children.filter((c: any) => c !== child); child.parentNode = null; },
      insertBefore: (child: any) => el.appendChild(child),
      setAttribute: (key: string, value: unknown) => { el[key] = value; },
      getAttribute: (key: string) => el[key] ?? null,
      getBoundingClientRect: rect, getRootNode: () => root.document };
    return el;
  }
  const completeCanvas = (c: HTMLCanvasElement, screen = false): HTMLCanvasElement => {
    const stub = element("canvas");
    for (const [key, value] of Object.entries(stub)) put(c, key, value, `canvas.${key}`);
    if (screen) put(c, "getBoundingClientRect", rect);
    return c;
  };
  // No visible DOM UI: these nodes only satisfy Phaser's host/feature queries.
  put(root, "document", {});
  const doc = root.document;
  put(doc, "documentElement", element("html")); put(doc, "body", element("body")); put(doc, "head", element("head"));
  const documentEvents = element("document");
  for (const key of ["addEventListener", "removeEventListener", "dispatchEvent"]) put(doc, key, documentEvents[key]);
  put(doc, "readyState", "complete"); put(doc, "hidden", false);
  put(doc, "createElement", (tag: string) => tag === "canvas" ? completeCanvas(api.createCanvas()) : tag === "img" ? api.createImage() : element(tag));
  put(doc, "createElementNS", (_ns: string, tag: string) => doc.createElement(tag));
  put(doc, "getElementById", () => null); put(doc, "getElementsByTagName", (tag: string) => tag === "head" ? [doc.head] : []);
  put(doc, "querySelectorAll", () => []); put(doc, "querySelector", (tag: string) => tag === "html" ? doc.documentElement : tag === "head" ? doc.head : tag === "body" ? doc.body : null);
  put(doc, "elementFromPoint", () => canvas);
  put(doc.documentElement, "ontouchstart", null);
  completeCanvas(canvas, true);
  class CanvasHostType { static [Symbol.hasInstance](value: any): boolean { return !!value && typeof value.getContext === "function"; } }
  put(root, "HTMLCanvasElement", CanvasHostType); put(win, "HTMLCanvasElement", root.HTMLCanvasElement);
  put(root, "Image", function () { return api.createImage(); });
  put(root, "XMLHttpRequest", localXHR(api));
  put(root, "navigator", {}); put(root.navigator, "userAgent", "WechatMiniGame"); put(root.navigator, "appVersion", "WechatMiniGame"); put(root.navigator, "maxTouchPoints", 2);
  put(win, "innerWidth", info.windowWidth); put(win, "innerHeight", info.windowHeight); put(win, "devicePixelRatio", info.pixelRatio);
  for (const key of ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Image", "XMLHttpRequest", "document", "navigator"]) put(win, key, root[key] ?? globalThis[key as keyof typeof globalThis]);
  const windowEvents = element("window");
  for (const key of ["addEventListener", "removeEventListener"]) put(win, key, windowEvents[key]);
  if (!win.requestAnimationFrame && api.requestAnimationFrame) put(win, "requestAnimationFrame", api.requestAnimationFrame.bind(api));
  if (!win.cancelAnimationFrame && api.cancelAnimationFrame) put(win, "cancelAnimationFrame", api.cancelAnimationFrame.bind(api));
  if (typeof win.requestAnimationFrame !== "function" || typeof win.cancelAnimationFrame !== "function") throw new Error("No usable native requestAnimationFrame/cancelAnimationFrame pair");
  // Phaser capability probes require these names; derive from real contexts, never a hardcoded WebGL success.
  const probe2D = api.createCanvas().getContext("2d");
  if (!probe2D) throw new Error("Canvas 2D unavailable (needed for atlas preparation)");
  put(win, "CanvasRenderingContext2D", probe2D.constructor);
  const probeGL = api.createCanvas().getContext("webgl");
  if (probeGL) put(win, "WebGLRenderingContext", probeGL.constructor);
  log("host-capabilities", { nativeRAF: !changes.includes("requestAnimationFrame"), clockSource, webgl: !!probeGL, canvas2D: !!probe2D, changes });
  return { wx: api, canvas, changes, events, windowInfo, log, webgl: !!probeGL };
}

// Bundled separately so all host setup completes before Phaser is evaluated.
if (typeof wx !== "undefined" && typeof GameGlobal !== "undefined") {
  GameGlobal.__SHEEP_WX_HOST__ = installHost(wx, GameGlobal);
}
