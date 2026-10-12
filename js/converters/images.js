/* ============================================================
   converters/images.js — konwersja obrazów rastrowych
   Dekodowanie: PNG, JPG, WEBP, GIF, BMP, AVIF, SVG (zależnie od przeglądarki)
                + HEIC/HEIF (biblioteka heic2any, leniwie z CDN)
   Kodowanie:   PNG, WEBP, JPEG (Canvas) + GIF, BMP, ICO, SVG (własne enkodery)
                + PDF (jsPDF, leniwie z CDN)
   ============================================================ */
import { withExt } from "../files.js";
import { encodeBMP, buildICO, buildSVG, encodeGIF } from "./image-encoders.js";
import { ICONS } from "../icons.js";

const CANVAS_MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const CDN = {
  heic2any: "https://esm.sh/heic2any@0.0.4",
  jspdf: "https://esm.sh/jspdf@2.5.2",
};
const _cache = new Map();
const lazy = (url) => {
  if (!_cache.has(url)) _cache.set(url, import(/* @vite-ignore */ url));
  return _cache.get(url);
};

/** HEIC/HEIF → Blob PNG (dekodowanie biblioteką WASM). */
async function heicToPng(file, onStatus) {
  onStatus?.("Dekoduję HEIC (heic2any)…");
  const mod = await lazy(CDN.heic2any);
  const heic2any = mod.default || mod;
  const out = await heic2any({ blob: file, toType: "image/png" });
  return Array.isArray(out) ? out[0] : out;
}

/** Dekoduje plik graficzny do rysowalnego źródła (bitmapa lub <img>). */
async function decode(blob) {
  if ("createImageBitmap" in window) {
    try {
      return { src: await createImageBitmap(blob), cleanup: (b) => b.close?.() };
    } catch { /* np. SVG w części przeglądarek — fallback niżej */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("Nie udało się zdekodować obrazu"));
      img.src = url;
    });
    return { src: img, cleanup: () => {}, _url: url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Przeglądarka nie umie zapisać tego formatu`))),
      mime,
      quality
    );
  });
}

/** Obraz (canvas) → jednostronicowy PDF dopasowany do wymiarów obrazu. */
async function canvasToPdf(canvas, onStatus) {
  onStatus?.("Składam PDF (jsPDF)…");
  const mod = await lazy(CDN.jspdf);
  const JsPDF = mod.jsPDF || mod.default?.jsPDF || mod.default;
  const w = canvas.width, h = canvas.height;
  const doc = new JsPDF({
    unit: "pt",
    format: [w * 0.75, h * 0.75], // 1 px = 0.75 pt (96 dpi → 72 dpi)
    orientation: w >= h ? "landscape" : "portrait",
  });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  doc.addImage(dataUrl, "JPEG", 0, 0, w * 0.75, h * 0.75);
  return doc.output("blob");
}

export default {
  id: "images",
  label: "Obrazy",
  icon: ICONS.image,
  badge: "OK",
  description:
    "Konwersja obrazów w przeglądarce. Wejście: PNG, JPG, WEBP, GIF, BMP, AVIF, SVG, HEIC. " +
    "Wyjście: PNG, WEBP, JPEG, GIF, BMP, ICO, SVG, PDF.",
  accept: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg", "heic", "heif"],
  defaultTarget: "png",
  outputs: [
    { id: "png",  label: "PNG",  ext: "png",  lossless: true,  note: "Bezstratny, z przezroczystością." },
    { id: "webp", label: "WEBP", ext: "webp", lossless: false, note: "Nowoczesny, mały. Kodowanie przez Canvas jest stratne." },
    { id: "jpg",  label: "JPEG", ext: "jpg",  lossless: false, note: "Stratny, do zdjęć. Bez przezroczystości." },
    { id: "gif",  label: "GIF",  ext: "gif",  lossless: false, note: "Maks. 256 kolorów (kwantyzacja), 1-bit przezroczystość." },
    { id: "bmp",  label: "BMP",  ext: "bmp",  lossless: true,  note: "Nieskompresowany 24-bit RGB (bez alfy)." },
    { id: "ico",  label: "ICO",  ext: "ico",  lossless: true,  note: "Ikona (opakowany PNG). Skalowane do maks. 256 px." },
    { id: "svg",  label: "SVG",  ext: "svg",  lossless: true,  note: "Kontener SVG z osadzonym PNG (nie wektoryzuje)." },
    { id: "pdf",  label: "PDF",  ext: "pdf",  lossless: false, note: "Jednostronicowy PDF z obrazem (jsPDF)." },
  ],
  optionsSchema: [
    {
      id: "quality", type: "range", label: "Jakość",
      min: 1, max: 100, step: 1, default: 92, format: (v) => `${v}%`,
      showWhen: (t) => t === "jpg" || t === "webp",
    },
    {
      id: "scale", type: "select", label: "Skalowanie",
      default: "100%", choices: ["100%", "75%", "50%", "25%"],
    },
    {
      id: "bg", type: "color", label: "Tło (bez alfy)", default: "#ffffff",
      showWhen: (t) => t === "jpg" || t === "bmp" || t === "pdf",
    },
  ],

  async convert(file, { target, options, onProgress, onStatus }) {
    onProgress?.(0.1);
    const ext = file.name.split(".").pop().toLowerCase();
    const source = (ext === "heic" || ext === "heif")
      ? await heicToPng(file, onStatus)
      : file;
    const { src, cleanup, _url } = await decode(source);
    try {
      const scale = parseInt(options.scale || "100", 10) / 100;
      const sw = src.width || src.naturalWidth;
      const sh = src.height || src.naturalHeight;
      if (!sw || !sh) throw new Error("Zerowe wymiary obrazu");
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");

      // Formaty bez alfy: podłóż tło.
      if (target === "jpg" || target === "bmp" || target === "pdf") {
        ctx.fillStyle = options.bg || "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(src, 0, 0, w, h);
      onProgress?.(0.5);

      const quality = (options.quality ?? 92) / 100;
      let blob;

      if (target in CANVAS_MIME) {
        blob = await canvasToBlob(canvas, CANVAS_MIME[target], target === "png" ? undefined : quality);
      } else if (target === "bmp") {
        blob = encodeBMP(ctx.getImageData(0, 0, w, h));
      } else if (target === "gif") {
        blob = encodeGIF(ctx.getImageData(0, 0, w, h));
      } else if (target === "svg") {
        const dataUrl = canvas.toDataURL("image/png");
        blob = buildSVG(dataUrl, w, h);
      } else if (target === "pdf") {
        blob = await canvasToPdf(canvas, onStatus);
      } else if (target === "ico") {
        // ICO wymaga <=256 px — przeskaluj, zachowując proporcje.
        const s = Math.min(1, 256 / Math.max(w, h));
        const iw = Math.max(1, Math.round(w * s));
        const ih = Math.max(1, Math.round(h * s));
        const ic = document.createElement("canvas");
        ic.width = iw; ic.height = ih;
        ic.getContext("2d").drawImage(canvas, 0, 0, iw, ih);
        const pngBlob = await canvasToBlob(ic, "image/png");
        blob = buildICO(new Uint8Array(await pngBlob.arrayBuffer()), iw, ih);
      } else {
        throw new Error("Nieobsługiwany format: " + target);
      }

      onProgress?.(1);
      return { blob, name: withExt(file.name, target) };
    } finally {
      cleanup?.(src);
      if (_url) URL.revokeObjectURL(_url);
    }
  },
};
