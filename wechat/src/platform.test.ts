import { describe, expect, it, vi } from "vitest";
import { fillMissing, installHost, localXHR, type Wx } from "./platform";

describe("host missing-only and local loader bridge", () => {
  it("uses documented wx microseconds as milliseconds only when no performance object exists", () => {
    const api = { createCanvas: () => ({ getContext: (type: string) => type === "2d" ? { constructor: Object } : null }),
      getSystemInfoSync: () => ({ windowWidth: 896, windowHeight: 414, pixelRatio: 1 }), getPerformance: vi.fn(() => ({ now: () => 1234567 })) } as unknown as Wx;
    const makeRoot = () => ({ requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }) as Record<string, any>;
    vi.stubGlobal("performance", undefined);
    try {
      const bare = makeRoot(); installHost(api, bare); expect(bare.performance.now()).toBe(1234.567); expect(api.getPerformance).toHaveBeenCalledOnce();
      const provided = { now: () => 9 }, native = makeRoot(); Object.defineProperty(native, "performance", { get: () => provided, configurable: false });
      installHost(api, native); expect(native.performance).toBe(provided); expect(native.performance.now()).toBe(9); expect(api.getPerformance).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
  it("provides the required screen reference only when absent and preserves native orientation APIs", () => {
    const api = { createCanvas: () => ({ getContext: (type: string) => type === "2d" ? { constructor: Object } : null }),
      getSystemInfoSync: () => ({ windowWidth: 896, windowHeight: 414, pixelRatio: 1 }) } as unknown as Wx;
    const makeRoot = () => ({ requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }) as Record<string, any>;
    const bare = makeRoot(), host = installHost(api, bare); expect(bare.screen).toEqual({}); expect(bare.window.screen).toBe(bare.screen);
    expect(host.canvas.getBoundingClientRect().toJSON()).toEqual({ x: 0, y: 0, left: 0, top: 0, right: 896, bottom: 414, width: 896, height: 414 });
    const orientation = { addEventListener: vi.fn(), removeEventListener: vi.fn() }, screen = { orientation }, native = makeRoot();
    Object.defineProperty(native, "screen", { get: () => screen, configurable: false });
    installHost(api, native); expect(native.screen).toBe(screen); expect(native.screen.orientation).toBe(orientation);
  });
  it("preserves native methods and getter-only host references", () => {
    const native = () => 4, object = { native }; const changes: string[] = [];
    fillMissing(object, "native", () => 8, changes); expect(object.native).toBe(native); expect(changes).toEqual([]);
    Object.defineProperty(object, "window", { get: () => object, configurable: false });
    fillMissing(object, "window", {}, changes); expect((object as any).window).toBe(object);
    Object.defineProperty(object, "missing", { get: () => undefined, configurable: false });
    expect(() => fillMissing(object, "missing", 1, changes)).toThrow("read-only");
  });
  it("reads actual package JSON using the Phaser XHR callback shape", () => {
    const api = { getFileSystemManager: () => ({ readFile: (options: any) => { expect(options.filePath).toBe("assets/font.json"); options.success({ data: '{"glyphs":1}' }); } }) } as Wx;
    const XHR = localXHR(api), xhr = new XHR();
    const done = vi.fn(); xhr.onload = done; xhr.open("GET", "assets/font.json"); xhr.send();
    expect(xhr.status).toBe(200); expect(xhr.responseText).toBe('{"glyphs":1}'); expect(done).toHaveBeenCalledWith({ target: xhr, lengthComputable: false });
  });
  it("reports missing files, rejects remote/unsupported requests and supports cancellation", () => {
    let options: any;
    const XHR = localXHR({ getFileSystemManager: () => ({ readFile: (o: any) => { options = o; } }) } as Wx);
    const xhr = new XHR(), error = vi.fn(); xhr.onerror = error; xhr.open("GET", "assets/missing.json"); xhr.send(); options.fail({ errMsg: "not found" });
    expect(xhr.status).toBe(404); expect(error).toHaveBeenCalledOnce();
    expect(() => xhr.open("GET", "https://example.test/x")).toThrow("package-relative");
    expect(() => xhr.open("GET", "../private")).toThrow("package-relative");
    const stopped = new XHR(), done = vi.fn(); stopped.onload = done; stopped.open("GET", "assets/x"); stopped.send(); stopped.abort(); options.success({ data: "late" }); expect(done).not.toHaveBeenCalled();
    const unsupported = new XHR(); unsupported.open("GET", "assets/x"); unsupported.responseType = "blob"; expect(() => unsupported.send()).toThrow("Unsupported");
  });
  it("times out once and ignores a late filesystem success", () => {
    vi.useFakeTimers(); let options: any;
    try {
      const XHR = localXHR({ getFileSystemManager: () => ({ readFile: (o: any) => { options = o; } }) } as Wx);
      const xhr = new XHR(), timeout = vi.fn(), done = vi.fn(); xhr.timeout = 30; xhr.ontimeout = timeout; xhr.onload = done;
      xhr.open("GET", "assets/x"); xhr.send(); vi.advanceTimersByTime(31); options.success({ data: "late" });
      expect(timeout).toHaveBeenCalledOnce(); expect(done).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
