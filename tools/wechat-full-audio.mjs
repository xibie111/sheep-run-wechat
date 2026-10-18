/** Offline export of the reviewed first-party cue table and complete original music. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { sha256 } from "./wechat-full-inputs.mjs";

function wav(pcm, rate = 22050) {
  const data = Buffer.alloc(44 + pcm.length); data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(pcm.length, 40); pcm.copy(data, 44); return data;
}
export async function exportFullAudio(root, output) {
  await mkdir(resolve(output, "assets"), { recursive: true }); await mkdir(resolve(output, "music"), { recursive: true });
  const source = await readFile(resolve(root, "src/systems/AudioSystem.ts"), "utf8"), table = source.match(/const CUES:[^=]+=(\s*\{[\s\S]*?\n\});/);
  if (!table) throw Error("Review the changed original cue table before exporting audio");
  const cues = runInNewContext(`(${table[1]})`, Object.create(null), { timeout: 100 }), records = [];
  for (const [name, cue] of Object.entries(cues)) {
    if (!/^[A-Za-z]+$/.test(name) || !["sine", "triangle", "sawtooth"].includes(cue.wave)) throw Error("Unsupported original cue");
    const { frequency, duration } = cue, rate = 22050, count = Math.ceil(duration * rate), peak = cue.peakGain ?? .055, pcm = Buffer.alloc(count * 2);
    for (let i = 0; i < count; i++) {
      const time = i / rate; let cycles = frequency * time;
      for (let n = 0; n < (cue.notes?.length ?? 0); n++) { const note = cue.notes[n], previous = n ? cue.notes[n - 1].frequency : frequency; cycles += (note.frequency - previous) * Math.max(0, time - note.offsetSeconds); }
      const sine = Math.sin(2 * Math.PI * cycles), wave = cue.wave === "sine" ? sine : cue.wave === "triangle" ? 2 / Math.PI * Math.asin(sine) : 2 * (cycles - Math.floor(cycles + .5));
      pcm.writeInt16LE(Math.round(wave * peak * Math.pow(.0001 / peak, time / duration) * 32767), i * 2);
    }
    const bytes = wav(pcm), file = `assets/${name}.wav`; await writeFile(resolve(output, file), bytes);
    records.push({ file, source: "src/systems/AudioSystem.ts", sourceSha256: sha256(source), sha256: sha256(bytes), bytes: bytes.length, transform: "original cue pitch, notes, waveform and envelope to mono PCM16/22050" });
  }
  const music = await readFile(resolve(root, "assets/audio/pasture-morning-v1.wav"));
  if (music.toString("ascii", 0, 4) !== "RIFF" || music.toString("ascii", 8, 12) !== "WAVE") throw Error("Original music is not WAV");
  let format, samples;
  for (let offset = 12; offset + 8 <= music.length;) {
    const tag = music.toString("ascii", offset, offset + 4), length = music.readUInt32LE(offset + 4), start = offset + 8;
    if (tag === "fmt ") format = music.subarray(start, start + length);
    if (tag === "data") samples = music.subarray(start, start + length);
    offset = start + length + length % 2;
  }
  if (!format || !samples || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 2 || format.readUInt32LE(4) !== 22050 || format.readUInt16LE(14) !== 16 || samples.length % 4) throw Error("Review changed original music format");
  const mono = Buffer.alloc(samples.length / 2);
  for (let i = 0; i < samples.length; i += 4) mono.writeInt16LE(Math.floor((samples.readInt16LE(i) + samples.readInt16LE(i + 2)) / 2), i / 2);
  const bytes = wav(mono), file = "music/pasture-morning.wav"; await writeFile(resolve(output, file), bytes);
  await writeFile(resolve(output, "music/game.js"), "// Music-only subpackage; no loop or listeners.\n");
  records.push({ file, source: "assets/audio/pasture-morning-v1.wav", sourceSha256: sha256(music), sha256: sha256(bytes), bytes: bytes.length, transform: "complete original loop, stereo average to mono PCM16/22050; no trim", seconds: mono.length / 2 / 22050 });
  return records;
}
