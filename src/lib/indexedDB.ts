import { Product } from '../store/useCart';

export class IndexedDBHelper {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }
      const request = indexedDB.open('FreshNLocalDB', 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cache', 'readonly');
        const store = tx.objectStore('cache');
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          const result = getReq.result;
          if (!result) {
            resolve(null);
            return;
          }
          // Check TTL if exists
          if (result.ttl && (Date.now() - result.timestamp) > result.ttl) {
            // Expired cache
            resolve(null);
            return;
          }
          resolve(result.value);
        };
        getReq.onerror = () => resolve(null); // Resolve to null gracefully on error
      });
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const db = await this.dbPromise;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const setReq = store.put({ value, timestamp: Date.now(), ttl }, key);
        setReq.onsuccess = () => resolve();
        setReq.onerror = () => reject(setReq.error);
      });
    } catch (err) {
      console.warn(`Failed to set IndexedDB key "${key}":`, err);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const delReq = store.delete(key);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => reject(delReq.error);
      });
    } catch (err) {
      console.warn(`Failed to delete IndexedDB key "${key}":`, err);
    }
  }
}

export const idb = new IndexedDBHelper();
