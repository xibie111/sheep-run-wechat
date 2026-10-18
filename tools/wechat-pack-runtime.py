"""Prepare full-game PNGs without changing source art or sprite geometry.

Large illustrations may use a 256-color RGB palette only when visible-pixel
PSNR >= 38 dB. Alpha is retained byte-for-byte; fonts and sheep stay exact.
All size/quality decisions are recorded; no resize, dither or placeholder.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
import math
import re
import shutil
import PIL
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "builds/wechat-full-runtime"
OUT = ROOT / "builds/wechat-full-prepared"
REPORT = ROOT / "reports/wechat-full/20261016-113750-full-migration"
(OUT / "textures").mkdir(parents=True, exist_ok=True)
manifest = json.loads((SOURCE / "runtime.json").read_text(encoding="utf-8"))


def prepare(texture):
    source = SOURCE / texture["file"]
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != texture["sha256"]:
        raise RuntimeError(f"Runtime capture changed: {texture['key']}")
    record = {"key": texture["key"], "sourceSha256": texture["sha256"], "sourceBytes": len(raw),
              "transform": "exact PNG copy", "alphaExact": True, "resized": False, "psnrDb": None}
    selected = raw
    protected = re.search(r"sheep|font|display|digits", texture["key"], re.I)
    if len(raw) > 180_000 and not protected:
        with Image.open(source) as loaded:
            original = loaded.convert("RGBA")
            rgb = original.convert("RGB")
            reduced = rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                                   dither=Image.Dither.NONE).convert("RGB")
            mask = original.getchannel("A").point(lambda a: 255 if a >= 16 else 0)
            rms = ImageStat.Stat(ImageChops.difference(rgb, reduced), mask).rms
            error = math.sqrt(sum(value * value for value in rms) / 3)
            psnr = 20 * math.log10(255 / error) if error else 99.0
            if psnr >= 38:
                prepared = reduced.convert("RGBA")
                prepared.putalpha(original.getchannel("A"))
                if prepared.getchannel("A").tobytes() != original.getchannel("A").tobytes():
                    raise RuntimeError("Alpha changed during packaging")
                buffer = io.BytesIO(); prepared.save(buffer, format="PNG", optimize=True)
                if len(buffer.getvalue()) < len(selected):
                    selected = buffer.getvalue()
                    record.update(transform="RGB palette 256, no dither, original size and alpha",
                                  psnrDb=round(psnr, 4), visibleRgbRms=round(error, 4))
    digest = hashlib.sha256(selected).hexdigest()
    file = "textures/" + digest[:24] + ".png"
    (OUT / file).write_bytes(selected)
    record.update(file=file, sha256=digest, bytes=len(selected))
    return {**texture, "file": file, "sha256": digest, "bytes": len(selected)}, record


with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(prepare, manifest["textures"]))
manifest["textures"] = [result[0] for result in results]
records = [result[1] for result in results]
unique = {record["file"]: record["bytes"] for record in records}
manifest["preparation"] = {"pillow": PIL.__version__, "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                           "originalRuntimePngBytes": sum(row["sourceBytes"] for row in records),
                           "uniquePngBytes": sum(unique.values()), "uniqueFiles": len(unique), "records": records}
(OUT / "runtime.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
(REPORT / "runtime-preparation.json").write_text(json.dumps(manifest["preparation"], ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"textures": len(records), "uniqueFiles": len(unique), "bytes": sum(unique.values()),
                  "rgbPaletteImages": sum(row["transform"].startswith("RGB") for row in records),
                  "allAlphaExact": all(row["alphaExact"] for row in records)}))
