/* ============================================================
   files.js — narzędzia: formatowanie, pobieranie, generator ZIP
   ZIP budowany lokalnie (metoda "store"), bez zależności z sieci.
   ============================================================ */

export function formatBytes(n) {
  if (n === 0 || n == null) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function baseName(name) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/** Zamienia rozszerzenie w nazwie na nowe. */
export function withExt(name, ext) {
  return `${baseName(name)}.${ext}`;
}

/** Wymusza pobranie Bloba przez przeglądarkę. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------- CRC32 (dla ZIP) ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Buduje archiwum ZIP (metoda store — bez kompresji).
 * Media są już skompresowane, więc store jest szybkie i bezstratne.
 * @param {{name:string, blob:Blob}[]} entries
 * @returns {Promise<Blob>}
 */
export async function makeZip(entries) {
  const encoder = new TextEncoder();
  const files = [];

  for (const { name, blob } of entries) {
    const data = new Uint8Array(await blob.arrayBuffer());
    files.push({
      nameBytes: encoder.encode(name),
      data,
      crc: crc32(data),
      size: data.length,
    });
  }

  const chunks = [];
  const central = [];
  let offset = 0;

  const dosTime = 0, dosDate = 0x21; // stała, minimalna data

  for (const f of files) {
    // --- Local file header ---
    const lh = new Uint8Array(30 + f.nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);   // sygnatura
    lv.setUint16(4, 20, true);           // wersja
    lv.setUint16(6, 0x0800, true);       // flaga: UTF-8 nazwy
    lv.setUint16(8, 0, true);            // metoda: store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, f.crc, true);
    lv.setUint32(18, f.size, true);      // rozmiar skompresowany
    lv.setUint32(22, f.size, true);      // rozmiar nieskompresowany
    lv.setUint16(26, f.nameBytes.length, true);
    lv.setUint16(28, 0, true);           // pole extra
    lh.set(f.nameBytes, 30);

    chunks.push(lh, f.data);
    f.offset = offset;
    offset += lh.length + f.data.length;
  }

  for (const f of files) {
    const ch = new Uint8Array(46 + f.nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, f.crc, true);
    cv.setUint32(20, f.size, true);
    cv.setUint32(24, f.size, true);
    cv.setUint16(28, f.nameBytes.length, true);
    cv.setUint32(42, f.offset, true);
    ch.set(f.nameBytes, 46);
    central.push(ch);
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const centralOffset = offset;

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
