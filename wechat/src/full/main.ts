import Phaser from "phaser";
import { MenuScene } from "../../../src/scenes/MenuScene";
import { RunScene } from "../../../src/scenes/RunScene";
import { PauseScene } from "../../../src/scenes/PauseScene";
import { WardrobeScene } from "../../../src/scenes/WardrobeScene";
import { ResultScene } from "../../../src/scenes/ResultScene";
import { PLAYER, RUN, SCENE } from "../../../src/game/Constants";
import { SaveSystem } from "../../../src/systems/SaveSystem";
import { AudioSystem } from "./audio";
import { wxStorage } from "./storage";
import { surfaceSnapshot, COMPOSITOR_KEY } from "./surfaces";
import { NativeSettings, SETTINGS_KEY } from "./settings";
import { bindTouchTarget } from "../../../src/ui/TouchTarget";
import { uiIconKey } from "../../../src/data/uiAssets";
import { menuModalOwner } from "../../../src/ui/MenuModal";
import { SHEEP_SKINS } from "../../../src/data/sheepSkins";
import { DELIVERY_CHAPTERS } from "../../../src/delivery/DeliveryChapters";
import { RESIDENTS } from "../../../src/residents/ResidentCatalog";
import { dispatchGameCancellation } from "./cancellation";
import { NativeAssetScene } from "./asset-scene";
import { loadRuntimeTextures, setRuntimeResources, resourceGroups, releaseInactiveResources } from "./resources";
import { safeUiInsets } from "./safe-area";
import { migrateCoreStorage } from "./migration";
import { platformDetails, runtimeErrorMessage } from "./diagnostics";
import { prepareWebGLContext } from "./webgl-context";
import { moveScreenTouches } from "./touch-move";
import { viewMetrics } from "../state";
import type { Host, TouchEvent } from "../platform";

declare const GameGlobal: Record<string, any>;
declare const __FULL_CONFIG__: { renderer: "auto" | "canvas" | "webgl" };
const host = GameGlobal.__SHEEP_WX_HOST__ as Host;
if (!host) throw Error("Initialize platform before the full engine bundle");
const { wx, log } = host, audio = new AudioSystem(), errors: string[] = [];
const environment = platformDetails(host); log("full-environment", environment);
let rendererCapabilities: Record<string, unknown> | null = null;
if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } })) as typeof window.matchMedia;
  log("full-host-capability", { reducedMotionPreference: "NOT_EXPOSED" });
}
let game: Phaser.Game, ready = false, hidden = false, frames = 0, physicsSteps = 0, lastFrame = Date.now(), failed = false;
let buildIdentity: string | null = null;
const activeTouches = new Map<number, any>();
const observedWorlds = new WeakSet<Phaser.Physics.Arcade.World>();
function error(reason: unknown): void {
  const message = runtimeErrorMessage(reason);
  errors.push(message); log("full-runtime-error", message); console.error("[sheep-wx-full]", message);
  if (failed) return; failed = true; audio.suspend();
  for (const scene of game?.scene.getScenes(true) ?? []) scene.scene.pause();
  wx.showModal({ title: "游戏运行错误", content: message.slice(0, 800), showCancel: false });
}
function view() { return viewMetrics(host.windowInfo()); }
function layout(): void {
  const v = view(), info = host.windowInfo(), scale = game.scale;
  scale.gameSize.setSize(v.size.width, v.size.height);
  scale.baseSize.setSize(Math.round(info.windowWidth * v.dpr), Math.round(info.windowHeight * v.dpr));
  scale.canvasBounds.setTo(v.left, v.top, v.size.width * v.fit, v.size.height * v.fit);
  scale.displayScale.set(v.dpr, v.dpr);
  for (const scene of game.scene.getScenes(false)) for (const camera of scene.cameras?.cameras ?? []) {
    camera.setOrigin(0, 0).setViewport(v.left * v.dpr, v.top * v.dpr, v.size.width * v.fit * v.dpr, v.size.height * v.fit * v.dpr).setZoom(v.fit * v.dpr);
  }
  if (game.scene.scenes.at(-1)?.sys.settings.key !== COMPOSITOR_KEY && game.scene.isActive(COMPOSITOR_KEY)) game.scene.bringToTop(COMPOSITOR_KEY);
  if (ready) releaseInactiveResources(game);
  const runScene = game.scene.keys[SCENE.run], world = runScene?.physics?.world;
  if (world && !observedWorlds.has(world)) {
    observedWorlds.add(world); const step = () => physicsSteps++; world.on("worldstep", step);
    const stopAudio = () => audio.suspend();
    runScene.events.on("pause", stopAudio);
    runScene.events.once("shutdown", () => { world.off("worldstep", step); observedWorlds.delete(world); runScene.events.off("pause", stopAudio); });
  }
}
class NativeCompositor extends Phaser.Scene {
  private settingsButton?: Phaser.GameObjects.Container;
  constructor() { super({ key: COMPOSITOR_KEY, active: true }); }
  create(): void {
    this.settingsButton = this.add.container(0, 0, []).setName("button:微信设置").setDepth(2000000);
    bindTouchTarget(this, this.settingsButton, 30, 30, () => {
      const target = game.scene.isActive(SCENE.pause) ? SCENE.pause : SCENE.menu;
      game.scene.pause(target); game.scene.run(SETTINGS_KEY, { returnScene: target });
    }, pressed => this.settingsButton?.setAlpha(pressed ? .65 : 1));
  }
  override update(): void {
    if (!ready || !this.settingsButton) return;
    if (!this.settingsButton.list.length) this.settingsButton.add(this.add.image(0, 0, uiIconKey("settings")).setDisplaySize(23, 23));
    const menu = game.scene.keys[SCENE.menu];
    const visible = !game.scene.isActive(SETTINGS_KEY) && (game.scene.isActive(SCENE.pause) || (game.scene.isActive(SCENE.menu) && !menuModalOwner(menu)));
    this.settingsButton.setVisible(visible); this.settingsButton.input!.enabled = visible;
    const v = view(); this.settingsButton.setPosition(v.safe.left + 20, v.size.height - v.safe.bottom - 18);
  }
}
class FullPreload extends Phaser.Scene {
  constructor() { super(SCENE.preload); }
  preload(): void { this.load.json("full-runtime", "runtime.json"); }
  create(): void {
    const manifest = this.cache.json.get("full-runtime");
    if (!manifest) { this.retry("运行资源清单加载失败"); return; }
    if (!/^[a-f0-9]{64}$/.test(manifest.buildId)) { this.retry("运行资源清单缺少可追溯构建标识"); return; }
    buildIdentity = manifest.buildId;
    setRuntimeResources(manifest);
    void loadRuntimeTextures(this, resourceGroups(manifest.textures).boot).then(() => {
      if (failed) return;
      ready = true; log("full-assets-ready", { textures: this.textures.getTextureKeys().length, availableTextures: manifest.textures.length, fonts: manifest.fonts.length });
      this.scene.start(SCENE.menu);
    }, reason => this.retry(String(reason)));
  }
  private retry(message: string): void {
    log("full-critical-resource-error", message);
    wx.showModal({ title: "资源加载失败", content: message.slice(0, 800), confirmText: "重试", showCancel: false,
      success: answer => { if (answer.confirm) {
        for (const entry of this.cache.json.get("full-runtime")?.textures ?? []) if (this.textures.exists(entry.key)) this.textures.remove(entry.key);
        this.cache.json.remove("full-runtime"); this.load.removeAllListeners("loaderror"); this.scene.restart();
      } } });
  }
}
function touch(method: "onTouchStart" | "onTouchMove" | "onTouchEnd" | "onTouchCancel", event: TouchEvent): void {
  if (!ready || hidden || failed) return;
  const changed = event.changedTouches.map(t => ({ ...t, pageX: t.clientX, pageY: t.clientY, target: host.canvas }));
  for (const t of changed) { if (method === "onTouchEnd" || method === "onTouchCancel") activeTouches.delete(t.identifier); else activeTouches.set(t.identifier, t); }
  const native = { type: method === "onTouchStart" ? "touchstart" : method === "onTouchMove" ? "touchmove" : method === "onTouchEnd" ? "touchend" : "touchcancel",
    changedTouches: changed, touches: [...activeTouches.values()], targetTouches: [...activeTouches.values()], target: host.canvas,
    timeStamp: performance.now(), preventDefault() {}, stopPropagation() {} };
  if (method === "onTouchStart") audio.initializeAfterGesture();
  if (method === "onTouchMove") moveScreenTouches(game.input as any, native, host.windowInfo(), Phaser.Input.TOUCH_MOVE);
  else (game.input as any)[method](native);
  if (method === "onTouchCancel") dispatchGameCancellation(host.canvas, "touchcancel");
}
const start = (e: TouchEvent) => touch("onTouchStart", e), move = (e: TouchEvent) => touch("onTouchMove", e), end = (e: TouchEvent) => touch("onTouchEnd", e), cancel = (e: TouchEvent) => touch("onTouchCancel", e);
function cancelAll(): void {
  if (activeTouches.size) cancel({ changedTouches: [...activeTouches.values()] }); activeTouches.clear();
  for (const pointer of game?.input.pointers ?? []) { pointer.active = false; pointer.isDown = false; }
  dispatchGameCancellation(host.canvas, "pointercancel");
}
function pause(): void {
  cancelAll(); audio.suspend();
  if (game.scene.isActive(SCENE.run) && !game.scene.isActive(SCENE.pause)) {
    game.scene.pause(SCENE.run); game.scene.run(SCENE.pause);
  }
}
const hide = () => { game.registry.set("wx-hidden", true); pause(); hidden = true; game.loop.sleep(); log("full-hidden", { frames, physicsSteps }); };
const show = () => { game.registry.set("wx-hidden", false); hidden = false; game.loop.wake(); lastFrame = Date.now(); log("full-shown-awaiting-touch", { frames, physicsSteps }); };
const resize = () => {
  pause(); const info = host.windowInfo(), v = view(), width = Math.round(info.windowWidth * v.dpr), height = Math.round(info.windowHeight * v.dpr);
  if (host.canvas.width !== width) host.canvas.width = width;
  if (host.canvas.height !== height) host.canvas.height = height;
  game.renderer.resize(width, height); layout(); game.scale.emit("resize", game.scale.gameSize, game.scale.baseSize, game.scale.displaySize);
  log("full-screen-resized", { width, height, windowWidth: info.windowWidth, windowHeight: info.windowHeight, dpr: v.dpr });
};
function snapshot() {
  const scenes = (game?.scene.getScenes(false) ?? []).map(scene => ({ key: scene.sys.settings.key, active: scene.sys.isActive(), paused: scene.sys.isPaused(), sleeping: scene.sys.isSleeping() }));
  const run = game?.scene.keys[SCENE.run] as any;
  return { scope: "FULL_GAME_RUNTIME_PLATFORM_UNVERIFIED", buildId: buildIdentity, engine: Phaser.VERSION, ready, failed, hidden, frames, physicsSteps,
    renderer: game?.renderer?.type === Phaser.WEBGL ? "WEBGL" : game?.renderer ? "CANVAS" : "UNAVAILABLE", environment, rendererCapabilities,
    measuredFps: Number.isFinite(game?.loop.actualFps) ? game.loop.actualFps : null, view: view(), uiInsets: safeUiInsets(game?.scene.scenes[0]), scenes, surfaces: surfaceSnapshot(), errors: [...errors],
    storageErrors: wxStorage.snapshot(), save: SaveSystem.load(), audio: { error: audio.error, plays: audio.plays, settings: audio.currentSettings },
    result: (game?.scene.keys[SCENE.result] as any)?.result, resources: { loadedTextures: game?.textures.getTextureKeys().length, error: game?.registry.get("wx-resource-error") ?? "" },
    run: run?.sheep?.body ? { activeMs: run.activeRunTimeMs, score: run.scoreSystem.score, starCount: run.scoreSystem.starCount, skinId: run.selectedSkin, speed: run.speed,
      sheep: { x: run.sheep.x, y: run.sheep.y, height: run.sheep.displayHeight, velocityY: run.sheep.body.velocity.y, state: run.sheep.motionState, grounded: run.sheep.grounded, animation: run.sheep.anims.currentAnim?.key, frame: run.sheep.frame.name },
      obstacles: run.obstacles?.getChildren().filter((object: any) => object.active).map((object: any) => ({ kind: object.definition.kind, x: object.x, y: object.y, width: object.displayWidth, height: object.displayHeight })),
      stars: run.stars?.getChildren().filter((object: any) => object.active).map((object: any) => ({ x: object.x, y: object.y, missed: object.missed })),
      delivery: run.delivery ? { chapterId: run.delivery.chapter.id, state: run.delivery.state, distance: run.delivery.distance, length: run.delivery.chapter.length, speed: run.delivery.chapter.speed } : null,
      travel: run.travel?.snapshot(), goal: run.runGoal?.snapshot(), environment: run.environmentSystem?.presentation(),
      companion: run.companions?.snapshot?.(), animals: run.ambientLife?.snapshot(), listeners: { preupdate: run.events.listenerCount("preupdate"), pointerdown: run.input.listenerCount("pointerdown"), pause: run.events.listenerCount("pause") } } : null };
}
GameGlobal.__SHEEP_WX_FULL__ = { snapshot, capture: () => ({ at: new Date().toISOString(), snapshot: snapshot(), events: [...host.events] }),
  // Diagnostics expose existing instances for acceptance, never alternate game objects.
  game: () => game, catalog: () => ({ skins: SHEEP_SKINS.map(({ id, unlock }) => ({ id, unlock })),
    chapters: DELIVERY_CHAPTERS.map(({ id, startLabel, length }) => ({ id, startLabel, length })), residents: RESIDENTS.map(({ id }) => ({ id })) }) };
migrateCoreStorage(wx, wxStorage, log);
try {
  const info = host.windowInfo(), v = view();
  const type = __FULL_CONFIG__.renderer === "canvas" ? Phaser.CANVAS : __FULL_CONFIG__.renderer === "webgl" ? Phaser.WEBGL : host.webgl ? Phaser.WEBGL : Phaser.CANVAS;
  const context = type === Phaser.WEBGL ? host.canvas.getContext("webgl", { alpha: false, antialias: false, depth: true,
    stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false }) as WebGLRenderingContext | null : null;
  if (type === Phaser.WEBGL && !context) throw Error("Requested WebGL context is unavailable");
  if (context) log("full-webgl-context", { version: context.getParameter(context.VERSION), adaptations: prepareWebGLContext(context) });
  // wx owns screen sizing. DOM parent polling mistakes our fractional letterbox for a resize.
  game = new Phaser.Game({ canvas: host.canvas, parent: null, type,
    // Phaser 4.2.1's renderer accepts WebGL here; GameConfig's declaration lists only 2D.
    context: (context ?? undefined) as unknown as CanvasRenderingContext2D | undefined,
    width: Math.round(info.windowWidth * v.dpr), height: Math.round(info.windowHeight * v.dpr),
    scene: [FullPreload, MenuScene, RunScene, PauseScene, WardrobeScene, ResultScene, NativeSettings, NativeAssetScene, NativeCompositor], banner: false, autoFocus: false,
    backgroundColor: "#b4ddd1", scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, expandParent: false },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: PLAYER.gravityY }, fps: 60, debug: false } },
    render: { pixelArt: true, roundPixels: true, antialias: false, antialiasGL: false },
    fps: { min: 1000 / RUN.simulationDeltaCapMs, smoothStep: true }, input: { mouse: false, keyboard: false, touch: false, activePointers: 2, gamepad: false },
    audio: { noAudio: true }, loader: { imageLoadType: "HTMLImageElement", timeout: 15000, crossOrigin: "anonymous" },
    callbacks: { preBoot: current => { current.registry.set("audioSystem", audio); current.registry.set("wx-surface-snapshot", surfaceSnapshot); }, postBoot: current => {
      game = current;
      const actual = current.renderer?.type === Phaser.WEBGL ? "webgl" : "canvas";
      if (actual === "webgl") { const gl = (current.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
        rendererCapabilities = { maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), version: gl.getParameter(gl.VERSION) }; }
      else rendererCapabilities = { canvas2D: true };
      log("full-renderer", { requested: __FULL_CONFIG__.renderer, actual });
      if (__FULL_CONFIG__.renderer !== "auto" && actual !== __FULL_CONFIG__.renderer) { error(Error(`Requested ${__FULL_CONFIG__.renderer} renderer, actual ${actual}; acceptance failed`)); return; }
      layout(); current.events.on("prerender", layout);
    } } });
  game.events.on("poststep", () => { frames++; lastFrame = Date.now(); });
  wx.onTouchStart(start); wx.onTouchMove(move); wx.onTouchEnd(end); wx.onTouchCancel(cancel);
  wx.onHide(hide); wx.onShow(show); wx.onWindowResize(resize); wx.onError?.(error);
  if (info.windowWidth < info.windowHeight && wx.setDeviceOrientation) wx.setDeviceOrientation({ value: "landscape",
    success: () => { resize(); log("full-landscape-requested"); }, fail: reason => error(Error(`Landscape request failed: ${JSON.stringify(reason)}`)) });
  const watchdog = setInterval(() => { if (!hidden && !failed && Date.now() - lastFrame > 5000) error(Error("Full game's single main loop stalled >5s")); }, 1000);
  game.events.once("destroy", () => { clearInterval(watchdog); audio.destroy(); wx.offTouchStart(start); wx.offTouchMove(move); wx.offTouchEnd(end); wx.offTouchCancel(cancel);
    wx.offHide(hide); wx.offShow(show); wx.offWindowResize(resize); wx.offError?.(error); });
} catch (reason) { error(reason); }
