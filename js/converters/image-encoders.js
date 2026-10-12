/* ============================================================
   image-encoders.js — enkodery formatów, których Canvas nie umie:
   BMP (24-bit, bezstratny), ICO (opakowany PNG), SVG (osadzony PNG),
   GIF89a (median-cut + LZW, 1-bit przezroczystość).
   Wszystko lokalnie, bez zależności z sieci.
   ============================================================ */

/* ---------------- BMP (24-bit, bez kompresji) ---------------- */
export function encodeBMP(imageData) {
  const { width, height, data } = imageData;
  const rowSize = ((24 * width + 31) >> 5) * 4;   // wiersz wyrównany do 4 bajtów
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const dv = new DataView(buf);

  dv.setUint8(0, 0x42); dv.setUint8(1, 0x4d);      // "BM"
  dv.setUint32(2, fileSize, true);
  dv.setUint32(10, 54, true);                       // offset pikseli
  dv.setUint32(14, 40, true);                       // BITMAPINFOHEADER
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true);                    // dodatnia = wiersze od dołu
  dv.setUint16(26, 1, true);                        // planes
  dv.setUint16(28, 24, true);                       // bpp
  dv.setUint32(34, pixelArraySize, true);
  dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true); // ~72 DPI

  let p = 54;
  const pad = rowSize - width * 3;
  for (let y = height - 1; y >= 0; y--) {           // BMP zapisuje od dołu
    let src = y * width * 4;
    for (let x = 0; x < width; x++) {
      dv.setUint8(p++, data[src + 2]);              // B
      dv.setUint8(p++, data[src + 1]);              // G
      dv.setUint8(p++, data[src]);                  // R
      src += 4;
    }
    for (let k = 0; k < pad; k++) dv.setUint8(p++, 0);
  }
  return new Blob([buf], { type: "image/bmp" });
}

/* ---------------- ICO (opakowany PNG) ---------------- */
export function buildICO(pngBytes, width, height) {
  const header = new ArrayBuffer(22);
  const dv = new DataView(header);
  dv.setUint16(0, 0, true);                         // reserved
  dv.setUint16(2, 1, true);                         // typ = ikona
  dv.setUint16(4, 1, true);                         // liczba obrazów
  dv.setUint8(6, width >= 256 ? 0 : width);         // 0 oznacza 256
  dv.setUint8(7, height >= 256 ? 0 : height);
  dv.setUint8(8, 0);                                // liczba kolorów
  dv.setUint8(9, 0);
  dv.setUint16(10, 1, true);                        // planes
  dv.setUint16(12, 32, true);                       // bpp
  dv.setUint32(14, pngBytes.length, true);          // rozmiar danych
  dv.setUint32(18, 22, true);                       // offset danych
  return new Blob([header, pngBytes], { type: "image/x-icon" });
}

/* ---------------- SVG (osadzony rastr) ---------------- */
export function buildSVG(pngDataUrl, width, height) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<image width="${width}" height="${height}" href="${pngDataUrl}"/></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

/* ============================================================
   GIF89a
   ============================================================ */
export function encodeGIF(imageData, { alphaThreshold = 128 } = {}) {
  const { width, height, data } = imageData;
  const { palette, indices, transparentIndex } = quantize(data, alphaThreshold);

  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const pushStr = (s) => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };
  const push16 = (v) => { bytes.push(v & 0xff, (v >> 8) & 0xff); };

  pushStr("GIF89a");
  push16(width); push16(height);
  push(0xf7, 0, 0);                                  // GCT 256, res 7 | bg 0 | aspect 0

  // Globalna tablica kolorów (256 * 3)
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || [0, 0, 0];
    push(c[0], c[1], c[2]);
  }

  // Graphic Control Extension (dla przezroczystości)
  if (transparentIndex >= 0) {
    push(0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, transparentIndex, 0x00);
  }

  // Image Descriptor
  push(0x2c); push16(0); push16(0); push16(width); push16(height); push(0x00);

  // Dane obrazu (LZW)
  const minCodeSize = 8;
  push(minCodeSize);
  const lzw = lzwEncode(indices, minCodeSize);
  for (let i = 0; i < lzw.length; i += 255) {
    const chunk = lzw.slice(i, i + 255);
    push(chunk.length);
    for (const b of chunk) push(b);
  }
  push(0x00);                                        // koniec danych
  push(0x3b);                                        // trailer

  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

/* --- kwantyzacja: median cut + mapowanie na najbliższy kolor --- */
function quantize(data, alphaThreshold) {
  let hasTransparent = false;
  const hist = new Map();                            // packedRGB -> count
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaThreshold) { hasTransparent = true; continue; }
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    hist.set(key, (hist.get(key) || 0) + 1);
  }

  const maxColors = hasTransparent ? 255 : 256;
  const colors = [];
  for (const [key, count] of hist) {
    colors.push({ r: (key >> 16) & 0xff, g: (key >> 8) & 0xff, b: key & 0xff, count });
  }

  const palette = colors.length <= maxColors
    ? colors.map((c) => [c.r, c.g, c.b])
    : medianCut(colors, maxColors);

  const realCount = palette.length;                  // realne kolory (bez dopełnienia)
  const transparentIndex = hasTransparent ? realCount : -1;
  const limit = transparentIndex >= 0 ? transparentIndex : realCount;
  while (palette.length < 256) palette.push([0, 0, 0]);

  // Mapowanie pikseli na indeksy (z cache).
  const cache = new Map();
  const indices = new Uint8Array(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    if (data[i + 3] < alphaThreshold) { indices[j] = transparentIndex; continue; }
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = nearest(palette, data[i], data[i + 1], data[i + 2], limit);
      cache.set(key, idx);
    }
    indices[j] = idx;
  }
  return { palette, indices, transparentIndex };
}

function nearest(palette, r, g, b, limit) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < limit; i++) {
    const p = palette[i];
    const dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
  }
  return best;
}

function medianCut(colors, max) {
  const box = (list) => {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (const c of list) {
      rmin = Math.min(rmin, c.r); rmax = Math.max(rmax, c.r);
      gmin = Math.min(gmin, c.g); gmax = Math.max(gmax, c.g);
      bmin = Math.min(bmin, c.b); bmax = Math.max(bmax, c.b);
    }
    return { list, ranges: [rmax - rmin, gmax - gmin, bmax - bmin] };
  };
  let boxes = [box(colors)];
  while (boxes.length < max) {
    // wybierz pudełko z największym zakresem i >1 kolorem
    let target = -1, biggest = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].list.length < 2) continue;
      const m = Math.max(...boxes[i].ranges);
      if (m > biggest) { biggest = m; target = i; }
    }
    if (target < 0) break;
    const b = boxes[target];
    const ch = b.ranges[0] >= b.ranges[1] && b.ranges[0] >= b.ranges[2] ? "r"
             : b.ranges[1] >= b.ranges[2] ? "g" : "b";
    b.list.sort((x, y) => x[ch] - y[ch]);
    const total = b.list.reduce((s, c) => s + c.count, 0);
    let acc = 0, split = 1;
    for (let i = 0; i < b.list.length; i++) {
      acc += b.list[i].count;
      if (acc >= total / 2) { split = Math.max(1, Math.min(i + 1, b.list.length - 1)); break; }
    }
    boxes.splice(target, 1, box(b.list.slice(0, split)), box(b.list.slice(split)));
  }
  return boxes.map((bx) => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const c of bx.list) { r += c.r * c.count; g += c.g * c.count; bl += c.b * c.count; n += c.count; }
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
}

/* --- LZW dla GIF --- */
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out = [];
  let cur = 0, curBits = 0, codeSize, next, dict;

  const write = (code) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) { out.push(cur & 0xff); cur >>= 8; curBits -= 8; }
  };
  const reset = () => { dict = new Map(); next = eoiCode + 1; codeSize = minCodeSize + 1; };

  reset();
  write(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    if (dict.has(key)) {
      prefix = dict.get(key);
    } else {
      write(prefix);
      // Kolejność jak w sprawdzonych enkoderach (omggif): najpierw
      // ewentualne poszerzenie kodu, potem przydzielenie nowego kodu.
      if (next === 4096) {
        write(clearCode);
        reset();
      } else {
        if (next >= (1 << codeSize) && codeSize < 12) codeSize++;
        dict.set(key, next++);
      }
      prefix = k;
    }
  }
  write(prefix);
  write(eoiCode);
  if (curBits > 0) out.push(cur & 0xff);
  return out;
}
