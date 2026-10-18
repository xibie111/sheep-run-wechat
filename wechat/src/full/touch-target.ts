import { bindTouchTarget as originalTouchTarget } from "../../../src/ui/TouchTarget";
import { ASSET_SCENE_KEY, requiredForTouch } from "./resources";
let requestSerial = 0;

/** Keep the original gesture owner. Only a deferred feature's activation waits. */
export const bindTouchTarget: typeof originalTouchTarget = (scene, target, width, height, activate, appearance) => {
  originalTouchTarget(scene, target, width, height, () => {
    const keys = requiredForTouch(scene, target.name);
    if (keys.length) scene.data.set("wx-asset-touch", { name: target.name, keys, serial: ++requestSerial });
    if (keys.every(key => scene.textures.exists(key))) { activate(); return; }
    scene.scene.pause(); scene.scene.run(ASSET_SCENE_KEY, { source: scene, keys, activate });
  }, appearance);
};
