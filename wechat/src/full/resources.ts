import type Phaser from "phaser";
import { DELIVERY_CHAPTERS } from "../../../src/delivery/DeliveryChapters";
import { DELIVERY_V2_ASSETS } from "../../../src/delivery/DeliveryV2Assets";
import { RESIDENTS, RESIDENT_GROUP_PHOTO_KEY } from "../../../src/residents/ResidentCatalog";
import { WINDMILL_MEADOW_ASSETS } from "../../../src/delivery/windmillMeadowAssets";
import type { Host } from "../platform";
import { menuModalOwner } from "../../../src/ui/MenuModal";

declare const GameGlobal: { __SHEEP_WX_HOST__: Host };
export const ASSET_SCENE_KEY = "WxAssetScene";
export interface RuntimeResources { schema: number; engine: string; buildId: string; packages: string[]; textures: any[]; fonts: any[]; animations: any; assetBaseUrl?: string }
let manifest: RuntimeResources;
let plan: Record<string, string[]>;
let pendingResidency = "", settledResidency = "";
const loadedPackages = new Set<string>();
export function setRuntimeResources(value: RuntimeResources): void { manifest = value; plan = resourceGroups(value.textures); }
export function resourceGroups(textures: { key: string; bytes: number }[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}, deferred = new Set<string>();
  const add = (name: string, keys: (string | undefined)[]) => { groups[name] = [...new Set(keys.filter((key): key is string => !!key))]; groups[name].forEach(key => deferred.add(key)); };
  for (const chapter of DELIVERY_CHAPTERS) add("chapter:" + chapter.id, [
    ...chapter.landscapes.map(layer => layer.key), chapter.previewKey, chapter.postcardKey, chapter.endingKey, chapter.accessoryKey,
    chapter.challenge?.keepsakeKey, ...(chapter.challenge?.stamps.map(stamp => stamp.key) ?? []),
    ...(chapter.id === "windmill-invitation-v1" ? WINDMILL_MEADOW_ASSETS.map(asset => asset.key) : []),
  ]);
  add("delivery-select", [...DELIVERY_CHAPTERS.map(chapter => chapter.previewKey), ...DELIVERY_V2_ASSETS.map(asset => asset.key)]);
  add("journey", textures.filter(texture => texture.key.startsWith("scenery-")).map(texture => texture.key));
  add("resident-art", [RESIDENT_GROUP_PHOTO_KEY, ...RESIDENTS.map(resident => resident.keepsakeKey)]);
  add("wardrobe", textures.filter(texture => texture.key.startsWith("sheep-runner-")).map(texture => texture.key));
  add("run", [...groups.wardrobe, ...textures.filter(({ key }) =>
    key.startsWith("season-") || key.startsWith("result-") || key.startsWith("run-hud-") || key.startsWith("content-v2-trip-") || key === "ui-pause-reference-dialog" ||
    key === "illustrated-pasture-far" || key === "illustrated-pasture-near" || key.startsWith("pasture-") && !key.startsWith("pasture-display-") && !key.startsWith("pasture-pixel-")
  ).map(texture => texture.key)]);
  // Small shared stamps/NPCs/controls remain ready. A locked entry must not need
  // an entire chapter's landscape merely to draw its icon or eligibility state.
  const small = textures.filter(texture => texture.bytes <= 180000).map(texture => texture.key);
  groups.boot = [...new Set([...textures.filter(texture => !deferred.has(texture.key)).map(texture => texture.key), ...small])];
  const known = new Set(textures.map(texture => texture.key));
  for (const [name, keys] of Object.entries(groups)) for (const key of keys) if (!known.has(key)) throw Error(`Uncaptured original resource ${name}/${key}`);
  return groups;
}
export function requiredForTouch(scene: Phaser.Scene, name: string): string[] {
  if (!manifest) return [];
  const groups = plan;
  if (["button:成就册", "button:本局成就"].includes(name)) return groups.journey;
  if (name === "button:衣橱") return groups.wardrobe;
  if (["button:开始游戏", "button:再跑一次", "button:重新开始"].includes(name)) return groups.run;
  if (["mailbox-delivery", "mailbox-residents", "resident-brief"].includes(name)) return groups["delivery-select"];
  if (["resident-keepsake", "resident-group"].includes(name)) return groups["resident-art"];
  if (["delivery-start", "delivery-card"].includes(name)) {
    const overlays = scene.game.registry.get("wx-surface-snapshot")?.() ?? [];
    const id = overlays.find((surface: any) => surface.visible && surface.metadata.adventureOverlay === "delivery-panel")?.metadata.chapterId;
    if (!id || !groups["chapter:" + id]) throw Error("A selected original chapter is required before loading its resources");
    return [...new Set([...groups.run, ...groups["chapter:" + id]])];
  }
  return [];
}
/** Run only from the existing game's prerender, after scene/modal state settles. */
export function releaseInactiveResources(game: Phaser.Game): void {
  if (!manifest || game.scene.isActive(ASSET_SCENE_KEY)) return;
  const scenes = game.scene.getScenes(false).filter(scene => scene.sys.isActive() || scene.sys.isPaused());
  const menu = scenes.find(scene => scene.sys.settings.key === "MenuScene"), run = scenes.find(scene => scene.sys.settings.key === "RunScene");
  const owner = menu ? menuModalOwner(menu) : undefined, last = menu?.data.get("wx-asset-touch") as { name: string; keys: string[]; serial: number } | undefined;
  const signature = JSON.stringify([scenes.map(scene => scene.sys.settings.key).sort(), owner, run?.data.get("delivery-id"), last?.serial]);
  if (signature !== pendingResidency) { pendingResidency = signature; return; }
  if (signature === settledResidency) return; settledResidency = signature;
  const keep = new Set(plan.boot), add = (keys: string[] = []) => keys.forEach(key => keep.add(key));
  if (scenes.some(scene => ["RunScene", "ResultScene"].includes(scene.sys.settings.key))) add(plan.run);
  if (scenes.some(scene => scene.sys.settings.key === "WardrobeScene")) add(plan.wardrobe);
  if (run?.data.get("delivery-id")) add(plan["chapter:" + run.data.get("delivery-id")]);
  if (owner === "journey") add(plan.journey);
  if (owner === "delivery" || owner === "residents") { add(plan["delivery-select"]); add(last?.keys); }
  const remove = manifest.textures.filter(texture => !keep.has(texture.key) && game.textures.exists(texture.key)), keys = new Set(remove.map(texture => texture.key));
  if (!remove.length) return;
  for (const animation of manifest.animations.anims) if (animation.frames.some((frame: any) => keys.has(frame.key))) game.anims.remove(animation.key);
  for (const font of manifest.fonts) if (keys.has(font.texture)) game.cache.bitmapFont.remove(font.key);
  for (const texture of remove) game.textures.remove(texture.key);
  GameGlobal.__SHEEP_WX_HOST__.log("full-resource-released", { textures: [...keys] });
}
function restore(scene: Phaser.Scene, entries: any[]): void {
  for (const entry of entries) {
    const texture = scene.textures.get(entry.key); texture.setFilter(1);
    if (texture.source[0].width !== entry.width || texture.source[0].height !== entry.height) { scene.textures.remove(entry.key); throw Error(`Texture dimensions changed: ${entry.key}`); }
    for (const data of entry.frames) {
      let frame = (texture.frames as Record<string, Phaser.Textures.Frame>)[data.name];
      if (!frame) frame = texture.add(data.name, 0, data.cutX, data.cutY, data.cutWidth, data.cutHeight)!;
      else frame.setSize(data.cutWidth, data.cutHeight, data.cutX, data.cutY);
      if (data.trimmed) frame.setTrim(data.sourceSize.w, data.sourceSize.h, data.spriteSourceSize.x, data.spriteSourceSize.y, data.spriteSourceSize.w, data.spriteSourceSize.h);
      if (data.rotated) throw Error(`Review rotated runtime frame: ${entry.key}/${data.name}`);
      frame.customPivot = data.customPivot; frame.pivotX = data.pivotX; frame.pivotY = data.pivotY;
    }
    texture.firstFrame = entry.firstFrame;
  }
  for (const font of manifest.fonts) if (scene.textures.exists(font.texture) && !scene.cache.bitmapFont.exists(font.key)) scene.cache.bitmapFont.add(font.key, { data: font.data, texture: font.texture, frame: font.frame });
  for (const animation of manifest.animations.anims) if (!scene.anims.exists(animation.key) && animation.frames.every((frame: any) => scene.textures.exists(frame.key))) scene.anims.fromJSON({ anims: [animation], globalTimeScale: manifest.animations.globalTimeScale ?? 1 });
}
export async function loadRuntimeTextures(scene: Phaser.Scene, keys: string[], progress: (done: number) => void = () => {}): Promise<void> {
  const host = GameGlobal.__SHEEP_WX_HOST__, requested = manifest.textures.filter(entry => keys.includes(entry.key)), missing = requested.filter(entry => !scene.textures.exists(entry.key));
  if (requested.length !== new Set(keys).size) throw Error("Unknown requested full-game texture");
  if (missing.some(entry => entry.remote) && !manifest.assetBaseUrl) throw Error("未配置本项目的 HTTPS 素材地址，请填写 wechat/local.config.json 的 assetBaseUrl 后重新构建");
  const packages = [...new Set(missing.map(entry => String(entry.file).split("/")[0]))].filter(name => manifest.packages.includes(name) && !loadedPackages.has(name));
  host.log("full-resource-request", { scene: scene.sys.settings.key, textures: missing.map(entry => entry.key), packages });
  for (const name of packages) await new Promise<void>((resolve, reject) => {
    if (!host.wx.loadSubpackage) { reject(Error("wx.loadSubpackage unavailable")); return; }
    host.wx.loadSubpackage({ name, success: () => { loadedPackages.add(name); resolve(); }, fail: reason => reject(Error(`Subpackage ${name}: ${String(reason)}`)) });
  });
  if (missing.length) await new Promise<void>((resolve, reject) => {
    const failed: string[] = [], onError = (file: Phaser.Loader.File) => { failed.push(String(file.key)); };
    scene.load.on("loaderror", onError); scene.load.on("progress", progress);
    scene.load.once("complete", () => { scene.load.off("loaderror", onError); scene.load.off("progress", progress); failed.length ? reject(Error(`Images failed: ${failed.join(", ")}`)) : resolve(); });
    for (const entry of missing) {
      scene.load.image(entry.key, entry.remote ? manifest.assetBaseUrl + entry.file : entry.file);
    }
    scene.load.start();
  });
  restore(scene, requested); host.log("full-resource-ready", { scene: scene.sys.settings.key, textures: requested.map(entry => entry.key) });
}
