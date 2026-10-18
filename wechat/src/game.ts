import Phaser from "phaser";
import { Sheep } from "../../src/entities/Sheep";
import { Obstacle } from "../../src/entities/Obstacle";
import { Star } from "../../src/entities/Star";
import { PowerUp } from "../../src/entities/PowerUp";
import { PLAYER, POOL, RUN, WORLD } from "../../src/game/Constants";
import { OBSTACLE_DEFINITIONS, type ObstacleDefinition } from "../../src/game/ObstacleDefinitions";
import { POWER_UP_DEFINITIONS, type PowerUpType } from "../../src/data/powerups";
import { InputSystem } from "../../src/systems/InputSystem";
import { DifficultySystem } from "../../src/systems/DifficultySystem";
import { SpawnSystem } from "../../src/systems/SpawnSystemOwner";
import { CollisionSystem } from "../../src/systems/CollisionSystem";
import { PowerUpSystem } from "../../src/systems/PowerUpSystem";
import { ProgressionSystem } from "../../src/systems/ProgressionSystem";
import { StarRouteController } from "../../src/stars-v2/StarRouteController";
import { createSceneryRepeat } from "../../src/utils/SceneryRepeat";
import { TouchRouter, touchPoint, viewMetrics } from "./state";
import { WechatSave, WECHAT_SAVE_KEY } from "./save";
import { WechatAudio } from "./audio";
import { WechatSession, type WechatResult } from "./session";
import { WechatUI, type Screen, type UiState } from "./ui";
import type { Host, TouchEvent, WxTouch } from "./platform";

declare const GameGlobal: Record<string, any>;
declare const __POC_CONFIG__: { renderer: "auto" | "canvas" | "webgl"; debugPhysics: boolean };
const host = GameGlobal.__SHEEP_WX_HOST__ as Host;
if (!host) throw new Error("Load platform.js before game.bundle.js");
const { wx, log } = host, startedAt = Date.now();
const save = new WechatSave(wx, log), audio = new WechatAudio(wx, save, log);
const input = new InputSystem(false), router = new TouchRouter(), errors: string[] = [];
let game: Phaser.Game, run: WechatRun | undefined;
let ready = false, hidden = false, failed = false, screen: Screen = "menu", settingsReturn: "menu" | "paused" = "menu";
let frames = 0, physicsSteps = 0, lastFrameAt = Date.now(), activeMs = 0, round = 0;
let result: WechatResult | null = null;
let buildIdentity: { id: string; revision: string; sourceDigest: string } | null = null;
const textureFiles: Record<string, string> = {
  far: "run-far", near: "run-near", star: "star", "pause-art": "pause", "poc-font": "font",
  "menu-title": "menu-title", "menu-start": "menu-start", "result-panel": "result-panel",
  "result-retry": "result-retry", "result-home": "result-home",
  ...Object.fromEntries(OBSTACLE_DEFINITIONS.map(definition => [definition.texture, definition.texture])),
  ...Object.fromEntries(POWER_UP_DEFINITIONS.filter(definition => definition.type !== "dash").map(definition => [definition.textureKey, definition.textureKey])),
};
function uiState(): UiState {
  return { screen, score: run?.session?.score.score ?? 0, stars: run?.session?.score.starCount ?? 0,
    save: save.load(), result, storageError: save.error, audioError: audio.error, saveVerified: save.persisted,
    effects: run?.powers.activeEffects(activeMs) ?? [] };
}
const ui = new WechatUI(host, uiState, configureCamera);
function cancel(): void { router.cancel(); input.cancel(); if (run?.sheep?.body) run.sheep.setCrouching(false); }
function reportError(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error), first = !failed;
  errors.push(message); failed = true; cancel(); audio.suspend();
  if (run?.scene.isActive()) run.scene.pause();
  console.error("[sheep-wx]", message); log("runtime-error", message);
  if (first) wx.showModal({ title: "游戏发生错误", content: message.slice(0, 800), showCancel: false });
}
function pause(reason: string): void {
  cancel(); audio.suspend();
  if (screen === "run") { screen = "paused"; run?.scene.pause(); }
  ui.refresh(); log("paused", { reason, screen, activeMs, physicsSteps });
}
function resume(): void {
  if (hidden || failed || !ready || screen !== "paused") return;
  cancel(); screen = "run"; run?.scene.resume(); audio.gesture(); ui.refresh(); log("resumed", { activeMs });
}
function startRun(): void {
  if (hidden || failed || !ready) return;
  cancel(); result = null; activeMs = 0; round++; screen = "run";
  game.scene.stop("WxRun"); run = undefined; game.scene.start("WxRun");
  audio.gesture(); ui.refresh(); log("run-start", { round });
}
function home(): void {
  cancel(); game.scene.stop("WxRun"); run = undefined; screen = "menu"; result = null;
  audio.gesture(); ui.refresh(); log("menu", { round });
}
function configureCamera(scene: Phaser.Scene, world: boolean): void {
  const v = viewMetrics(host.windowInfo()), camera = scene.cameras.main;
  camera.setViewport(v.left * v.dpr, v.top * v.dpr, v.size.width * v.fit * v.dpr, v.size.height * v.fit * v.dpr);
  camera.setOrigin(0, 0).setZoom(v.fit * v.dpr).setScroll(world ? -v.origin.x : 0, world ? -v.origin.y : 0);
}
class WechatLoad extends Phaser.Scene {
  private failures: string[] = [];
  private timeout?: ReturnType<typeof setTimeout>;
  private reported = false;
  constructor() { super("WxLoad"); }
  preload(): void {
    this.failures = []; this.reported = false;
    this.load.on("loaderror", (file: Phaser.Loader.File) => { this.failures.push(`${file.type}: ${file.key} (${file.url})`); log("load-error", this.failures.at(-1)); });
    this.load.on("filecomplete", (key: string, type: string) => log("loaded", { key, type }));
    this.load.spritesheet("sheep-runner", "assets/white-sheet.png", { frameWidth: 128, frameHeight: 128, endFrame: 14 });
    for (const [key, name] of Object.entries(textureFiles)) this.load.image(key, `assets/${name}.png`);
    this.load.json("poc-font-data", "assets/font.json"); this.load.json("poc-contract", "assets/contract.json");
    this.timeout = setTimeout(() => this.loadFailed("资源加载超过 15 秒"), 15000);
    this.events.once("shutdown", () => { clearTimeout(this.timeout); this.load.removeAllListeners(); });
  }
  private loadFailed(message: string): void {
    if (this.reported) return;
    this.reported = true; clearTimeout(this.timeout); log("critical-load-failure", message);
    wx.showModal({ title: "资源加载失败", content: `${message}\n确认后重新加载。`, confirmText: "重试",
      success: response => { if (response.confirm) {
        for (const key of ["sheep-runner", ...Object.keys(textureFiles), "poc-far", "poc-near"]) if (this.textures.exists(key)) this.textures.remove(key);
        this.cache.json.remove("poc-font-data"); this.cache.json.remove("poc-contract"); this.scene.restart();
      } } });
  }
  create(): void {
    clearTimeout(this.timeout);
    if (this.reported) return;
    if (this.failures.length) { this.loadFailed(this.failures.join("\n")); return; }
    try {
      const contract = this.cache.json.get("poc-contract");
      if (contract.engine !== Phaser.VERSION || contract.gravity !== PLAYER.gravityY || contract.dash !== false || contract.stage !== "core-loop") throw Error("Built asset contract does not match runtime");
      if (!/^[a-f0-9]{64}$/.test(contract.build?.id ?? "")) throw Error("Build identity missing from asset contract");
      buildIdentity = contract.build; log("build-identity", buildIdentity);
      for (const key of ["sheep-runner", ...Object.keys(textureFiles)]) if (!this.textures.exists(key)) throw Error(`Required real texture missing: ${key}`);
      const texture = this.textures.get("sheep-runner");
      if (texture.source[0].width !== 640 || texture.source[0].height !== 384) throw Error("Unexpected real sheep atlas dimensions");
      for (let i = 0; i < 15; i++) texture.get(i).setSize(128, 112, i % 5 * 128, Math.floor(i / 5) * 128 + 16);
      const animations = { idle: [0, 10], run: [1, 2, 3, 4, 11, 12], jump: [5], fall: [6], hit: [7], dash: [8, 13], dead: [9, 14] };
      for (const [state, ids] of Object.entries(animations)) this.anims.create({ key: `sheep-${state}`, frames: this.anims.generateFrameNumbers("sheep-runner", { frames: ids }), frameRate: state === "run" ? 10 : state === "idle" ? 2 : 8, repeat: ["idle", "run"].includes(state) ? -1 : 0 });
      for (const band of ["far", "near"] as const) this.textures.addCanvas(`poc-${band}`, createSceneryRepeat(this.textures.get(band).getSourceImage() as HTMLImageElement, band));
      const font = this.cache.json.get("poc-font-data"), fontTexture = this.textures.get("poc-font");
      for (const [id, char] of Object.entries(font.chars) as [string, { x: number; y: number; width: number; height: number }][]) {
        if (char.width && char.height) fontTexture.add(String.fromCharCode(+id), 0, char.x, char.y, char.width, char.height);
      }
      this.cache.bitmapFont.add("poc-font", { data: font, texture: "poc-font", frame: null });
      for (const key of ["sheep-runner", ...Object.keys(textureFiles), "poc-far", "poc-near"]) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      ready = true;
      log("assets-ready", { startupMs: Date.now() - startedAt, renderer: game.renderer.type === Phaser.WEBGL ? "WEBGL" : "CANVAS", atlasFrames: 15, obstacles: OBSTACLE_DEFINITIONS.length });
      this.scene.start("WxUI");
    } catch (error) { reportError(error); }
  }
}
class WechatRun extends Phaser.Scene {
  sheep!: Sheep; session!: WechatSession;
  obstacles!: Phaser.Physics.Arcade.Group; stars!: Phaser.Physics.Arcade.Group; pickups!: Phaser.Physics.Arcade.Group;
  readonly powers = new PowerUpSystem(false);
  private difficulty!: DifficultySystem;
  private spawner!: SpawnSystem;
  private routes!: StarRouteController;
  private effects = ProgressionSystem.effectsFor(save.load().upgrades);
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private wasGrounded = true;
  private finished = false;
  constructor() { super("WxRun"); }
  get speed(): number { return this.difficulty.speed; }
  layout(): void {
    configureCamera(this, true); const v = viewMetrics(host.windowInfo());
    this.far?.setPosition(-v.origin.x, -v.origin.y).setSize(v.size.width, v.size.height);
    this.near?.setPosition(-v.origin.x, 0).setSize(v.size.width, v.size.height);
  }
  create(): void {
    run = this; this.finished = false; this.wasGrounded = true; this.powers.reset();
    this.session = new WechatSession(save); this.effects = ProgressionSystem.effectsFor(save.load().upgrades);
    this.difficulty = new DifficultySystem(this.effects.worldSpeedMultiplier);
    this.spawner = new SpawnSystem(undefined, false); this.spawner.reset(undefined, this.effects.jumpImpulseMultiplier);
    const v = viewMetrics(host.windowInfo());
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.groundY);
    this.far = this.add.tileSprite(-v.origin.x, -v.origin.y, v.size.width, v.size.height, "poc-far").setOrigin(0);
    this.near = this.add.tileSprite(-v.origin.x, 0, v.size.width, v.size.height, "poc-near").setOrigin(0);
    this.sheep = new Sheep(this, this.effects.jumpImpulseMultiplier);
    this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
    this.stars = this.physics.add.group({ allowGravity: false, immovable: true });
    this.pickups = this.physics.add.group({ allowGravity: false, immovable: true });
    this.routes = new StarRouteController({
      available: () => POOL.stars - this.stars.getChildren().filter(child => child.active).length,
      spawn: plan => {
        const activated: Star[] = [];
        for (const point of plan.points) {
          const star = this.acquireStar();
          if (!star) { activated.forEach(member => member.deactivate()); return null; }
          star.activate(point.x, point.y, point.phase, this.speed); activated.push(star);
        }
        log("star-route", { kind: plan.kind, count: activated.length }); return activated;
      },
    });
    new CollisionSystem(this).connect(this.sheep, this.obstacles, this.stars, {
      onObstacle: object => this.collide(object), onStar: object => this.collect(object), onPowerUp: object => this.collectPower(object),
    }, this.pickups);
    const pre = (_time: number, delta: number): void => {
      if (this.finished || screen !== "run") return;
      activeMs += Math.max(0, Math.min(delta, RUN.simulationDeltaCapMs));
      const grounded = this.sheep.grounded, frame = input.update(activeMs, grounded, this.powers.dashCooldownMs(activeMs));
      if (!this.wasGrounded && grounded) audio.play("land");
      if (frame.jump) { this.sheep.applyJump(frame.jump); audio.play("jump"); log("jump", { kind: frame.jump, velocity: (this.sheep.body as Phaser.Physics.Arcade.Body).velocity.y }); }
      this.wasGrounded = grounded; this.sheep.setCrouching(frame.crouching); this.sheep.setDashing(false);
    };
    const step = (): void => { physicsSteps++; }, world = this.physics.world;
    this.events.on("preupdate", pre); world.on("worldstep", step);
    this.events.once("shutdown", () => { this.events.off("preupdate", pre); world.off("worldstep", step); this.routes.clear(); cancel(); });
    this.layout(); this.scene.bringToTop("WxUI"); ui.refresh();
    if (hidden) pause("created-hidden");
    log("round-ready", { round, dash: false, gravity: PLAYER.gravityY });
  }
  private acquireObstacle(definition: ObstacleDefinition, phase: number): Obstacle | null {
    const children = this.obstacles.getChildren() as Obstacle[], reusable = children.find(child => !child.active && child.definition.kind === definition.kind);
    if (reusable) return reusable;
    if (children.filter(child => child.definition.kind === definition.kind).length >= POOL.obstaclesPerKind) return null;
    const obstacle = new Obstacle(this, WORLD.width + 18, definition, phase); this.obstacles.add(obstacle); return obstacle;
  }
  private acquireStar(): Star | null {
    const children = this.stars.getChildren() as Star[], reusable = children.find(child => !child.active);
    if (reusable) return reusable;
    if (children.length >= POOL.stars) return null;
    const star = new Star(this, WORLD.width + 14, WORLD.groundY - 80, 0); this.stars.add(star); return star;
  }
  private acquirePower(type: PowerUpType): PowerUp | null {
    const children = this.pickups.getChildren() as PowerUp[], reusable = children.find(child => !child.active);
    if (reusable) return reusable;
    if (children.length >= POOL.powerUps) return null;
    const pickup = new PowerUp(this, WORLD.width + 14, WORLD.groundY - 84, type, 0); this.pickups.add(pickup); return pickup;
  }
  private collect(object: object): void {
    if (this.finished || screen !== "run" || !(object instanceof Star) || !object.active || object.collected || object.missed) return;
    object.collected = true;
    const award = this.session.score.awardStar(this.powers.starMultiplier(activeMs)), group = this.routes.collect(object);
    object.deactivate(); audio.play(award.streak > 2 ? "combo" : "starCollect");
    if (group?.completed) audio.play("starGroup");
    log("star-collected", { starCount: award.starCount, total: save.load().totalStars, score: award.score });
  }
  private collectPower(object: object): void {
    if (this.finished || screen !== "run" || !(object instanceof PowerUp) || !object.active || object.collected) return;
    object.collected = true; this.powers.activate(object.type, activeMs); object.deactivate(); audio.play("powerUp");
    log("powerup-collected", { type: object.type, activeMs });
  }
  private collide(object: object): void {
    if (this.finished || screen !== "run" || input.isObstacleImmune(activeMs)) return;
    if (this.powers.consumeShield(activeMs)) {
      if (object instanceof Obstacle) object.deactivate(); audio.play("hit"); log("shield-consumed", { activeMs }); return;
    }
    this.finished = true; this.routes.clear(); cancel(); this.physics.pause();
    this.sheep.motionState = "HIT"; (this.sheep.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    result = this.session.finish(); screen = "ending";
    audio.play("hit"); audio.play(result.newRecord ? "newRecord" : "gameOver");
    log("collision", { kind: object instanceof Obstacle ? object.definition.kind : "unknown", activeMs });
    log("settled", { round, ...result }); ui.refresh();
    this.time.delayedCall(460, () => { screen = "result"; this.scene.pause(); ui.refresh(); log("result", { round }); });
  }
  override update(_time: number, deltaMs: number): void {
    if (this.finished || screen !== "run") return;
    const ms = Math.max(0, Math.min(deltaMs, RUN.simulationDeltaCapMs)), dt = ms / 1000;
    const speed = this.difficulty.update(dt); this.session.score.update(speed, ms);
    this.far.tilePositionX += speed * dt * .15; this.near.tilePositionX += speed * dt * .65;
    for (const request of this.spawner.update(dt, speed)) {
      if (request.type === "obstacle") {
        this.acquireObstacle(request.definition, request.phase)?.activate(WORLD.width + 18, request.phase, speed);
        log("obstacle-spawn", { kind: request.definition.kind, pattern: request.pattern.id });
      } else if (request.type === "star") this.routes.enqueue(request);
      else this.acquirePower(request.powerUp)?.activate(WORLD.width + 14, request.y, request.powerUp, request.phase, speed);
    }
    this.routes.update({ speed, spawnX: WORLD.width + 14, playerX: this.sheep.x, jumpImpulseMultiplier: this.effects.jumpImpulseMultiplier,
      window: this.spawner.starRouteWindow(speed),
      obstacles: (this.obstacles.getChildren() as Obstacle[]).filter(child => child.active).map(child => ({ left: child.x, right: child.rightEdge, kind: child.definition.kind })),
      pickups: [...this.stars.getChildren(), ...this.pickups.getChildren()].filter(child => child.active).map(child => (child as Star | PowerUp).getBounds()),
    });
    const left = -viewMetrics(host.windowInfo()).origin.x;
    for (const child of this.obstacles.getChildren() as Obstacle[]) {
      if (!child.active) continue;
      child.moveAt(speed, dt);
      if (!child.passed && child.rightEdge < PLAYER.x) { child.passed = true; this.session.score.awardPassedObstacle(); audio.play("nearMiss"); log("obstacle-passed", { kind: child.definition.kind }); }
      if (child.visualRightEdge < left - 20) child.deactivate();
    }
    for (const child of this.stars.getChildren() as Star[]) {
      if (!child.active) continue;
      child.updateMotion(dt, speed, this.powers.isActive("magnet", activeMs) ? { x: this.sheep.x, y: this.sheep.y - PLAYER.height / 2, radiusPx: this.effects.magnetRadiusPx } : undefined);
      if (child.x < PLAYER.x - 4 && !child.collected && !child.missed) { child.missed = true; this.session.score.missStar(); this.routes.recycle(child); }
      if (child.visualRightEdge < left) child.deactivate();
    }
    for (const child of this.pickups.getChildren() as PowerUp[]) { if (child.active) { child.updateMotion(dt, speed); if (child.x < -30) child.deactivate(); } }
    this.powers.update(activeMs);
  }
}
function point(touch: WxTouch) { return touchPoint(host.windowInfo(), touch.clientX, touch.clientY); }
function forward(type: "down" | "move" | "up", touch: WxTouch): void {
  const p = point(touch), origin = viewMetrics(host.windowInfo()).origin;
  input.handleGesture({ type, pointerId: touch.identifier, x: p.x - origin.x, y: p.y - origin.y, at: activeMs });
}
function action(id: string): void {
  if (hidden || failed || !ready) return;
  if (id === "pause" && screen === "run") { pause("button"); return; }
  if (id === "resume") { resume(); return; }
  audio.gesture(); audio.play("button");
  if (id === "start" || id === "restart") startRun();
  else if (id === "home") home();
  else if (id === "settings") { settingsReturn = screen === "paused" ? "paused" : "menu"; screen = "settings"; cancel(); ui.refresh(); }
  else if (id === "back") { screen = settingsReturn; cancel(); if (screen === "paused") audio.suspend(); ui.refresh(); }
  else if (id === "retry-settings") { save.retryRead(); audio.retryMusic(); ui.refresh(); }
  else if (id === "music" || id === "sfx" || /^(music|sfx)-(up|down)$/.test(id)) {
    const settings = save.load().settings;
    if (id === "music" || id === "sfx") save.updateSettings({ [id]: !settings[id] });
    else { const [channel, direction] = id.split("-"), key = channel === "music" ? "musicVolume" : "sfxVolume";
      save.updateSettings({ [key]: Math.round(Math.max(0, Math.min(1, settings[key] + (direction === "up" ? .1 : -.1))) * 10) / 10 }); }
    audio.settingsChanged(); ui.refresh();
  }
}
const down = (event: TouchEvent): void => {
  if (!ready || hidden || failed) return;
  for (const touch of event.changedTouches) { const p = point(touch), target = ui.hit(p.x, p.y);
    if (router.down(touch.identifier, target) && screen === "run") { audio.gesture(); forward("down", touch); } }
};
const move = (event: TouchEvent): void => { if (hidden || failed) return; for (const touch of event.changedTouches) if (screen === "run" && router.move(touch.identifier)) forward("move", touch); };
const up = (event: TouchEvent): void => {
  if (hidden || failed) return;
  for (const touch of event.changedTouches) { const p = point(touch), routed = router.up(touch.identifier, ui.hit(p.x, p.y));
    if (routed.gameplay && screen === "run") forward("up", touch);
    if (routed.button && routed.button !== "modal") action(routed.button); }
};
const hide = (): void => {
  hidden = true; pause("hide"); if (screen === "ending") run?.scene.pause();
  game.loop.sleep(); log("hidden", { frames, physicsSteps, activeMs, screen });
};
const show = (): void => {
  hidden = false; game.loop.wake(); lastFrameAt = Date.now();
  if (screen === "ending") run?.scene.resume();
  log("shown-awaiting-gesture", { frames, physicsSteps, activeMs, screen });
};
const resize = (): void => {
  pause("resize"); const info = host.windowInfo(), v = viewMetrics(info);
  game.scale.resize(Math.round(info.windowWidth * v.dpr), Math.round(info.windowHeight * v.dpr));
  if (run?.sheep?.body) run.layout(); ui.refresh(); log("resize", { ...info, view: v });
};
function snapshot() {
  const raw = wx.getAppBaseInfo && wx.getDeviceInfo ? { ...wx.getAppBaseInfo(), ...wx.getDeviceInfo() } : wx.getSystemInfoSync();
  const versions = Object.fromEntries(["SDKVersion", "version", "platform", "system", "brand", "model"].filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
  const children = <T extends Phaser.GameObjects.GameObject>(group?: Phaser.Physics.Arcade.Group) => (group?.getChildren() ?? []) as T[];
  return { environment: "wx-runtime-unverified", stage: "core-loop", engine: Phaser.VERSION, requestedRenderer: __POC_CONFIG__.renderer,
    build: buildIdentity, renderer: game?.renderer ? game.renderer.type === Phaser.WEBGL ? "WEBGL" : "CANVAS" : "NOT_INITIALIZED", versions,
    timing: { uptimeMs: Date.now() - startedAt, engineSmoothedFps: frames >= 60 ? game.loop.actualFps : null },
    window: host.windowInfo(), view: viewMetrics(host.windowInfo()), frames, physicsSteps, activeMs, ready, paused: screen !== "run", hidden, failed, screen, round,
    collectedThisRun: run?.session?.score.starCount ?? 0, score: run?.session?.score.score ?? 0, speed: run?.session && run.speed, result,
    saveKey: WECHAT_SAVE_KEY, progress: save.load(), progressLoaded: save.writable, storageError: save.error, audio: audio.snapshot(), audioPlays: audio.snapshot().plays, errors: [...errors],
    sheep: run?.sheep?.body && { x: run.sheep.x, y: run.sheep.y, grounded: run.sheep.grounded, state: run.sheep.motionState, height: run.sheep.displayHeight,
      velocityY: (run.sheep.body as Phaser.Physics.Arcade.Body).velocity.y, bodyWidth: (run.sheep.body as Phaser.Physics.Arcade.Body).width, bodyHeight: (run.sheep.body as Phaser.Physics.Arcade.Body).height,
      animation: run.sheep.anims.currentAnim?.key, frame: run.sheep.frame.name },
    obstacles: children<Obstacle>(run?.obstacles).map(child => ({ x: child.x, y: child.y, width: child.definition.width, height: child.definition.height, kind: child.definition.kind, active: child.active, passed: child.passed })),
    stars: children<Star>(run?.stars).map(child => ({ x: child.x, y: child.y, active: child.active, collected: child.collected, missed: child.missed })),
    pickups: children<PowerUp>(run?.pickups).map(child => ({ x: child.x, y: child.y, type: child.type, active: child.active })),
    effects: run?.powers.activeEffects(activeMs) ?? [],
    textures: ready ? ["sheep-runner", ...Object.keys(textureFiles)].map(key => { const source = ui.textures.get(key).source[0]; return { key, width: source.width, height: source.height, scaleMode: source.scaleMode }; }) : [],
    buttons: ui.buttons, changes: host.changes };
}
GameGlobal.__SHEEP_WX__ = GameGlobal.__SHEEP_WX_POC__ = { events: host.events, snapshot,
  capture: () => ({ schema: 2, capturedAt: new Date().toISOString(), snapshot: snapshot(), events: [...host.events] }) };
const info = host.windowInfo(), v = viewMetrics(info);
try {
  game = new Phaser.Game({ type: __POC_CONFIG__.renderer === "canvas" ? Phaser.CANVAS : __POC_CONFIG__.renderer === "webgl" ? Phaser.WEBGL : host.webgl ? Phaser.WEBGL : Phaser.CANVAS,
    canvas: host.canvas, width: Math.round(info.windowWidth * v.dpr), height: Math.round(info.windowHeight * v.dpr),
    scene: [WechatLoad, WechatRun, ui], banner: false, autoFocus: false, backgroundColor: "#b4ddd1",
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, expandParent: false },
    render: { pixelArt: true, roundPixels: true, antialias: false, antialiasGL: false, transparent: false },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: PLAYER.gravityY }, fps: 60, debug: __POC_CONFIG__.debugPhysics } },
    fps: { min: 1000 / RUN.simulationDeltaCapMs, smoothStep: true }, audio: { noAudio: true },
    loader: { imageLoadType: "HTMLImageElement", timeout: 12000 }, input: { mouse: false, keyboard: false, touch: false, gamepad: false } });
  game.events.on("poststep", () => { frames++; lastFrameAt = Date.now(); });
  wx.onTouchStart(down); wx.onTouchMove(move); wx.onTouchEnd(up); wx.onTouchCancel(cancel);
  wx.onHide(hide); wx.onShow(show); wx.onWindowResize(resize); wx.onError?.(reportError);
  const watchdog = setInterval(() => { if (!hidden && !failed && Date.now() - lastFrameAt > 5000) reportError(Error("Phaser main loop stalled > 5s; no second loop has been started")); }, 1000);
  game.events.once("destroy", () => {
    clearInterval(watchdog); audio.destroy(); wx.offTouchStart(down); wx.offTouchMove(move); wx.offTouchEnd(up); wx.offTouchCancel(cancel);
    wx.offHide(hide); wx.offShow(show); wx.offWindowResize(resize); wx.offError?.(reportError); cancel();
  });
  log("boot", { stage: "core-loop", engine: Phaser.VERSION, requestedRenderer: __POC_CONFIG__.renderer, window: info });
} catch (error) { reportError(error); }
