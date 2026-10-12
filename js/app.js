/* ============================================================
   app.js — rdzeń aplikacji: UI, stan, sterowanie konwersją
   ============================================================ */
import { SECTIONS, getSection } from "./registry.js";
import { formatBytes, extOf, downloadBlob, makeZip } from "./files.js";
import {
  addHistoryEntry, getHistory, removeHistoryEntry,
  clearHistory, historyCount, isPersistent,
} from "./history.js";
import { ICONS } from "./icons.js";

/* ---------------- Stan ---------------- */
const state = {
  view: "convert",  // "convert" | "history"
  sectionId: SECTIONS[0].id,
  files: [],        // { id, file, thumbUrl }
  results: [],      // { id, name, blob, size }
  optionValues: {}, // { [optionId]: value }
  running: false,
};
let _uid = 0;
const uid = () => "f" + ++_uid;

/* ---------------- Popularne konwersje (skróty) ---------------- */
const POPULAR = [
  { from: "MP4",  to: "MP3",  section: "video",  target: "mp3"  },
  { from: "MP4",  to: "GIF",  section: "video",  target: "gif"  },
  { from: "MOV",  to: "MP4",  section: "video",  target: "mp4"  },
  { from: "WAV",  to: "MP3",  section: "audio",  target: "mp3"  },
  { from: "M4A",  to: "MP3",  section: "audio",  target: "mp3"  },
  { from: "MP3",  to: "WAV",  section: "audio",  target: "wav"  },
  { from: "PNG",  to: "JPG",  section: "images", target: "jpg"  },
  { from: "JPG",  to: "PNG",  section: "images", target: "png"  },
  { from: "HEIC", to: "JPG",  section: "images", target: "jpg"  },
  { from: "WEBP", to: "PNG",  section: "images", target: "png"  },
  { from: "JPG",  to: "PDF",  section: "images", target: "pdf"  },
  { from: "PNG",  to: "ICO",  section: "images", target: "ico"  },
  { from: "PDF",  to: "TXT",  section: "docs",   target: "txt"  },
  { from: "DOCX", to: "PDF",  section: "docs",   target: "pdf"  },
  { from: "MD",   to: "HTML", section: "docs",   target: "html" },
  { from: "CSV",  to: "XLSX", section: "data",   target: "xlsx" },
];

/* ---------------- Skróty do DOM ---------------- */
const $ = (sel) => document.querySelector(sel);
const els = {
  nav: $("#section-nav"),
  converterView: $("#converter-view"),
  historyView: $("#history-view"),
  title: $("#section-title"),
  desc: $("#section-desc"),
  dropzone: $("#dropzone"),
  fileInput: $("#file-input"),
  dzHint: $("#dropzone-hint"),
  filesPanel: $("#files-panel"),
  fileList: $("#file-list"),
  filesCount: $("#files-count"),
  clearFiles: $("#clear-files"),
  controlsPanel: $("#controls-panel"),
  targetSelect: $("#target-format"),
  optionsSlot: $("#options-slot"),
  qualityNote: $("#quality-note"),
  convertBtn: $("#convert-btn"),
  resultsPanel: $("#results-panel"),
  resultsList: $("#results-list"),
  resultsCount: $("#results-count"),
  downloadZip: $("#download-zip"),
  popularGrid: $("#popular-grid"),
  historyList: $("#history-list"),
  historyCount: $("#history-count"),
  historyEmpty: $("#history-empty"),
  historyZip: $("#history-zip"),
  historyClear: $("#history-clear"),
  toastStack: $("#toast-stack"),
};

/* ---------------- Pomocnicze ---------------- */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function toast(msg, kind = "info", title = "") {
  const t = el("div", `toast toast--${kind}`);
  if (title) t.appendChild(el("div", "toast__title", title));
  t.appendChild(el("div", null, msg));
  els.toastStack.appendChild(t);
  setTimeout(() => {
    t.classList.add("is-leaving");
    setTimeout(() => t.remove(), 250);
  }, kind === "err" ? 6000 : 3500);
}

/** Nadaje elementom listy opóźnienie animacji (efekt kaskady). */
function stagger(listEl) {
  [...listEl.children].forEach((c, i) => {
    c.style.animationDelay = Math.min(i * 40, 400) + "ms";
  });
}

const currentSection = () => getSection(state.sectionId);

/* ---------------- Nawigacja / sekcje ---------------- */
function renderNav() {
  els.nav.innerHTML = "";
  for (const s of SECTIONS) {
    const b = el("button", "nav-item");
    b.dataset.id = s.id;
    if (state.view === "convert" && s.id === state.sectionId) b.classList.add("is-active");
    b.appendChild(el("span", "nav-item__icon", s.icon));
    b.appendChild(el("span", "nav-item__label", s.label));
    if (s.badge) b.appendChild(el("span", "nav-item__badge", s.badge));
    b.addEventListener("click", () => selectSection(s.id));
    els.nav.appendChild(b);
  }

  els.nav.appendChild(el("div", "sidebar__divider"));

  // Zakładka Historia
  const h = el("button", "nav-item nav-item--history");
  if (state.view === "history") h.classList.add("is-active");
  h.appendChild(el("span", "nav-item__icon", ICONS.history));
  h.appendChild(el("span", "nav-item__label", "Historia"));
  const badge = el("span", "nav-item__badge");
  badge.id = "nav-history-badge";
  badge.textContent = "0";
  h.appendChild(badge);
  h.addEventListener("click", showHistory);
  els.nav.appendChild(h);

  const foot = el("div", "sidebar__foot",
    "100% lokalnie.<br>Pliki nie opuszczają<br>Twojej przeglądarki.");
  els.nav.appendChild(foot);

  refreshHistoryBadge();
}

async function refreshHistoryBadge() {
  const b = document.getElementById("nav-history-badge");
  if (!b) return;
  try { b.textContent = String(await historyCount()); } catch { b.textContent = "0"; }
  bump(b);
}

function selectSection(id) {
  if (state.running) { toast("Poczekaj na zakończenie konwersji.", "info"); return; }
  state.view = "convert";
  state.sectionId = id;
  els.converterView.hidden = false;
  els.historyView.hidden = true;
  clearFiles();
  clearResults();
  renderNav();
  const s = currentSection();
  els.title.textContent = s.label;
  els.desc.textContent = s.description || "";
  els.dzHint.textContent = "Obsługiwane: " + (s.accept || []).map((x) => x.toUpperCase()).join(", ");

  if (s.soon) {
    els.dropzone.style.display = "none";
    showSoon(s);
  } else {
    els.dropzone.style.display = "";
    hideSoon();
    state.optionValues = defaultOptions(s);
    renderTargetSelect();
  }
  syncPanels();
  replayEnterAnimation(els.converterView);
}

/** Restartuje animację wejścia widoku. */
function replayEnterAnimation(view) {
  view.classList.remove("view-enter");
  void view.offsetWidth; // wymuszenie reflow
  view.classList.add("view-enter");
}

/** Krótki "pop" na elemencie — używane przy licznikach i statusach. */
function bump(elm) {
  if (!elm) return;
  elm.classList.remove("bump");
  void elm.offsetWidth; // wymuszenie reflow
  elm.classList.add("bump");
}

function showSoon(s) {
  hideSoon();
  const box = el("div", "soon", `Sekcja <b>${s.label}</b> — <b>wkrótce</b>.<br>` +
    `Planowane formaty: ${(s.accept || []).map((x) => x.toUpperCase()).join(", ")}.`);
  box.id = "soon-box";
  els.dropzone.after(box);
}
function hideSoon() { document.getElementById("soon-box")?.remove(); }

/* ---------------- Popularne konwersje ---------------- */
function renderPopular() {
  els.popularGrid.innerHTML = "";
  for (const p of POPULAR) {
    const s = getSection(p.section);
    if (!s || !s.outputs.some((o) => o.id === p.target)) continue;
    const card = el("button", "pop-card");
    card.appendChild(el("span", "pop-card__from", p.from));
    card.appendChild(el("span", "pop-card__arrow", "→"));
    card.appendChild(el("span", "pop-card__to", p.to));
    card.title = `${s.label}: ${p.from} → ${p.to}`;
    card.addEventListener("click", () => applyPopular(p));
    els.popularGrid.appendChild(card);
  }
  stagger(els.popularGrid);
}

function applyPopular(p) {
  if (state.running) { toast("Poczekaj na zakończenie konwersji.", "info"); return; }
  selectSection(p.section);
  if ([...els.targetSelect.options].some((o) => o.value === p.target)) {
    els.targetSelect.value = p.target;
    renderOptions();
    renderQualityNote();
  }
  els.dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
  els.dropzone.classList.remove("is-flash");
  void els.dropzone.offsetWidth;
  els.dropzone.classList.add("is-flash");
}

/* ---------------- Pliki wejściowe ---------------- */
function addFiles(fileList) {
  const s = currentSection();
  const accept = s.accept || [];
  let added = 0, skipped = 0;
  for (const file of fileList) {
    const ext = extOf(file.name);
    if (accept.length && !accept.includes(ext)) { skipped++; continue; }
    const entry = { id: uid(), file, thumbUrl: null };
    if (file.type.startsWith("image/")) entry.thumbUrl = URL.createObjectURL(file);
    state.files.push(entry);
    added++;
  }
  if (added) toast(`Dodano ${added} plik(ów).`, "ok", "Upload");
  if (skipped) toast(`Pominięto ${skipped} plik(ów) o nieobsługiwanym formacie.`, "err", "Uwaga");
  renderFileList();
  syncPanels();
}

function removeFile(id) {
  const i = state.files.findIndex((f) => f.id === id);
  if (i >= 0) {
    if (state.files[i].thumbUrl) URL.revokeObjectURL(state.files[i].thumbUrl);
    state.files.splice(i, 1);
  }
  renderFileList();
  syncPanels();
}

function clearFiles() {
  state.files.forEach((f) => f.thumbUrl && URL.revokeObjectURL(f.thumbUrl));
  state.files = [];
  renderFileList();
}

function renderFileList() {
  els.fileList.innerHTML = "";
  els.filesCount.textContent = state.files.length;
  bump(els.filesCount);
  for (const f of state.files) {
    const row = el("li", "file-row");
    row.dataset.id = f.id;

    const thumb = el("div", "file-thumb");
    if (f.thumbUrl) {
      const img = el("img");
      img.src = f.thumbUrl;
      img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "cover";
      thumb.appendChild(img);
    } else {
      thumb.textContent = extOf(f.file.name).toUpperCase() || "?";
    }
    row.appendChild(thumb);

    const info = el("div", "file-info");
    info.appendChild(el("div", "file-name", f.file.name));
    info.appendChild(el("div", "file-meta", formatBytes(f.file.size)));
    row.appendChild(info);

    row.appendChild(el("div", "file-status", ""));

    const rm = el("button", "icon-btn", "✕");
    rm.title = "Usuń";
    rm.addEventListener("click", () => removeFile(f.id));
    row.appendChild(rm);

    els.fileList.appendChild(row);
  }
  stagger(els.fileList);
}

/* ---------------- Format wyjściowy + opcje ---------------- */
function defaultOptions(s) {
  const o = {};
  for (const opt of s.optionsSchema || []) o[opt.id] = opt.default;
  return o;
}

function renderTargetSelect() {
  const s = currentSection();
  els.targetSelect.innerHTML = "";
  for (const out of s.outputs) {
    const o = el("option");
    o.value = out.id;
    o.textContent = out.label + (out.lossless ? "  · bezstratny" : "");
    els.targetSelect.appendChild(o);
  }
  els.targetSelect.value = s.defaultTarget || s.outputs[0].id;
  els.targetSelect.onchange = () => { renderOptions(); renderQualityNote(); };
  renderOptions();
  renderQualityNote();
}

function renderOptions() {
  const s = currentSection();
  const target = els.targetSelect.value;
  els.optionsSlot.innerHTML = "";
  for (const opt of s.optionsSchema || []) {
    if (opt.showWhen && !opt.showWhen(target)) continue;
    els.optionsSlot.appendChild(buildControl(opt));
  }
}

function buildControl(opt) {
  const wrap = el("label", "field");
  const labelRow = el("span", "field__label");
  labelRow.textContent = opt.label;
  wrap.appendChild(labelRow);

  const val = state.optionValues[opt.id] ?? opt.default;

  if (opt.type === "range") {
    const valSpan = el("span");
    valSpan.style.color = "var(--acid)";
    valSpan.textContent = " " + (opt.format ? opt.format(val) : val);
    labelRow.appendChild(valSpan);
    const input = el("input");
    input.type = "range";
    input.min = opt.min; input.max = opt.max; input.step = opt.step; input.value = val;
    input.addEventListener("input", () => {
      state.optionValues[opt.id] = Number(input.value);
      valSpan.textContent = " " + (opt.format ? opt.format(Number(input.value)) : input.value);
    });
    wrap.appendChild(input);
  } else if (opt.type === "select") {
    const sel = el("select", "select");
    for (const c of opt.choices) {
      const o = el("option"); o.value = c; o.textContent = c; sel.appendChild(o);
    }
    sel.value = val;
    sel.addEventListener("change", () => { state.optionValues[opt.id] = sel.value; });
    wrap.appendChild(sel);
  } else if (opt.type === "color") {
    const input = el("input");
    input.type = "color"; input.value = val;
    input.style.width = "48px"; input.style.height = "34px";
    input.style.background = "var(--bg-2)"; input.style.border = "1px solid var(--border-2)";
    input.style.borderRadius = "3px"; input.style.cursor = "pointer";
    input.addEventListener("input", () => { state.optionValues[opt.id] = input.value; });
    wrap.appendChild(input);
  } else if (opt.type === "checkbox") {
    const input = el("input");
    input.type = "checkbox"; input.checked = !!val;
    input.style.width = "18px"; input.style.height = "18px"; input.style.accentColor = "var(--acid)";
    input.addEventListener("change", () => { state.optionValues[opt.id] = input.checked; });
    const row = el("div"); row.style.display = "flex"; row.style.alignItems = "center"; row.style.height = "34px";
    row.appendChild(input);
    wrap.appendChild(row);
  }
  return wrap;
}

function renderQualityNote() {
  const s = currentSection();
  const out = s.outputs.find((o) => o.id === els.targetSelect.value);
  if (!out) { els.qualityNote.textContent = ""; return; }
  const tag = out.lossless
    ? "<b>BEZSTRATNY</b>"
    : "<b style='color:var(--warn)'>STRATNY</b>";
  els.qualityNote.innerHTML = `${tag} · ${out.note || ""}`;
}

/* ---------------- Konwersja ---------------- */
async function runConversion() {
  if (state.running || !state.files.length) return;
  const s = currentSection();
  const target = els.targetSelect.value;
  const outMeta = s.outputs.find((o) => o.id === target);

  state.running = true;
  els.convertBtn.disabled = true;
  els.convertBtn.classList.add("is-working");
  els.convertBtn.querySelector(".btn__label").textContent = "Pracuję…";
  clearResults();

  if (s.needsIsolation && !window.crossOriginIsolated) {
    toast("Brak cross-origin isolation — uruchom przez `python serve.py`.", "err", "Silnik");
  }
  if (s.heavy) {
    const what = s.needsIsolation ? "silnik FFmpeg (~30 MB)" : "potrzebne biblioteki";
    toast(`Pierwsza konwersja pobiera ${what}.`, "info", "Ładowanie");
  }

  let ok = 0, fail = 0;
  for (const entry of state.files) {
    const row = els.fileList.querySelector(`[data-id="${entry.id}"]`);
    const statusEl = row?.querySelector(".file-status");
    setStatus(statusEl, "run", "…");
    const bar = ensureProgressBar(row);

    try {
      const { blob, name } = await s.convert(entry.file, {
        target,
        options: { ...state.optionValues },
        onProgress: (p) => { if (bar) bar.style.width = Math.round(p * 100) + "%"; },
        onStatus: (m) => { if (statusEl) statusEl.textContent = shortStatus(m); },
      });
      state.results.push({ id: uid(), name, blob, size: blob.size });
      setStatus(statusEl, "ok", "GOTOWE");
      if (bar) bar.style.width = "100%";
      ok++;

      // Zapis do trwałej historii (nie blokuje konwersji przy błędzie).
      try {
        await addHistoryEntry({
          name, size: blob.size, blob,
          section: s.id, target, createdAt: Date.now(),
        });
        refreshHistoryBadge();
      } catch (e) {
        console.warn("Nie zapisano do historii:", e);
      }
    } catch (err) {
      console.error(err);
      setStatus(statusEl, "err", "BŁĄD");
      toast(`${entry.file.name}: ${err.message}`, "err", "Błąd konwersji");
      fail++;
    }
    renderResults();
  }

  state.running = false;
  els.convertBtn.disabled = false;
  els.convertBtn.classList.remove("is-working");
  els.convertBtn.querySelector(".btn__label").textContent = "Konwertuj";
  toast(`Zakończono: ${ok} OK${fail ? `, ${fail} błąd(ów)` : ""}. Format: ${outMeta.label}.`,
    fail ? "err" : "ok", "Konwersja");
}

function shortStatus(m) {
  if (/Pobieram|Ładuję|gotowy/i.test(m)) return m;
  return "…";
}

function ensureProgressBar(row) {
  if (!row) return null;
  let prog = row.querySelector(".file-progress");
  if (!prog) {
    prog = el("div", "file-progress");
    const bar = el("div", "file-progress__bar");
    prog.appendChild(bar);
    row.appendChild(prog);
  }
  return prog.querySelector(".file-progress__bar");
}

function setStatus(elm, kind, text) {
  if (!elm) return;
  elm.className = `file-status file-status--${kind}`;
  elm.textContent = text;
  if (kind !== "run") bump(elm);
}

/* ---------------- Wyniki ---------------- */
function clearResults() {
  state.results.forEach((r) => r._url && URL.revokeObjectURL(r._url));
  state.results = [];
  renderResults();
}

function renderResults() {
  els.resultsList.innerHTML = "";
  els.resultsCount.textContent = state.results.length;
  bump(els.resultsCount);
  for (const r of state.results) {
    const row = el("li", "file-row");
    const thumb = el("div", "file-thumb", extOf(r.name).toUpperCase());
    row.appendChild(thumb);
    const info = el("div", "file-info");
    info.appendChild(el("div", "file-name", r.name));
    info.appendChild(el("div", "file-meta", formatBytes(r.size)));
    row.appendChild(info);
    row.appendChild(el("div", "file-status file-status--ok", ""));
    const dl = el("button", "icon-btn icon-btn--dl", "↓");
    dl.title = "Pobierz";
    dl.addEventListener("click", () => downloadBlob(r.blob, r.name));
    row.appendChild(dl);
    els.resultsList.appendChild(row);
  }
  stagger(els.resultsList);
  syncPanels();
}

async function downloadAllZip() {
  if (!state.results.length) return;
  toast("Pakuję archiwum ZIP…", "info");
  try {
    const zip = await makeZip(state.results.map((r) => ({ name: r.name, blob: r.blob })));
    downloadBlob(zip, `multiconverter_${state.sectionId}_${Date.now()}.zip`);
  } catch (e) {
    toast("Nie udało się spakować ZIP: " + e.message, "err");
  }
}

/* ---------------- Historia ---------------- */
const SECTION_ICON = Object.fromEntries(SECTIONS.map((s) => [s.id, s.icon]));

function formatWhen(t) {
  return new Date(t).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

async function showHistory() {
  if (state.running) { toast("Poczekaj na zakończenie konwersji.", "info"); return; }
  state.view = "history";
  els.converterView.hidden = true;
  els.historyView.hidden = false;
  renderNav();
  await renderHistory();
  replayEnterAnimation(els.historyView);

  if (!(await isPersistent())) {
    toast("IndexedDB niedostępne — historia zniknie po zamknięciu karty.", "info", "Historia");
  }
}

async function renderHistory() {
  let entries = [];
  try { entries = await getHistory(); } catch (e) { console.error(e); }

  els.historyList.innerHTML = "";
  els.historyCount.textContent = entries.length;
  bump(els.historyCount);
  els.historyEmpty.hidden = entries.length > 0;
  els.historyZip.disabled = entries.length === 0;
  els.historyClear.disabled = entries.length === 0;

  for (const h of entries) {
    const row = el("li", "file-row");

    const thumb = el("div", "file-thumb", extOf(h.name).toUpperCase() || "?");
    row.appendChild(thumb);

    const info = el("div", "file-info");
    info.appendChild(el("div", "file-name", h.name));
    info.appendChild(el("div", "file-meta",
      `${formatBytes(h.size)} · ${SECTION_ICON[h.section] || ""} ${formatWhen(h.createdAt)}`));
    row.appendChild(info);

    row.appendChild(el("div", "file-status file-status--ok", ""));

    const actions = el("div", "row-actions");
    const dl = el("button", "icon-btn icon-btn--dl", "↓");
    dl.title = "Pobierz";
    dl.addEventListener("click", () => downloadBlob(h.blob, h.name));
    actions.appendChild(dl);

    const rm = el("button", "icon-btn", "✕");
    rm.title = "Usuń z historii";
    rm.addEventListener("click", async () => {
      row.classList.add("is-removing");
      setTimeout(async () => {
        try { await removeHistoryEntry(h.id); } catch {}
        await renderHistory();
        refreshHistoryBadge();
      }, 180);
    });
    actions.appendChild(rm);
    row.appendChild(actions);

    els.historyList.appendChild(row);
  }
  stagger(els.historyList);
}

async function downloadHistoryZip() {
  const entries = await getHistory();
  if (!entries.length) return;
  toast("Pakuję archiwum ZIP…", "info");
  try {
    // Duplikaty nazw dostają przyrostek, żeby ZIP był poprawny.
    const seen = new Map();
    const items = entries.map((h) => {
      let name = h.name;
      const n = seen.get(name) || 0;
      seen.set(name, n + 1);
      if (n > 0) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)}_${n}${name.slice(dot)}` : `${name}_${n}`;
      }
      return { name, blob: h.blob };
    });
    const zip = await makeZip(items);
    downloadBlob(zip, `multiconverter_historia_${Date.now()}.zip`);
  } catch (e) {
    toast("Nie udało się spakować ZIP: " + e.message, "err");
  }
}

async function clearHistoryUI() {
  if (!confirm("Usunąć całą historię przekonwertowanych plików?")) return;
  try { await clearHistory(); } catch {}
  await renderHistory();
  refreshHistoryBadge();
  toast("Historia wyczyszczona.", "ok", "Historia");
}

/* ---------------- Widoczność paneli ---------------- */
function syncPanels() {
  const s = currentSection();
  const hasFiles = state.files.length > 0;
  els.filesPanel.hidden = s.soon || !hasFiles;
  els.controlsPanel.hidden = s.soon || !hasFiles;
  els.resultsPanel.hidden = state.results.length === 0;
  els.convertBtn.disabled = state.running || !hasFiles;
}

/* ---------------- Podpięcie zdarzeń ---------------- */
function wireEvents() {
  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
  });
  els.fileInput.addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });

  ["dragenter", "dragover"].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add("is-dragover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove("is-dragover"); }));
  els.dropzone.addEventListener("drop", (e) => { if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); });

  els.clearFiles.addEventListener("click", clearFiles);
  els.convertBtn.addEventListener("click", runConversion);
  els.downloadZip.addEventListener("click", downloadAllZip);
  els.historyZip.addEventListener("click", downloadHistoryZip);
  els.historyClear.addEventListener("click", clearHistoryUI);

  // Nie pozwól przeglądarce otworzyć pliku upuszczonego poza dropzone.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}

/* ---------------- Start ---------------- */
function init() {
  renderNav();
  renderPopular();
  wireEvents();
  selectSection(state.sectionId);
}

init();
