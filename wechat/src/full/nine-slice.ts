import Phaser from "phaser";

/** Phaser 4.2.1's NineSlice Canvas method is empty. Adapt only these owned UI objects. */
export function nativeNineSlice(scene: Phaser.Scene, ...args: Parameters<Phaser.GameObjects.GameObjectFactory["nineslice"]>): Phaser.GameObjects.NineSlice {
  const object = scene.add.nineslice(...args);
  if (scene.game.renderer.type !== Phaser.CANVAS) return object;
  Object.assign(object, { renderCanvas(renderer: Phaser.Renderer.Canvas.CanvasRenderer, source: Phaser.GameObjects.NineSlice,
    camera: Phaser.Cameras.Scene2D.Camera, parentMatrix?: Phaser.GameObjects.Components.TransformMatrix): void {
    const context = renderer.currentContext;
    if (!Phaser.Renderer.Canvas.SetTransform(renderer, context, source, camera, parentMatrix)) return;
    camera.addToRenderList(source);
    const frame = source.frame, image = source.texture.getSourceImage() as CanvasImageSource;
    const x = -source.width * source.originX, y = -source.height * source.originY;
    const sx = [frame.cutX, frame.cutX + source.leftWidth, frame.cutX + frame.cutWidth - source.rightWidth, frame.cutX + frame.cutWidth];
    const sy = [frame.cutY, frame.cutY + source.topHeight, frame.cutY + frame.cutHeight - source.bottomHeight, frame.cutY + frame.cutHeight];
    const dx = [x, x + source.leftWidth, x + source.width - source.rightWidth, x + source.width];
    const dy = [y, y + source.topHeight, y + source.height - source.bottomHeight, y + source.height];
    context.imageSmoothingEnabled = false;
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
      if (sx[column + 1] <= sx[column] || sy[row + 1] <= sy[row] || dx[column + 1] <= dx[column] || dy[row + 1] <= dy[row]) continue;
      context.drawImage(image, sx[column], sy[row], sx[column + 1] - sx[column], sy[row + 1] - sy[row], dx[column], dy[row], dx[column + 1] - dx[column], dy[row + 1] - dy[row]);
    }
    context.restore();
  } });
  return object;
}
