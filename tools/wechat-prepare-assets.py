"""Prepare only PoC pixels from existing art. Never write source images.

Pillow is used only offline; the runtime has no image processing dependency.
The background reduction matches createSceneryRepeat's nearest 480x270 raster;
the fence matches the original first spring atlas cell, alpha bounds and 4x fit.
"""
from pathlib import Path
import hashlib
import json
import math
import re
import sys
import wave
from array import array
import PIL
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve()
if OUT != (ROOT / "builds/wechat-poc/assets").resolve():
    raise RuntimeError("Asset output must be the isolated PoC assets directory")
OUT.mkdir(parents=True, exist_ok=True)
records = []

def emit(source, target, transform, operation):
    path = ROOT / source
    before = path.read_bytes()
    with Image.open(path) as raw:
        image = operation(raw.convert("RGBA"))
        image.save(OUT / target, optimize=True)
    if path.read_bytes() != before:
        raise RuntimeError("Source art changed during preparation")
    records.append({"source": source, "output": "assets/" + target,
                    "sourceBytes": len(before), "sourceSha256": hashlib.sha256(before).hexdigest(),
                    "bytes": (OUT / target).stat().st_size,
                    "sha256": hashlib.sha256((OUT / target).read_bytes()).hexdigest(), "transform": transform})

for band in ("far", "near"):
    emit(f"assets/backgrounds/run-{band}-v1.png", f"run-{band}.png",
         "nearest resize to existing 480x270 scenery preparation raster",
         lambda image: image.resize((480, 270), Image.Resampling.NEAREST))

def fit_subject(subject, width, height, art_height=None):
    scale = min(width / subject.width, (art_height or height) / subject.height)
    size = (math.floor(subject.width * scale + .5), math.floor(subject.height * scale + .5))
    result = Image.new("RGBA", (width, height))
    result.paste(subject.resize(size, Image.Resampling.NEAREST), ((width - size[0]) // 2, height - size[1]))
    result.putalpha(result.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
    return result

# Geometry is read from the original definitions, not a second balancing table.
definitions = []
definition_source = (ROOT / "src/game/ObstacleDefinitions.ts").read_text(encoding="utf-8")
for _, body in re.findall(r"export const (\w+): ObstacleDefinition = \{(.*?)\n\};", definition_source, re.S):
    def field(name):
        return re.search(r"\b" + name + r":\s*(\d+)", body).group(1)
    definitions.append({"kind": re.search(r'kind:\s*"([^"]+)"', body).group(1),
                        "texture": re.search(r'texture:\s*"([^"]+)"', body).group(1),
                        "width": int(field("width")), "height": int(field("height")),
                        "puddleHeight": int(re.search(r"hitbox:\s*\{[^}]*height:\s*(\d+)", body).group(1)) if 'kind: "Puddle"' in body else None})
if len(definitions) != 18:
    raise RuntimeError("Recheck obstacle preparation against updated definitions")
base_kinds = ["WoodFence", "Pumpkin", "Rock", "Puddle", "FlyingBird"]
frame_groups = [
    ("assets/seasons/additional-obstacles-v1/frames.json", "assets/seasons/additional-obstacles-v1/atlas.png"),
    ("assets/seasons/new-obstacles-v2/frames.json", "assets/seasons/new-obstacles-v2/runtime/new-obstacles-atlas.png"),
    ("assets/seasons/expanded-obstacles-v3/frames.json", "assets/seasons/expanded-obstacles-v3/atlas.png"),
]
for definition in definitions:
    kind = definition["kind"]
    source = "assets/seasons/generated-v1/spring-obstacles.png"
    frame = None
    if kind == "Puddle":
        source = "assets/seasons/puddles-v2/atlas.png"
        frame = {"x": 106, "y": 211, "width": 1043, "height": 140}
    elif kind not in base_kinds:
        for frame_file, atlas_file in frame_groups:
            frames = json.loads((ROOT / frame_file).read_text(encoding="utf-8"))["spring"]
            if kind in frames:
                frame = frames[kind]
                source = "assets/seasons/additional-obstacles-v1/towers-source.png" if kind == "TallStack" else atlas_file
                break
        if frame is None:
            raise RuntimeError(f"Missing real obstacle frame: {kind}")

    def prepare_obstacle(image, d=definition, f=frame):
        if f:
            subject = image.crop((f["x"], f["y"], f["x"] + f["width"], f["y"] + f["height"]))
        else:
            index = base_kinds.index(d["kind"])
            cell = image.crop(tuple(math.floor(v + .5) for v in (
                index % 3 * image.width / 3, index // 3 * image.height / 2,
                (index % 3 + 1) * image.width / 3, (index // 3 + 1) * image.height / 2)))
            bounds = cell.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()
            if not bounds:
                raise RuntimeError(f"Missing real obstacle pixels: {d['kind']}")
            subject = cell.crop(bounds)
        return fit_subject(subject, d["width"] * 4, d["height"] * 4,
                           d["puddleHeight"] * 4 if d["puddleHeight"] else None)

    emit(source, definition["texture"] + ".png",
         f"original spring {kind} frame; original geometry at 4x, nearest uniform fit, foot baseline and alpha>=128",
         prepare_obstacle)

emit("assets/ui/pause/pause-dialog-reference-v1.png", "pause.png",
     "original PauseDialog panel (452,68,768,816), nearest resize to 384x408 (2x displayed size)",
     lambda image: image.crop((452, 68, 1220, 884)).resize((384, 408), Image.Resampling.NEAREST))
for name, crop, size in [("title", (22, 22, 1786, 845), (440, 205)),
                          ("start", (175, 64, 2013, 691), (306, 104))]:
    emit(f"assets/ui/menu-reference-v2/{name}-v2.png", f"menu-{name}.png",
         "original MenuArt ink bounds, nearest uniform reduction for canvas UI",
         lambda image, c=crop, s=size: image.crop(c).resize(s, Image.Resampling.NEAREST))
emit("assets/ui/result-reference-v1/panel.png", "result-panel.png",
     "original ResultView full aspect ratio, nearest reduction to 960x540", 
     lambda image: image.resize((960, 540), Image.Resampling.NEAREST))
for name, frame in [("retry", (62, 124, 812, 314)), ("home", (868, 125, 1474, 313))]:
    emit("assets/ui/result-reference-v1/controls.png", f"result-{name}.png",
         "original result control frame, nearest reduction to double displayed size",
         lambda image, f=frame: image.crop(f).resize((220 if name == "retry" else 172, 64), Image.Resampling.NEAREST))
for name, source in [("magnet", "magnet"), ("shield", "shield"), ("starMultiplier", "double-star")]:
    emit(f"assets/adventure-v1/runtime/{source}.png", f"powerup-{name}.png",
         "original adventure pickup uniformly fitted to 88x88, nearest, no invented art",
         lambda image: fit_subject(image, 88, 88))
def ink_font(image):
    # Canvas BitmapText does not apply WebGL tint. Preserve the exact glyph alpha
    # while baking the original UI ink color into this PoC-only output.
    result = Image.new("RGBA", image.size, (0x54, 0x2B, 0x16, 0))
    result.putalpha(image.getchannel("A"))
    if result.getchannel("A").tobytes() != image.getchannel("A").tobytes():
        raise RuntimeError("Font glyph alpha changed")
    return result

emit("assets/fonts/pasture-display-64.png", "font.png",
     "RGB recolor to existing UI ink #542b16 only; all glyph alpha pixels unchanged", ink_font)

# Keep the complete original 32-bar loop. A native music subpackage avoids
# imposing its PCM bytes on first launch; no codec/toolchain download is needed.
music_source = ROOT / "assets/audio/pasture-morning-v1.wav"
music_out = OUT.parent / "music"
music_out.mkdir(exist_ok=True)
with wave.open(str(music_source), "rb") as raw:
    if raw.getnchannels() != 2 or raw.getsampwidth() != 2 or raw.getframerate() != 22050:
        raise RuntimeError("Recheck original music format before mono export")
    samples = array("h", raw.readframes(raw.getnframes()))
mono = array("h", ((int(samples[i]) + int(samples[i + 1])) // 2 for i in range(0, len(samples), 2)))
with wave.open(str(music_out / "pasture-morning.wav"), "wb") as out:
    out.setnchannels(1); out.setsampwidth(2); out.setframerate(22050); out.writeframes(mono.tobytes())
(music_out / "game.js").write_text("// Local music-only subpackage; no loop or listeners.\n", encoding="utf-8")
records.append({"source": "assets/audio/pasture-morning-v1.wav", "output": "music/pasture-morning.wav",
                "sourceSha256": hashlib.sha256(music_source.read_bytes()).hexdigest(),
                "sha256": hashlib.sha256((music_out / "pasture-morning.wav").read_bytes()).hexdigest(),
                "bytes": (music_out / "pasture-morning.wav").stat().st_size,
                "transform": "full original 73.846-second loop, stereo average to mono PCM16/22050; no trim or new composition"})
(OUT / "preparation.json").write_text(json.dumps({"pillow": PIL.__version__, "records": records}, ensure_ascii=False, indent=2), encoding="utf-8")
