import type { MapData } from '../types';

const DB_NAME = 'SystemNoteDB';
const DB_VERSION = 1;
const STORE_MAPS = 'maps';

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase | null> | null = null;

export function openDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[IndexedDB] indexedDB is not supported in this environment.');
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_MAPS)) {
          db.createObjectStore(STORE_MAPS, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        dbInstance.onversionchange = () => {
          dbInstance?.close();
          dbInstance = null;
        };
        resolve(dbInstance);

        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().catch(() => {});
        }
      };

      request.onerror = (event) => {
        console.error('[IndexedDB] Failed to open database:', (event.target as IDBOpenDBRequest).error);
        resolve(null);
      };
    } catch (err) {
      console.error('[IndexedDB] Exception when opening database:', err);
      resolve(null);
    }
  });

  return initPromise;
}

export async function idbGetAllMaps(): Promise<MapData[] | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MAPS, 'readonly');
      const store = tx.objectStore(STORE_MAPS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as MapData[]) || []);
      };

      request.onerror = () => {
        console.error('[IndexedDB] Error fetching all maps:', request.error);
        resolve(null);
      };
    } catch (err) {
      console.error('[IndexedDB] Transaction error in idbGetAllMaps:', err);
      resolve(null);
    }
  });
}

export async function idbSaveAllMaps(maps: MapData[]): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  const safeMaps = JSON.parse(JSON.stringify(maps));

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MAPS, 'readwrite');
      const store = tx.objectStore(STORE_MAPS);

      store.clear();
      for (const map of safeMaps) {
        store.put(map);
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => {
        console.error('[IndexedDB] Transaction error saving maps:', tx.error || e);
        resolve(false);
      };
    } catch (err) {
      console.error('[IndexedDB] Exception in idbSaveAllMaps:', err);
      resolve(false);
    }
  });
}
