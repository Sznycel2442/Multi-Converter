/* ============================================================
   registry.js — rejestr wszystkich sekcji konwertera
   Każda sekcja to moduł z domyślnym eksportem (deskryptorem).
   ============================================================ */
import images from "./converters/images.js";
import audio from "./converters/audio.js";
import video from "./converters/video.js";
import model3d from "./converters/model3d.js";
import docs from "./converters/docs.js";
import data from "./converters/data.js";

export const SECTIONS = [
  images,
  audio,
  video,
  model3d,
  docs,
  data,
];

export function getSection(id) {
  return SECTIONS.find((s) => s.id === id);
}
