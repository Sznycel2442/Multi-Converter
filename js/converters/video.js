/* ============================================================
   converters/video.js — konwersja wideo (FFmpeg.wasm)
   ============================================================ */
import { withExt } from "../files.js";
import { runFFmpeg } from "./ffmpeg-engine.js";
import { ICONS } from "../icons.js";

export default {
  id: "video",
  label: "Wideo",
  icon: ICONS.video,
  badge: "FFMPEG",
  description:
    "Konwersja wideo silnikiem FFmpeg.wasm. MKV/MOV mogą użyć remuxu (kopia strumieni = bezstratnie). Uwaga: kodowanie wideo w przeglądarce bywa wolne.",
  accept: ["mp4", "webm", "mkv", "mov", "avi", "m4v", "flv", "wmv", "gif"],
  defaultTarget: "mp4",
  heavy: true,
  needsIsolation: true,
  outputs: [
    { id: "mp4",  label: "MP4 (H.264)", ext: "mp4",  lossless: false, note: "Uniwersalny. CRF steruje jakością (niżej = lepiej)." },
    { id: "webm", label: "WEBM (VP9)",  ext: "webm", lossless: false, note: "Otwarty, dobra kompresja." },
    { id: "mkv",  label: "MKV (remux)", ext: "mkv",  lossless: true,  note: "Kopiuje strumienie bez rekompresji — bezstratne." },
    { id: "mov",  label: "MOV (remux)", ext: "mov",  lossless: true,  note: "Kopiuje strumienie — bezstratne (jeśli kodek pasuje)." },
    { id: "avi",  label: "AVI (MPEG-4)", ext: "avi", lossless: false, note: "Klasyczny kontener, kodek MPEG-4 + MP3." },
    { id: "gif",  label: "GIF",          ext: "gif",  lossless: false, note: "Animacja bez dźwięku, ograniczona paleta." },
    { id: "mp3",  label: "MP3 (tylko audio)", ext: "mp3", lossless: false, note: "Wyciąga ścieżkę dźwiękową z wideo." },
    { id: "wav",  label: "WAV (tylko audio)", ext: "wav", lossless: true, note: "Ścieżka dźwiękowa jako nieskompresowany PCM." },
  ],
  optionsSchema: [
    {
      id: "crf",
      type: "range",
      label: "Jakość (CRF)",
      min: 0, max: 40, step: 1, default: 20,
      format: (v) => `${v}${v <= 18 ? " (wysoka)" : v >= 30 ? " (niska)" : ""}`,
      showWhen: (t) => t === "mp4" || t === "webm",
    },
    {
      id: "fps",
      type: "select",
      label: "Klatki/s (GIF)",
      default: "12",
      choices: ["8", "12", "15", "24"],
      showWhen: (t) => t === "gif",
    },
  ],

  async convert(file, ctx) {
    const { target, options } = ctx;
    const out = withExt(file.name, target);
    const crf = String(options.crf ?? 20);
    const fps = options.fps || "12";

    const argMap = {
      mp4:  (i, o) => ["-i", i, "-c:v", "libx264", "-crf", crf, "-preset", "veryfast", "-c:a", "aac", "-b:a", "192k", o],
      webm: (i, o) => ["-i", i, "-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0", "-c:a", "libopus", o],
      mkv:  (i, o) => ["-i", i, "-c", "copy", o],
      mov:  (i, o) => ["-i", i, "-c", "copy", o],
      avi:  (i, o) => ["-i", i, "-c:v", "mpeg4", "-q:v", "5", "-c:a", "libmp3lame", "-b:a", "192k", o],
      gif:  (i, o) => ["-i", i, "-vf", `fps=${fps},scale=480:-1:flags=lanczos`, o],
      mp3:  (i, o) => ["-i", i, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", o],
      wav:  (i, o) => ["-i", i, "-vn", o],
    };
    const mime = {
      mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska",
      mov: "video/quicktime", avi: "video/x-msvideo", gif: "image/gif",
      mp3: "audio/mpeg", wav: "audio/wav",
    }[target];

    const blob = await runFFmpeg(file, argMap[target], out, { ...ctx, outMime: mime });
    return { blob, name: out };
  },
};
