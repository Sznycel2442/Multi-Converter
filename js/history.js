/* ============================================================
   history.js — trwała historia konwersji (IndexedDB)
   Przechowuje gotowe Bloby lokalnie, więc lista przeżywa
   odświeżenie strony. Gdy IndexedDB niedostępne (np. tryb
   prywatny), działa zapasowo w pamięci do końca sesji.
   ============================================================ */

const DB_NAME = "multiconverter";
const DB_VER = 1;
const STORE = "history";

let _db = null;
let _memFallback = null; // tablica, gdy IDB niedostępne
let _memId = 0;

function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_memFallback) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VER);
    } catch {
      _memFallback = [];
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => { _memFallback = []; resolve(null); };
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Dodaje wpis do historii.
 * @param {{name:string, size:number, blob:Blob, section:string, target:string, createdAt:number}} entry
 * @returns {Promise<number>} id wpisu
 */
export async function addHistoryEntry(entry) {
  const db = await openDB();
  if (!db) {
    const e = { ...entry, id: ++_memId };
    _memFallback.push(e);
    return e.id;
  }
  return reqAsPromise(tx(db, "readwrite").add(entry));
}

/** Zwraca wszystkie wpisy, najnowsze najpierw. */
export async function getHistory() {
  const db = await openDB();
  if (!db) return [..._memFallback].reverse();
  const all = await reqAsPromise(tx(db, "readonly").getAll());
  return all.reverse();
}

export async function removeHistoryEntry(id) {
  const db = await openDB();
  if (!db) {
    _memFallback = _memFallback.filter((e) => e.id !== id);
    return;
  }
  await reqAsPromise(tx(db, "readwrite").delete(id));
}

export async function clearHistory() {
  const db = await openDB();
  if (!db) { _memFallback = []; return; }
  await reqAsPromise(tx(db, "readwrite").clear());
}

/** Liczba wpisów (do odznaki w nawigacji). */
export async function historyCount() {
  const db = await openDB();
  if (!db) return _memFallback.length;
  return reqAsPromise(tx(db, "readonly").count());
}

/** Czy historia działa trwale (IndexedDB), czy tylko w pamięci. */
export async function isPersistent() {
  const db = await openDB();
  return !!db;
}
