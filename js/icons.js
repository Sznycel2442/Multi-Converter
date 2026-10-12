/* ============================================================
   icons.js — zestaw ikon SVG (spójny, liniowy styl)
   ============================================================ */
const svg = (inner, { fill = "none", stroke = "currentColor", weight = 1.8 } = {}) =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICONS = {
  history: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
  bolt: svg('<path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z"/>', { fill: "currentColor", stroke: "none" }),
  infinity: svg('<path d="M6 9a3 3 0 100 6 3 3 0 002.24-1.01L12 10l3.76 4A3 3 0 1018 9c-.86 0-1.65.37-2.24 1.01L12 14l-3.76-4A3 3 0 006 9z"/>'),
  inbox: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  video: svg('<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3"/>'),
  fileText: svg('<path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>'),
  database: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  box: svg('<path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M3.3 7l8.7 5 8.7-5M12 12v9"/>'),
};
