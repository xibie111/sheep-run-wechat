import type Phaser from "phaser";
import type { Host } from "../platform";
import { viewMetrics } from "../state";

type Surface = { canvas: HTMLCanvasElement; scene: Phaser.Scene; key: string; texture?: Phaser.Textures.CanvasTexture;
  image?: Phaser.GameObjects.Image; dirty: boolean; disposed: boolean; cleanup: () => void };
const surfaces = new Set<Surface>(), owners = new WeakMap<HTMLCanvasElement, Surface>();
export const COMPOSITOR_KEY = "WxCanvasCompositor";
let serial = 0, listening = new WeakSet<Phaser.Game>();
declare const GameGlobal: { __SHEEP_WX_HOST__: Host };
function host(): Host { return GameGlobal.__SHEEP_WX_HOST__; }
function rect() { const v = viewMetrics(host().windowInfo()); return { x: v.left, y: v.top, left: v.left, top: v.top,
  width: v.size.width * v.fit, height: v.size.height * v.fit, right: v.left + v.size.width * v.fit, bottom: v.top + v.size.height * v.fit,
  toJSON() { return { x: this.x, y: this.y, width: this.width, height: this.height }; } }; }
function attach(surface: Surface): void {
  if (surface.image || surface.disposed) return;
  const { scene, canvas, key } = surface;
  surface.texture = scene.textures.addCanvas(key, canvas)!;
  surface.texture.setFilter(1);
  // Original scenes collect slices of their display list into UI containers.
  // Compositor images must never join those source lists or be transformed twice.
  const compositor = scene.game.scene.getScene(COMPOSITOR_KEY);
  surface.image = compositor.add.image(0, 0, key).setOrigin(0).setScrollFactor(0);
  surfaces.add(surface);
  if (!listening.has(scene.game)) {
    listening.add(scene.game);
    // Original painter callbacks use the game's postrender; upload on the next
    // prerender of the same TimeStep. No DOM compositor or second animation loop.
    scene.game.events.on("prerender", () => {
      for (const item of surfaces) {
        if (item.scene.game !== scene.game || item.disposed || !item.image) continue;
        const settingsActive = item.scene.game.scene.isActive("WxSettingsScene");
        const loadingActive = item.scene.game.scene.isActive("WxAssetScene");
        const active = item.scene.sys.isVisible() && !item.scene.sys.isSleeping() && (!settingsActive || item.scene.sys.settings.key === "WxSettingsScene") && (!loadingActive || item.scene.sys.settings.key === "WxAssetScene");
        const visible = active && !item.canvas.hidden && item.canvas.style.display !== "none";
        item.image.setVisible(visible).setDepth(10000 + (Number(item.canvas.style.zIndex) || 1) * 100 + Number(item.key.split("-").at(-1)) / 1000);
        if (!visible || !item.dirty) continue;
        const v = viewMetrics(host().windowInfo());
        item.texture!.refresh();
        item.image.setDisplaySize(v.size.width, v.size.height);
        item.dirty = false;
      }
    });
  }
}
/** Offscreen native raster with only metadata used by existing drawing code. */
export function createNativeCanvas(scene: Phaser.Scene): HTMLCanvasElement {
  const canvas = host().wx.createCanvas(); canvas.width = canvas.height = 1;
  const target = canvas as any;
  target.dataset ??= {}; target.style ??= {}; target.hidden ??= false;
  target.setAttribute ??= (key: string, value: unknown) => { target[key] = value; };
  const cleanup = () => removeNativeCanvas(canvas);
  const surface: Surface = { canvas, scene, key: `wx-display-surface-${++serial}`, dirty: true, disposed: false, cleanup };
  owners.set(canvas, surface);
  scene.events.once("shutdown", cleanup);
  scene.events.once("destroy", cleanup);
  return canvas;
}
export function removeNativeCanvas(canvas: HTMLCanvasElement): void {
  const surface = owners.get(canvas); if (!surface || surface.disposed) return;
  surface.scene.events.off("shutdown", surface.cleanup); surface.scene.events.off("destroy", surface.cleanup);
  surface.disposed = true; surfaces.delete(surface); surface.image?.destroy();
  if (surface.texture && surface.scene.textures.exists(surface.key)) surface.scene.textures.remove(surface.key);
}
export function nativeSurfaceParent(scene: Phaser.Scene) {
  return { appendChild(canvas: HTMLCanvasElement) { const owner = owners.get(canvas); if (!owner) throw Error("Unregistered visible canvas surface"); attach(owner); return canvas; },
    getBoundingClientRect: rect,
    querySelector<T = HTMLCanvasElement>(selector: string): T | undefined {
      return [...surfaces].find(item => item.scene === scene && surfaceSelectorMatches(item.canvas, selector))?.canvas as T | undefined;
    },
    querySelectorAll<T = HTMLCanvasElement>(selector: string): T[] {
      return [...surfaces].filter(item => item.scene === scene && surfaceSelectorMatches(item.canvas, selector)).map(item => item.canvas as T);
    } };
}
/** Only the existing data-tag / visible-priority queries are part of this port. */
export function surfaceSelectorMatches(canvas: Pick<HTMLCanvasElement, "dataset" | "style">, selector: string): boolean {
  return selector.split(",").some(part => {
    const match = part.trim().match(/^\[data-([\w-]+)=["']([^"']+)["']\](\[style\*=["']display: block["']\])?$/);
    if (!match) throw Error(`Unsupported native surface selector: ${part}`);
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return canvas.dataset[key] === match[2] && (!match[3] || canvas.style.display === "block");
  });
}
/** Native replacement for DOM surface sizing; existing paint coordinates stay logical. */
export function sizeDisplaySurface(canvas: HTMLCanvasElement, _gameCanvas: HTMLCanvasElement, _parent: unknown, logicalWidth: number): number {
  const owner = owners.get(canvas); if (!owner || owner.disposed) throw Error("Native surface is not live");
  const v = viewMetrics(host().windowInfo());
  canvas.width = Math.max(1, Math.round(v.size.width * v.fit * v.dpr));
  canvas.height = Math.max(1, Math.round(v.size.height * v.fit * v.dpr));
  owner.texture?.setSize(canvas.width, canvas.height);
  owner.dirty = true;
  return canvas.width / logicalWidth;
}
export function surfaceSnapshot() { return [...surfaces].map(item => ({ key: item.key, scene: item.scene.sys.settings.key,
  visible: item.image?.visible, width: item.canvas.width, height: item.canvas.height, metadata: { ...item.canvas.dataset } })); }
