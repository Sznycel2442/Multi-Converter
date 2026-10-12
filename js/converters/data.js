/* ============================================================
   converters/data.js — dane tabelaryczne/strukturalne
   Rdzeń offline: CSV ⇄ TSV ⇄ JSON (czysty JS).
   Biblioteki (leniwie z CDN): SheetJS (XLSX ⇄), js-yaml (YAML ⇄).
   ============================================================ */
import { withExt } from "../files.js";
import { ICONS } from "../icons.js";

const CDN = {
  xlsx: "https://esm.sh/xlsx@0.18.5",
  yaml: "https://esm.sh/js-yaml@4.1.0",
};
const _cache = new Map();
const lazy = (url) => {
  if (!_cache.has(url)) _cache.set(url, import(/* @vite-ignore */ url));
  return _cache.get(url);
};

/** Prosty, poprawny parser CSV/TSV (obsługuje cudzysłowy i znaki nowej linii w polach). */
function parseDelimited(text, delim) {
  const rows = [];
  let row = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === delim) { row.push(field); field = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = ""; i++; continue;
    }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function toObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

function escapeField(v, delim) {
  const s = v == null ? "" : String(v);
  return /["\n\r]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s;
}

function objectsToDelimited(objs, delim) {
  if (!objs.length) return "";
  const cols = [...objs.reduce((set, o) => { Object.keys(o).forEach((k) => set.add(k)); return set; }, new Set())];
  const lines = [cols.map((c) => escapeField(c, delim)).join(delim)];
  for (const o of objs) lines.push(cols.map((c) => escapeField(o[c], delim)).join(delim));
  return lines.join("\r\n");
}

/* ---------------- XLSX (SheetJS) ---------------- */
async function xlsxToObjects(file, onStatus) {
  onStatus?.("Czytam XLSX (SheetJS)…");
  const XLSX = await lazy(CDN.xlsx);
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

async function objectsToXlsx(objs, onStatus) {
  onStatus?.("Buduję XLSX (SheetJS)…");
  const XLSX = await lazy(CDN.xlsx);
  const ws = XLSX.utils.json_to_sheet(objs);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Arkusz1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ---------------- XML (własny generator) ---------------- */
const escapeXml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Nazwa elementu XML nie może zawierać dowolnych znaków — sanityzacja kluczy.
const xmlName = (k) => {
  const n = String(k).replace(/[^\w.\-]/g, "_");
  return /^[A-Za-z_]/.test(n) ? n : "_" + n;
};

function objectsToXml(objs) {
  const rows = objs.map((o) => {
    const cells = Object.entries(o)
      .map(([k, v]) => `    <${xmlName(k)}>${escapeXml(v)}</${xmlName(k)}>`)
      .join("\n");
    return `  <row>\n${cells}\n  </row>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${rows}\n</rows>\n`;
}

export default {
  id: "data",
  label: "Dane",
  icon: ICONS.database,
  badge: "OK",
  description:
    "Konwersja danych tabelarycznych i strukturalnych: CSV ⇄ TSV ⇄ JSON ⇄ XLSX ⇄ YAML, eksport do XML. Wszystko lokalnie.",
  accept: ["csv", "tsv", "json", "xlsx", "yaml", "yml"],
  defaultTarget: "json",
  outputs: [
    { id: "json", label: "JSON", ext: "json", lossless: true, note: "Tablica obiektów (nagłówki = klucze)." },
    { id: "csv",  label: "CSV",  ext: "csv",  lossless: true, note: "Przecinek jako separator, RFC 4180." },
    { id: "tsv",  label: "TSV",  ext: "tsv",  lossless: true, note: "Tabulator jako separator." },
    { id: "xlsx", label: "XLSX (Excel)", ext: "xlsx", lossless: true, note: "Arkusz Excel (SheetJS)." },
    { id: "yaml", label: "YAML", ext: "yaml", lossless: true, note: "Czytelny format konfiguracyjny (js-yaml)." },
    { id: "xml",  label: "XML",  ext: "xml",  lossless: true, note: "Wiersze jako elementy <row>." },
  ],
  optionsSchema: [
    { id: "pretty", type: "checkbox", label: "JSON z wcięciami", default: true, showWhen: (t) => t === "json" },
  ],

  async convert(file, { target, options, onStatus, onProgress }) {
    const ext = file.name.split(".").pop().toLowerCase();
    onProgress?.(0.15);

    // 1) Wczytaj do wspólnej reprezentacji: tablica obiektów.
    let objects;
    if (ext === "json") {
      const data = JSON.parse(await file.text());
      objects = Array.isArray(data) ? data : [data];
    } else if (ext === "xlsx") {
      objects = await xlsxToObjects(file, onStatus);
    } else if (ext === "yaml" || ext === "yml") {
      onStatus?.("Czytam YAML (js-yaml)…");
      const yaml = await lazy(CDN.yaml);
      const data = (yaml.load || yaml.default.load)(await file.text());
      objects = Array.isArray(data) ? data : [data];
    } else {
      objects = toObjects(parseDelimited(await file.text(), ext === "tsv" ? "\t" : ","));
    }
    onProgress?.(0.55);

    // 2) Zapisz w formacie docelowym.
    let blob;
    if (target === "json") {
      blob = new Blob([JSON.stringify(objects, null, options.pretty ? 2 : 0)],
        { type: "application/json" });
    } else if (target === "xlsx") {
      blob = await objectsToXlsx(objects, onStatus);
    } else if (target === "yaml") {
      onStatus?.("Buduję YAML (js-yaml)…");
      const yaml = await lazy(CDN.yaml);
      blob = new Blob([(yaml.dump || yaml.default.dump)(objects)], { type: "text/yaml" });
    } else if (target === "xml") {
      blob = new Blob([objectsToXml(objects)], { type: "application/xml" });
    } else {
      blob = new Blob([objectsToDelimited(objects, target === "tsv" ? "\t" : ",")],
        { type: "text/plain" });
    }

    onProgress?.(1);
    return { blob, name: withExt(file.name, target) };
  },
};
