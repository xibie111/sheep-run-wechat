import Phaser from "phaser";
import { ASSET_SCENE_KEY, loadRuntimeTextures } from "./resources";
import { addDisplayText, DISPLAY_FONTS } from "../../../src/ui/DisplayText";
import { addSceneButton } from "../../../src/ui/SceneButton";
import { addUiPanel } from "../../../src/ui/PastureUi";
import { watchViewport } from "../../../src/game/Viewport";

export class NativeAssetScene extends Phaser.Scene {
  private request!: { source: Phaser.Scene; keys: string[]; activate: () => void };
  private label!: Phaser.GameObjects.BitmapText;
  private stopLayout?: () => void;
  private complete = false;
  private loading = false;
  private failure = "";
  constructor() { super(ASSET_SCENE_KEY); }
  init(request: NativeAssetScene["request"]): void { this.request = request; this.complete = false; this.loading = false; this.failure = ""; }
  create(): void {
    this.draw(); this.begin();
    this.events.once("shutdown", () => { this.stopLayout?.(); this.request = undefined!; });
  }
  private draw(): void {
    this.stopLayout?.(); for (const child of [...this.children.list]) child.destroy();
    const root = this.add.container(0, 0), shade = this.add.rectangle(0, 0, 1, 1, 0x29190e, .6).setOrigin(0);
    root.setDepth(1); root.add(addUiPanel(this, 0, 0, 300, 170));
    // Progress changes while images decode. Render it in the same engine frame
    // instead of uploading the previous offscreen text raster one frame later.
    this.label = this.add.bitmapText(0, -35, DISPLAY_FONTS.body.key,
      this.failure ? "加载失败" : this.complete ? "加载完成" : "加载中", 20).setOrigin(.5).setTint(0x542b16); root.add(this.label);
    if (this.failure) root.add(addDisplayText(this, 0, -5,
      this.failure.includes("assetBaseUrl") ? "资源未设置" : "请稍后重试", 12));
    if (this.failure || this.complete) root.add(addSceneButton(this, 0, 26, this.complete ? "继续" : "重试", () => this.complete ? this.finish() : this.begin(), { width: 110, height: 34 }).setName("assets:continue"));
    if (this.failure) root.add(addSceneButton(this, 0, 65, "返回", () => { this.scene.resume(this.request.source.sys.settings.key); this.scene.stop(); }, { width: 90, height: 28 }));
    this.stopLayout = watchViewport(this, size => { root.setPosition(size.width / 2, size.height / 2); shade.setSize(size.width, size.height); });
  }
  private begin(): void {
    if (this.loading) return; this.loading = true; this.failure = ""; this.draw();
    const request = this.request;
    void loadRuntimeTextures(this, request.keys, progress => this.label.setText(`加载中 ${Math.round(progress * 100)}`)).then(() => {
      if (!this.scene.isActive() || this.request !== request) return;
      this.loading = false; this.complete = true;
      if (this.registry.get("wx-hidden")) this.draw(); else this.finish();
    }, error => {
      if (!this.scene.isActive() || this.request !== request) return;
      this.loading = false; this.failure = String(error); console.error("[sheep-wx-full] resource load failed", this.failure); this.registry.set("wx-resource-error", this.failure); this.draw();
    });
  }
  private finish(): void {
    if (!this.complete || this.registry.get("wx-hidden")) return;
    const { source, activate } = this.request;
    this.registry.remove("wx-resource-error"); this.scene.resume(source.sys.settings.key); this.scene.stop(); activate();
  }
}
