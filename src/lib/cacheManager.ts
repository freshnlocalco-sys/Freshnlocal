import { doc, getDoc, collection, query, limit, startAfter, getDocs, orderBy, QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './firebase';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedData<T> {
  data: T;
  timestamp: number;
}

// In-flight active promise deduplication map
const activePromises: Record<string, Promise<any>> = {};

/**
 * Log actual Firestore read operations to the console.
 */
export function trackFirestoreRead(collectionName: string, docCount: number) {
  const timestamp = new Date().toISOString();
  console.log(
    `%c[FIRESTORE READ] [${timestamp}] Collection: "${collectionName}" | Docs Read: ${docCount}`, 
    "color: #10b981; font-weight: bold; font-family: monospace; padding: 2px 4px; border: 1px solid #10b981; border-radius: 4px;"
  );
}

export const cacheManager = {
  /**
   * Save any item to localStorage with timestamp
   */
  set<T>(key: string, data: T): void {
    try {
      const payload: CachedData<T> = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(`fnl_cache_${key}`, JSON.stringify(payload));
    } catch (err) {
      console.warn(`Failed to write to localStorage for key ${key}:`, err);
    }
  },

  /**
   * Retrieve item from localStorage if it exists and is valid
   */
  get<T>(key: string, ignoreExpiry = false): T | null {
    try {
      const raw = localStorage.getItem(`fnl_cache_${key}`);
      if (!raw) return null;
      
      const parsed = JSON.parse(raw) as CachedData<T>;
      if (!ignoreExpiry && (Date.now() - parsed.timestamp) > CACHE_TTL) {
        // Stale cache
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  },

  /**
   * Check if cache is strictly valid (unexpired)
   */
  isValid(key: string): boolean {
    try {
      const raw = localStorage.getItem(`fnl_cache_${key}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return (Date.now() - parsed.timestamp) < CACHE_TTL;
    } catch {
      return false;
    }
  },

  /**
   * Clears specific cache key
   */
  clear(key: string): void {
    localStorage.removeItem(`fnl_cache_${key}`);
  },

  /**
   * Deduplicated loader with Stale-While-Revalidate and Firestore reads optimization.
   */
  async fetchDeduplicated<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    if (activePromises[key]) {
      return activePromises[key];
    }

    const promise = fetchFn().finally(() => {
      delete activePromises[key];
    });

    activePromises[key] = promise;
    return promise;
  },

  /**
   * Paginated Products Fetcher (loads in chunks of 50 in background)
   */
  async fetchProductsPaginated(): Promise<any[]> {
    return this.fetchDeduplicated('products_paginated', async () => {
      let allProducts: any[] = [];
      let lastDoc: QueryDocumentSnapshot | null = null;
      let hasMore = true;
      const pageSize = 50;

      while (hasMore) {
        const constraints: QueryConstraint[] = [
          orderBy('__name__'), // robust deterministic ID ordering
          limit(pageSize)
        ];

        if (lastDoc) {
          constraints.push(startAfter(lastDoc));
        }

        const q = query(collection(db, 'products'), ...constraints);
        const querySnapshot = await getDocs(q);

        trackFirestoreRead('products', querySnapshot.size);

        const chunk = querySnapshot.docs.map(doc => {
          const data = doc.data();
          const pPrice = Number(data.price) || 0;
          const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
          return {
            id: doc.id,
            ...data,
            price: pPrice,
            originalPrice: pMrp > pPrice ? pMrp : undefined
          };
        });

        allProducts = [...allProducts, ...chunk];

        if (querySnapshot.size < pageSize) {
          hasMore = false;
        } else {
          lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        }
      }

      // Save complete products list back to cache
      this.set('products', allProducts);
      return allProducts;
    });
  }
};
