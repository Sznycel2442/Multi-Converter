/* ============================================================
   converters/docs.js — dokumenty
   Rdzeń offline: TXT ⇄ MD ⇄ HTML.
   Biblioteki (leniwie z CDN): jsPDF (→PDF), mammoth (DOCX→…),
   pdf.js (PDF→tekst).
   ============================================================ */
import { withExt } from "../files.js";
import { ICONS } from "../icons.js";

const CDN = {
  marked: "https://esm.sh/marked@12",
  turndown: "https://esm.sh/turndown@7",
  jspdf: "https://esm.sh/jspdf@2.5.2",
  mammoth: "https://esm.sh/mammoth@1.7.0",
  pdfjs: "https://esm.sh/pdfjs-dist@4.0.379",
  pdfjsWorker: "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs",
  docx: "https://esm.sh/docx@8.5.0",
};

const _cache = new Map();
const lazy = (url) => {
  if (!_cache.has(url)) _cache.set(url, import(/* @vite-ignore */ url));
  return _cache.get(url);
};

async function toBlobURL(url, type) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Nie pobrano " + url);
  const blob = new Blob([await res.arrayBuffer()], { type });
  return URL.createObjectURL(blob);
}

/* ---------------- helpery tekst/HTML ---------------- */
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

function textToHtml(text) {
  const body = text.split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return wrapHtml(body);
}

function wrapHtml(body) {
  return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8">
<style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.6}</style>
</head><body>
${body}
</body></html>`;
}

async function mdToHtml(md) {
  const { marked } = await lazy(CDN.marked);
  return wrapHtml(marked.parse(md));
}
async function htmlToMarkdown(html) {
  const mod = await lazy(CDN.turndown);
  const Turndown = mod.default || mod;
  return new Turndown({ headingStyle: "atx", codeBlockStyle: "fenced" }).turndown(html);
}

/* ---------------- wejścia przez biblioteki ---------------- */
async function docxToHtml(file, onStatus) {
  onStatus?.("Czytam DOCX (mammoth)…");
  const mod = await lazy(CDN.mammoth);
  const mammoth = mod.default || mod;
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return wrapHtml(value);
}

async function pdfToText(file, onStatus) {
  onStatus?.("Czytam PDF (pdf.js)…");
  const pdfjs = await lazy(CDN.pdfjs);
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = await toBlobURL(CDN.pdfjsWorker, "text/javascript");
  }
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    out += content.items.map((it) => it.str).join(" ") + "\n\n";
  }
  return out.trim();
}

/* ---------------- wyjście PDF (jsPDF) ---------------- */
async function textToPdf(text, onStatus) {
  onStatus?.("Składam PDF (jsPDF)…");
  const mod = await lazy(CDN.jspdf);
  const JsPDF = mod.jsPDF || mod.default?.jsPDF || mod.default;
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica"); doc.setFontSize(11);
  const lines = doc.splitTextToSize(text || " ", pageW - 2 * margin);
  let y = margin;
  for (const line of lines) {
    if (y > pageH - margin) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 15;
  }
  return doc.output("blob");
}

/* ---------------- wyjście DOCX (biblioteka docx) ---------------- */
async function textToDocx(text, onStatus) {
  onStatus?.("Składam DOCX…");
  const mod = await lazy(CDN.docx);
  const { Document, Packer, Paragraph } = mod.default?.Document ? mod.default : mod;
  const paragraphs = (text || " ").split(/\n/).map((line) => new Paragraph({ text: line }));
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}

/* ---------------- wyjście RTF (własny generator) ---------------- */
function textToRtf(text) {
  // RTF przyjmuje tylko ASCII — pozostałe znaki jako \uN? (unicode escape).
  const escaped = (text || "").replace(/[\\{}]|[^\x00-\x7f]/g, (ch) => {
    if (ch === "\\" || ch === "{" || ch === "}") return "\\" + ch;
    let code = ch.charCodeAt(0);
    if (code > 32767) code -= 65536; // RTF używa 16-bit signed
    return `\\u${code}?`;
  }).replace(/\r\n|\r|\n/g, "\\par\n");
  const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs22\n${escaped}\n}`;
  return new Blob([rtf], { type: "application/rtf" });
}

/* ---------------- ładowanie do modelu pośredniego ---------------- */
async function loadDoc(file, ext, onStatus) {
  if (ext === "txt") return { kind: "text", text: await file.text() };
  if (ext === "md")  return { kind: "md",   md: await file.text() };
  if (ext === "html" || ext === "htm") return { kind: "html", html: await file.text() };
  if (ext === "docx") return { kind: "html", html: await docxToHtml(file, onStatus) };
  if (ext === "pdf")  return { kind: "text", text: await pdfToText(file, onStatus) };
  throw new Error("Nieobsługiwane wejście: " + ext);
}

/** Wspólny "spłaszczony" tekst niezależnie od źródła. */
async function asText(m) {
  if (m.kind === "text") return m.text;
  if (m.kind === "md") return htmlToText(await mdToHtml(m.md));
  return htmlToText(m.html);
}

export default {
  id: "docs",
  label: "Dokumenty",
  icon: ICONS.fileText,
  badge: "BETA",
  description:
    "Dokumenty: TXT ⇄ MD ⇄ HTML (lokalnie), eksport do PDF, DOCX i RTF, wczytywanie DOCX i PDF. " +
    "Uwaga: PDF używa czcionek standardowych (ograniczone polskie znaki); DOCX/PDF to ścieżki biblioteczne.",
  accept: ["txt", "md", "html", "htm", "docx", "pdf"],
  defaultTarget: "html",
  outputs: [
    { id: "txt",  label: "TXT",  ext: "txt",  lossless: false, note: "Czysty tekst (bez formatowania)." },
    { id: "md",   label: "Markdown", ext: "md", lossless: false, note: "Tekst ze znacznikami Markdown." },
    { id: "html", label: "HTML", ext: "html", lossless: false, note: "Dokument HTML z prostym stylem." },
    { id: "pdf",  label: "PDF",  ext: "pdf",  lossless: false, note: "PDF tekstowy (jsPDF, czcionki standardowe)." },
    { id: "docx", label: "DOCX (Word)", ext: "docx", lossless: false, note: "Dokument Word z tekstem (bez formatowania)." },
    { id: "rtf",  label: "RTF",  ext: "rtf",  lossless: false, note: "Rich Text Format — otwiera każdy edytor." },
  ],

  async convert(file, { target, onStatus, onProgress }) {
    const ext = file.name.split(".").pop().toLowerCase();
    onProgress?.(0.2);
    const m = await loadDoc(file, ext, onStatus);
    onProgress?.(0.55);

    let data, mime;
    if (target === "txt") {
      data = await asText(m); mime = "text/plain";
    } else if (target === "md") {
      data = m.kind === "md" ? m.md
           : m.kind === "html" ? await htmlToMarkdown(m.html)
           : m.text;                                   // czysty tekst jest poprawnym MD
      mime = "text/markdown";
    } else if (target === "html") {
      data = m.kind === "html" ? m.html
           : m.kind === "md" ? await mdToHtml(m.md)
           : textToHtml(m.text);
      mime = "text/html";
    } else if (target === "pdf") {
      const blob = await textToPdf(await asText(m), onStatus);
      onProgress?.(1);
      return { blob, name: withExt(file.name, "pdf") };
    } else if (target === "docx") {
      const blob = await textToDocx(await asText(m), onStatus);
      onProgress?.(1);
      return { blob, name: withExt(file.name, "docx") };
    } else if (target === "rtf") {
      const blob = textToRtf(await asText(m));
      onProgress?.(1);
      return { blob, name: withExt(file.name, "rtf") };
    } else {
      throw new Error("Nieobsługiwane wyjście: " + target);
    }

    onProgress?.(1);
    return { blob: new Blob([data], { type: mime }), name: withExt(file.name, target) };
  },
};
