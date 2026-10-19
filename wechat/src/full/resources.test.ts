import type Phaser from "phaser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseInactiveResources, requiredForTouch, resourceGroups, setRuntimeResources } from "./resources";
import { SaveSystem, type SaveData } from "../../../src/systems/SaveSystem";
import { DELIVERY_ASSETS } from "../../../src/delivery/deliveryAssets";
import { DELIVERY_V2_ASSETS } from "../../../src/delivery/DeliveryV2Assets";
import { DELIVERY_EXPANSION_ASSETS } from "../../../src/delivery/DeliveryExpansionAssets";
import { RESIDENT_ASSETS } from "../../../src/residents/residentAssets";

vi.mock("../../../src/systems/SaveSystem", () => ({ SaveSystem: { load: vi.fn() } }));

const registered = [...DELIVERY_ASSETS, ...DELIVERY_V2_ASSETS, ...DELIVERY_EXPANSION_ASSETS, ...RESIDENT_ASSETS].map(({ key }) => ({ key, bytes: 500000 }));
const textures = [...new Map([...registered, { key: "sheep-runner", bytes: 240000 }, { key: "sheep-runner-black", bytes: 240000 },
  { key: "sheep-runner-brown", bytes: 240000 }, { key: "sheep-runner-rose", bytes: 10000 },
  { key: "pasture-display-64", bytes: 440000 }, { key: "season-spring-far", bytes: 640000 }, { key: "scenery-rainbow", bytes: 560000 },
  { key: "ui-button", bytes: 1000 }].map(texture => [texture.key, texture])).values()];
const freshSave: SaveData = { version: 5, highScore: 0, totalStars: 0, spentStars: 0, coins: 0,
  selectedSkin: "white", unlockedSkins: ["white"], upgrades: { jump: 0, speed: 0, magnet: 0, dash: 0 },
  settings: { music: true, sfx: true, musicVolume: 1, sfxVolume: 1 } };
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(SaveSystem.load).mockReturnValue(freshSave);
  setRuntimeResources({ schema: 1, engine: "4.2.1", buildId: "resource-test", packages: [], textures,
    fonts: [], animations: { anims: [] } });
});
afterEach(() => vi.unstubAllGlobals());
describe("full original feature resource residency", () => {
  it("starts with the original menu/font/white sheep while deferring other skins, season art, chapters and postcards", () => {
    const plan = resourceGroups(textures);
    expect(plan.boot).toEqual(expect.arrayContaining(["sheep-runner", "pasture-display-64", "ui-button"]));
    for (const key of ["sheep-runner-black", "sheep-runner-rose", "season-spring-far", "scenery-rainbow", "delivery-forest-v1", "resident-v1-group-photo"]) expect(plan.boot).not.toContain(key);
    expect(plan.run).toEqual(expect.arrayContaining(["sheep-runner-black", "season-spring-far"]));
  });
  it("keeps every authored windmill dependency and original selection validator resource", () => {
    const plan = resourceGroups(textures);
    expect(plan["chapter:windmill-invitation-v1"]).toEqual(expect.arrayContaining(["windmill-meadow-physics-backdrop", "windmill-meadow-physics-landmark", "windmill-meadow-physics-grass", "delivery-expansion-windmill-ending"]));
    for (const asset of DELIVERY_V2_ASSETS) expect(plan["delivery-select"]).toContain(asset.key);
    expect(plan["chapter:riverside-thanks-v1"]).toContain("resident-v1-riverside-thanks-ending");
    expect(plan["chapter:riverside-thanks-v1"]).not.toContain("resident-v1-lighthouse-gathering-ending");
  });
  it("refuses an incomplete capture rather than substituting a missing scene illustration", () => {
    expect(() => resourceGroups(textures.filter(texture => texture.key !== "delivery-hill-v1"))).toThrow("Uncaptured original resource");
  });
  it("loads no locked skin for a new player's start, retry or restart", () => {
    for (const name of ["button:开始游戏", "button:再跑一次", "button:重新开始"]) {
      const keys = requiredForTouch({} as Phaser.Scene, name);
      expect(keys).toContain("season-spring-far");
      expect(keys.some(key => key.startsWith("sheep-runner-"))).toBe(false);
    }
  });
  it("keeps selected and owned companion skins, all wardrobe previews and authored chapter assets", () => {
    vi.mocked(SaveSystem.load).mockReturnValue({ ...freshSave, selectedSkin: "black", unlockedSkins: ["white", "black", "brown"] });
    const keys = requiredForTouch({} as Phaser.Scene, "button:开始游戏");
    expect(keys).toEqual(expect.arrayContaining(["sheep-runner-black", "sheep-runner-brown"]));
    expect(keys).not.toContain("sheep-runner-rose");
    expect(requiredForTouch({} as Phaser.Scene, "button:衣橱")).toContain("sheep-runner-rose");
    const scene = { game: { registry: { get: () => () => [{ visible: true, metadata: { adventureOverlay: "delivery-panel", chapterId: "hill-goodnight-v1" } }] } } } as unknown as Phaser.Scene;
    expect(requiredForTouch(scene, "delivery-start")).toEqual(expect.arrayContaining(["sheep-runner-black", "sheep-runner-brown", "delivery-hill-v1"]));
    expect(requiredForTouch(scene, "delivery-start")).not.toContain("sheep-runner-rose");
  });
  it("releases locked previews after the wardrobe while retaining owned companions without per-frame storage reads", () => {
    vi.mocked(SaveSystem.load).mockReturnValue({ ...freshSave, selectedSkin: "black", unlockedSkins: ["white", "black"] });
    const remove = vi.fn(), removeAnimation = vi.fn();
    setRuntimeResources({ schema: 1, engine: "4.2.1", buildId: "resource-test", packages: [], textures, fonts: [], animations: { anims: [
      { key: "rose-run", frames: [{ key: "sheep-runner-rose" }] }, { key: "black-run", frames: [{ key: "sheep-runner-black" }] },
    ] } });
    const scene = { sys: { isActive: () => true, isPaused: () => false, settings: { key: "RunScene" } }, data: { get: () => undefined } };
    const game = { scene: { isActive: () => false, getScenes: () => [scene] }, textures: { exists: () => true, remove },
      anims: { remove: removeAnimation }, cache: { bitmapFont: { remove: vi.fn() } } } as unknown as Phaser.Game;
    vi.stubGlobal("GameGlobal", { __SHEEP_WX_HOST__: { log: vi.fn() } });
    for (let frame = 0; frame < 5; frame++) releaseInactiveResources(game);
    expect(remove).toHaveBeenCalledWith("sheep-runner-rose");
    expect(remove).not.toHaveBeenCalledWith("sheep-runner-black");
    expect(removeAnimation).toHaveBeenCalledWith("rose-run");
    expect(removeAnimation).not.toHaveBeenCalledWith("black-run");
    expect(SaveSystem.load).toHaveBeenCalledOnce();
  });
});
