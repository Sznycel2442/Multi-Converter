/* ============================================================
   converters/audio.js — konwersja audio (FFmpeg.wasm)
   ============================================================ */
import { withExt } from "../files.js";
import { runFFmpeg } from "./ffmpeg-engine.js";
import { ICONS } from "../icons.js";

export default {
  id: "audio",
  label: "Audio",
  icon: ICONS.music,
  badge: "FFMPEG",
  description:
    "Konwersja dźwięku silnikiem FFmpeg.wasm. WAV i FLAC są bezstratne; MP3/OGG/OPUS/AAC są stratne (sterowane bitrate).",
  accept: ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "wma", "aiff"],
  defaultTarget: "mp3",
  heavy: true,
  needsIsolation: true,
  outputs: [
    { id: "mp3",  label: "MP3",  ext: "mp3",  lossless: false, note: "Najbardziej uniwersalny. Stratny (bitrate)." },
    { id: "wav",  label: "WAV",  ext: "wav",  lossless: true,  note: "Nieskompresowany PCM — bezstratny, duży." },
    { id: "flac", label: "FLAC", ext: "flac", lossless: true,  note: "Skompresowany bezstratnie." },
    { id: "ogg",  label: "OGG (Vorbis)", ext: "ogg", lossless: false, note: "Otwarty, stratny." },
    { id: "opus", label: "OPUS", ext: "opus", lossless: false, note: "Najlepsza jakość przy niskim bitrate." },
    { id: "m4a",  label: "M4A (AAC)", ext: "m4a", lossless: false, note: "Stratny, dobra jakość." },
    { id: "aiff", label: "AIFF", ext: "aiff", lossless: true, note: "Nieskompresowany PCM (Apple) — bezstratny." },
  ],
  optionsSchema: [
    {
      id: "bitrate",
      type: "select",
      label: "Bitrate",
      default: "192k",
      choices: ["96k", "128k", "192k", "256k", "320k"],
      showWhen: (t) => ["mp3", "ogg", "opus", "m4a"].includes(t),
    },
  ],

  async convert(file, ctx) {
    const { target, options } = ctx;
    const out = withExt(file.name, target);
    const br = options.bitrate || "192k";

    const argMap = {
      mp3:  (i, o) => ["-i", i, "-c:a", "libmp3lame", "-b:a", br, o],
      wav:  (i, o) => ["-i", i, o],
      flac: (i, o) => ["-i", i, "-c:a", "flac", o],
      ogg:  (i, o) => ["-i", i, "-c:a", "libvorbis", "-b:a", br, o],
      opus: (i, o) => ["-i", i, "-c:a", "libopus", "-b:a", br, o],
      m4a:  (i, o) => ["-i", i, "-c:a", "aac", "-b:a", br, o],
      aiff: (i, o) => ["-i", i, "-c:a", "pcm_s16be", o],
    };
    const mime = {
      mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac",
      ogg: "audio/ogg", opus: "audio/opus", m4a: "audio/mp4",
      aiff: "audio/aiff",
    }[target];

    const blob = await runFFmpeg(file, argMap[target], out, { ...ctx, outMime: mime });
    return { blob, name: out };
  },
};
