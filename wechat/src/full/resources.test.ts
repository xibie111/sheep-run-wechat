import { describe, expect, it } from "vitest";
import { resourceGroups } from "./resources";
import { DELIVERY_ASSETS } from "../../../src/delivery/deliveryAssets";
import { DELIVERY_V2_ASSETS } from "../../../src/delivery/DeliveryV2Assets";
import { DELIVERY_EXPANSION_ASSETS } from "../../../src/delivery/DeliveryExpansionAssets";
import { RESIDENT_ASSETS } from "../../../src/residents/residentAssets";

const registered = [...DELIVERY_ASSETS, ...DELIVERY_V2_ASSETS, ...DELIVERY_EXPANSION_ASSETS, ...RESIDENT_ASSETS].map(({ key }) => ({ key, bytes: 500000 }));
const textures = [...new Map([...registered, { key: "sheep-runner", bytes: 240000 }, { key: "sheep-runner-black", bytes: 240000 },
  { key: "pasture-display-64", bytes: 440000 }, { key: "season-spring-far", bytes: 640000 }, { key: "scenery-rainbow", bytes: 560000 },
  { key: "ui-button", bytes: 1000 }].map(texture => [texture.key, texture])).values()];
describe("full original feature resource residency", () => {
  it("starts with the original menu/font/white sheep while deferring other skins, season art, chapters and postcards", () => {
    const plan = resourceGroups(textures);
    expect(plan.boot).toEqual(expect.arrayContaining(["sheep-runner", "pasture-display-64", "ui-button"]));
    for (const key of ["sheep-runner-black", "season-spring-far", "scenery-rainbow", "delivery-forest-v1", "resident-v1-group-photo"]) expect(plan.boot).not.toContain(key);
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
});
