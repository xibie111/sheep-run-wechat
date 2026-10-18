/** Read actual rendered text and touch bounds. Browser/DevTools evidence stays separate. */
export function collectUiLayout() {
  const api = GameGlobal.__SHEEP_WX_FULL__, game = api.game(), state = api.snapshot();
  const texts = [], controls = [], issues = [];
  const tripOpen = state.surfaces.some(s => s.visible && s.metadata.contentV2Overlay === "trip-card" && s.metadata.open === "true");
  const top = ["WxAssetScene", "WxSettingsScene"].find(key => game.scene.isActive(key));
  const rect = b => ({ x: b.x, y: b.y, width: b.width, height: b.height });
  const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .6 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .6;
  const contains = (a, b, tolerance = .6) => b.x >= a.x - tolerance && b.y >= a.y - tolerance &&
    b.x + b.width <= a.x + a.width + tolerance && b.y + b.height <= a.y + a.height + tolerance;
  for (const scene of game.scene.getScenes(false)) {
    if (!scene.sys.isVisible() || scene.sys.isSleeping() || top && scene.sys.settings.key !== top) continue;
    const camera = scene.cameras.main;
    const walk = (list, shown = true, owner) => {
      for (const object of list) {
        const visible = shown && object.visible !== false && object.active !== false && object.alpha !== 0;
        if (!visible) continue;
        let control = owner;
        if (object.input?.enabled && object.getBounds) {
          control = { name: object.name, scene: scene.sys.settings.key, box: rect(object.getBounds()) };
          control.box.x -= camera.scrollX * object.scrollFactorX; control.box.y -= camera.scrollY * object.scrollFactorY;
          controls.push(control);
        }
        if (object.type === "BitmapText" && object.text && !tripOpen) {
          const glyphs = object.getTextBounds().characters.filter(g => g.w > 0 && g.h > 0);
          if (glyphs.length) {
            const m = object.getWorldTransformMatrix(), points = glyphs.flatMap(g => {
              const x = g.x - object.displayOriginX, y = g.y - object.displayOriginY;
              return [[x, y], [x + g.w, y], [x, y + g.h], [x + g.w, y + g.h]].map(([x, y]) => ({
                x: m.a * x + m.c * y + m.tx - camera.scrollX * object.scrollFactorX,
                y: m.b * x + m.d * y + m.ty - camera.scrollY * object.scrollFactorY,
              }));
            });
            const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
            texts.push({ text: object.text, scene: scene.sys.settings.key, layer: "bitmap", name: object.name,
              ink: { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y },
              control });
          }
        }
        if (object.list) walk(object.list, visible, control);
      }
    };
    walk(scene.children.list);
  }
  for (const surface of state.surfaces.filter(item => item.visible && item.metadata.lines)) {
    for (const line of JSON.parse(surface.metadata.lines)) {
      if (!line.ink || !line.text) continue;
      texts.push({ text: line.text, scene: surface.scene, layer: surface.metadata.adventureOverlay ?? surface.metadata.contentV2Overlay,
        ink: rect(line.ink), box: line.box && rect(line.box) });
    }
  }
  for (const text of texts) {
    if (text.box && !contains(text.box, text.ink)) issues.push({ kind: "outside-text-box", text });
    if (text.control && !contains(text.control.box, text.ink)) issues.push({ kind: "outside-control", text });
    if (!contains({ x: 0, y: 0, ...state.view.size }, text.ink)) issues.push({ kind: "outside-screen", text });
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    // addWoodTitle deliberately draws the same title twice as a one-pixel shadow.
    const shadow = a.layer === "bitmap" && b.layer === "bitmap" && a.text === b.text &&
      Math.abs(a.ink.x - b.ink.x) <= 3 && Math.abs(a.ink.y - b.ink.y) <= 3;
    if (!shadow && a.scene === b.scene && overlap(a.ink, b.ink)) issues.push({ kind: "text-intersection", a, b });
  }
  return { buildId: state.buildId, renderer: state.renderer, view: state.view, scenes: state.scenes.filter(s => s.active || s.paused), texts, controls, issues };
}
