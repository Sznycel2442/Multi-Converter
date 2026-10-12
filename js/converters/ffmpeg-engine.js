/* ============================================================
   ffmpeg-engine.js — współdzielony silnik FFmpeg.wasm (lazy-load)
   Ładowany z CDN dopiero przy pierwszej konwersji audio/wideo.
   Wymaga cross-origin isolation (nagłówki ustawia serve.py).
   ============================================================ */

const CORE_VER = "0.12.6";

// Paczki @ffmpeg/ffmpeg i @ffmpeg/util są zawendorowane lokalnie
// (js/vendor/) — ich wewnętrzny Worker musi być same-origin, inaczej
// przeglądarka rzuca SecurityError. Rdzeń (~30 MB) nadal z CDN,
// ładowany przez toBlobURL jako same-origin blob.
const FFMPEG_ESM = new URL("../vendor/ffmpeg/index.js", import.meta.url).href;
const UTIL_ESM = new URL("../vendor/ffmpeg-util/index.js", import.meta.url).href;
// Wariant ESM rdzenia — wewnętrzny Worker jest modułowy i robi
// `import(coreURL)`, co wymaga eksportu domyślnego (UMD go nie ma).
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VER}/dist/esm`;

let _instance = null;   // pojedyncza instancja FFmpeg
let _loading = null;    // promesa ładowania (żeby nie ładować podwójnie)
let _util = null;

/** Ładuje (raz) rdzeń FFmpeg.wasm. onStatus dostaje krótkie komunikaty. */
export async function loadFFmpeg(onStatus) {
  if (_instance) return _instance;
  if (_loading) return _loading;

  _loading = (async () => {
    if (!crossOriginIsolated) {
      throw new Error(
        "Brak cross-origin isolation. Uruchom stronę przez `python serve.py`, nie z pliku."
      );
    }
    onStatus?.("Pobieram silnik FFmpeg…");
    const [{ FFmpeg }, util] = await Promise.all([
      import(/* @vite-ignore */ FFMPEG_ESM),
      import(/* @vite-ignore */ UTIL_ESM),
    ]);
    _util = util;

    const ff = new FFmpeg();
    ff.on("log", ({ message }) => {
      if (message) onStatus?.(message);
    });

    onStatus?.("Ładuję rdzeń (~30 MB, jednorazowo)…");
    await ff.load({
      coreURL: await util.toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await util.toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });

    _instance = ff;
    onStatus?.("Silnik gotowy.");
    return ff;
  })();

  try {
    return await _loading;
  } finally {
    _loading = null;
  }
}

export function isFFmpegReady() {
  return !!_instance;
}

/**
 * Uruchamia jedną konwersję FFmpeg.
 * @param {File} file
 * @param {(inName:string, outName:string)=>string[]} buildArgs — buduje argumenty CLI
 * @param {string} outName — nazwa pliku wyjściowego w wirtualnym FS
 * @param {{onProgress?:Function, onStatus?:Function, outMime?:string}} ctx
 * @returns {Promise<Blob>}
 */
export async function runFFmpeg(file, buildArgs, outName, { onProgress, onStatus, outMime } = {}) {
  const ff = await loadFFmpeg(onStatus);
  const inName = "in_" + sanitize(file.name);

  const onProg = ({ progress }) => {
    if (progress >= 0 && progress <= 1) onProgress?.(progress);
  };
  ff.on("progress", onProg);

  try {
    await ff.writeFile(inName, await _util.fetchFile(file));
    const args = buildArgs(inName, outName);
    onStatus?.("ffmpeg " + args.join(" "));
    const code = await ff.exec(args);
    if (code !== 0) throw new Error("FFmpeg zakończył się kodem " + code);

    const data = await ff.readFile(outName);
    onProgress?.(1);
    return new Blob([data.buffer], { type: outMime || "application/octet-stream" });
  } finally {
    ff.off?.("progress", onProg);
    // Sprzątanie wirtualnego systemu plików.
    try { await ff.deleteFile(inName); } catch {}
    try { await ff.deleteFile(outName); } catch {}
  }
}

function sanitize(name) {
  return name.replace(/[^\w.\-]+/g, "_");
}
