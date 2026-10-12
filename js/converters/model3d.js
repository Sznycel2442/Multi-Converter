/* ============================================================
   converters/model3d.js — konwersja modeli 3D (three.js)
   Wejście:  OBJ, STL, PLY, GLTF, GLB, DAE, FBX
   Wyjście:  GLB, GLTF, OBJ, STL, PLY
   three.js ładowany leniwie z CDN (import map w index.html).
   ============================================================ */
import { withExt } from "../files.js";
import { ICONS } from "../icons.js";

let THREE = null;
async function three() {
  if (!THREE) THREE = await import("three");
  return THREE;
}

/* --- Wczytywanie: zwraca THREE.Object3D --- */
async function loadModel(file, ext, onStatus) {
  const T = await three();
  onStatus?.("Wczytuję model…");

  if (ext === "obj") {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    return new OBJLoader().parse(await file.text());
  }
  if (ext === "stl") {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    const geo = new STLLoader().parse(await file.arrayBuffer());
    return new T.Mesh(geo, defaultMaterial(T));
  }
  if (ext === "ply") {
    const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
    const geo = new PLYLoader().parse(await file.arrayBuffer());
    geo.computeVertexNormals();
    return new T.Mesh(geo, defaultMaterial(T));
  }
  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    const data = ext === "glb" ? await file.arrayBuffer() : await file.text();
    const gltf = await new Promise((res, rej) => loader.parse(data, "", res, rej));
    return gltf.scene;
  }
  if (ext === "dae") {
    const { ColladaLoader } = await import("three/addons/loaders/ColladaLoader.js");
    return new ColladaLoader().parse(await file.text(), "").scene;
  }
  if (ext === "fbx") {
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    return new FBXLoader().parse(await file.arrayBuffer(), "");
  }
  throw new Error("Nieobsługiwane wejście 3D: " + ext);
}

function defaultMaterial(T) {
  return new T.MeshStandardMaterial({ color: 0xbfd25a, metalness: 0.1, roughness: 0.8 });
}

/* --- Eksport --- */
async function exportModel(object, target, options, onStatus) {
  onStatus?.("Eksportuję…");
  if (target === "obj") {
    const { OBJExporter } = await import("three/addons/exporters/OBJExporter.js");
    return { data: new OBJExporter().parse(object), mime: "text/plain" };
  }
  if (target === "stl") {
    const { STLExporter } = await import("three/addons/exporters/STLExporter.js");
    const bin = options.binary !== false;
    const out = new STLExporter().parse(object, { binary: bin });
    return { data: bin ? out : String(out), mime: "model/stl" };
  }
  if (target === "ply") {
    const { PLYExporter } = await import("three/addons/exporters/PLYExporter.js");
    const bin = options.binary !== false;
    const out = await new Promise((res) =>
      new PLYExporter().parse(object, res, { binary: bin }));
    return { data: out, mime: "model/ply" };
  }
  if (target === "glb" || target === "gltf") {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const binary = target === "glb";
    const out = await new Promise((res, rej) =>
      new GLTFExporter().parse(object, res, rej, { binary }));
    return {
      data: binary ? out : JSON.stringify(out, null, 2),
      mime: binary ? "model/gltf-binary" : "model/gltf+json",
    };
  }
  throw new Error("Nieobsługiwane wyjście 3D: " + target);
}

export default {
  id: "model3d",
  label: "3D",
  icon: ICONS.box,
  badge: "3D",
  description:
    "Konwersja modeli 3D silnikiem three.js. Wejście: OBJ, STL, PLY, GLTF, GLB, DAE, FBX. Wyjście: GLB, GLTF, OBJ, STL, PLY. (Konwertuje geometrię; materiały/tekstury mogą się uprościć.)",
  accept: ["obj", "stl", "ply", "gltf", "glb", "dae", "fbx"],
  defaultTarget: "glb",
  heavy: true,
  outputs: [
    { id: "glb",  label: "GLB",  ext: "glb",  lossless: false, note: "Binarny glTF — kompaktowy, standard branżowy." },
    { id: "gltf", label: "glTF", ext: "gltf", lossless: false, note: "glTF w JSON (czytelny tekst)." },
    { id: "obj",  label: "OBJ",  ext: "obj",  lossless: false, note: "Prosta geometria, szeroko wspierany." },
    { id: "stl",  label: "STL",  ext: "stl",  lossless: false, note: "Do druku 3D. Sama siatka, bez kolorów." },
    { id: "ply",  label: "PLY",  ext: "ply",  lossless: false, note: "Siatka z kolorami wierzchołków." },
  ],
  optionsSchema: [
    { id: "binary", type: "checkbox", label: "Binarny (STL/PLY)", default: true,
      showWhen: (t) => t === "stl" || t === "ply" },
  ],

  async convert(file, { target, options, onProgress, onStatus }) {
    const ext = file.name.split(".").pop().toLowerCase();
    onProgress?.(0.15);
    const object = await loadModel(file, ext, onStatus);
    onProgress?.(0.6);
    const { data, mime } = await exportModel(object, target, options, onStatus);
    onProgress?.(1);
    const blob = new Blob([data], { type: mime });
    return { blob, name: withExt(file.name, target) };
  },
};
