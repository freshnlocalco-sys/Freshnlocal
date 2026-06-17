import { create } from 'zustand';
import { isQuotaError, handleFirestoreError, OperationType, db, auth } from '../lib/firebase';
import { Product } from './useCart';
import { collection, getDocs, query, orderBy, limit, startAfter } from 'firebase/firestore';
import { cacheManager, trackFirestoreRead } from '../lib/cacheManager';
import { idb } from '../lib/indexedDB';
import { ensureProductThumbnail } from '../lib/thumbnailHelper';

interface ProductsState {
  products: Product[];
  lastFetched: number;
  loading: boolean;
  loadingNext: boolean;
  hasMore: boolean;
  error: string | null;
  hydrateFromIDB: () => Promise<void>;
  fetchProducts: (categoryOrForce?: string | boolean, force?: boolean) => Promise<void>;
  fetchNextProducts: () => Promise<void>;
  performActualFetch: (isSilent: boolean) => Promise<void>;
}

// In-memory module-level reference for tracking pagination cursors safely without Zustand pollution
let lastVisibleDoc: any = null;

const loadLocalStorageProducts = (): { products: Product[]; lastFetched: number } => {
  if (typeof window === 'undefined') {
    return { products: [], lastFetched: 0 };
  }
  try {
    const products = cacheManager.get<Product[]>('products', true) || [];
    const lastFetched = cacheManager.get<number>('products_last_fetched', true) || 0;
    return { products, lastFetched };
  } catch {
    return { products: [], lastFetched: 0 };
  }
};

const offline = loadLocalStorageProducts();

export const useProducts = create<ProductsState>((set, get) => ({
  products: offline.products,
  lastFetched: offline.lastFetched,
  loading: false,
  loadingNext: false,
  hasMore: true,
  error: null,

  hydrateFromIDB: async () => {
    try {
      const dbProducts = await idb.get<Product[]>('products');
      const dbLastFetched = await idb.get<number>('products_last_fetched');
      if (dbProducts && dbProducts.length > 0) {
        set({
          products: dbProducts,
          lastFetched: dbLastFetched || Date.now()
        });
      }
    } catch (err) {
      console.warn("Hydration from IndexedDB failed:", err);
    }
  },

  fetchProducts: async (categoryOrForce = false, forceParam = false) => {
    const { products, lastFetched, loading } = get();
    if (loading) return; // Prevent concurrent requests

    let force = false;
    if (typeof categoryOrForce === 'boolean') {
      force = categoryOrForce;
    } else {
      force = forceParam;
    }

    const now = Date.now();
    // Cache duration increased to 12 hours!
    const needsFetch = force || (now - lastFetched) >= 12 * 60 * 60 * 1000;

    if (!needsFetch) {
      return;
    }

    // SWR trigger:
    // If we have cached products in memory, return immediately and let the actual Firestore fetch run in the background.
    if (!force && products.length > 0) {
      get().performActualFetch(true).catch(e => {
        console.warn("Background products refresh failed safely:", e);
      });
      return;
    }

    // Blocking fetch (needed only when we have zero items)
    await get().performActualFetch(false);
  },

  performActualFetch: async (isSilent: boolean) => {
    if (!isSilent) {
      set({ loading: true, error: null });
    }

    const startTime = performance.now();
    try {
      // First page queries 20 items initially to optimize load speed and reduce Reads!
      const pageSize = 20;
      const q = query(
        collection(db, 'products'),
        orderBy('__name__'),
        limit(pageSize)
      );

      const querySnapshot = await getDocs(q);
      const docCount = querySnapshot.size;
      trackFirestoreRead('products_page_1', docCount);

      // Clean up duplicate juices
      const byName = new Map<string, string>();
      const duplicatesToDelete: string[] = [];
      
      const fetchedList = querySnapshot.docs.reduce((acc, docSnapshot) => {
        const data = docSnapshot.data();
        const pPrice = Number(data.price) || 0;
        const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
        const product = {
          id: docSnapshot.id,
          ...data,
          price: pPrice,
          originalPrice: pMrp > pPrice ? pMrp : undefined,
          thumbnailUrl: data.thumbnailUrl || data.imageUrl || ''
        } as unknown as Product;

        const isJuice = (product.category || '').toLowerCase().includes('juice');
        if (isJuice) {
          const key = (product.name || '').toLowerCase() + '|' + (product.category || '').toLowerCase();
          if (byName.has(key)) {
            duplicatesToDelete.push(docSnapshot.id);
            return acc; // skip adding to list
          } else {
            byName.set(key, docSnapshot.id);
          }
        }
        
        acc.push(product);
        return acc;
      }, [] as Product[]);

      fetchedList.sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));

      if (duplicatesToDelete.length > 0) {
        import('firebase/firestore').then(({ deleteDoc, doc }) => {
          Promise.all(duplicatesToDelete.map(id => deleteDoc(doc(db, 'products', id))))
            .then(() => console.log(`Removed ${duplicatesToDelete.length} duplicate juice items.`))
            .catch(err => console.error("Failed to remove duplicate juices:", err));
        });
      }

      // Update cursor reference for pagination
      if (querySnapshot.docs.length > 0) {
        lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      } else {
        lastVisibleDoc = null;
      }

      const hasMore = querySnapshot.docs.length === pageSize;

      // Sync fetched list back to cache
      cacheManager.set('products', fetchedList);
      cacheManager.set('products_last_fetched', Date.now());
      await idb.set('products', fetchedList, 12 * 60 * 60 * 1000);
      await idb.set('products_last_fetched', Date.now(), 12 * 60 * 60 * 1000);

      set({
        products: fetchedList,
        lastFetched: Date.now(),
        loading: false,
        hasMore,
        error: null
      });

      const pageLoadTime = performance.now() - startTime;
      console.log(
        `%c[PERF METRIC] Initial 20 products loaded and cached in ${pageLoadTime.toFixed(2)}ms`,
        "color: #10b981; font-weight: bold; font-family: monospace;"
      );

      // Trigger automatic background thumbnail generation for products that don't have it
      triggerBackgroundThumbnailGeneration(fetchedList, get, set);

    } catch (error: any) {
      console.error("Firestore global page 1 load failure:", error);
      set({ loading: false });
      if (isQuotaError(error)) {
        const errorMsg = error?.message || String(error);
        set({ error: errorMsg });
      } else {
        if (!isSilent) {
          handleFirestoreError(error, OperationType.LIST, 'products');
        } else {
          console.warn("Background update of products failed safely:", error);
        }
      }
    }
  },

  fetchNextProducts: async () => {
    const { products, loadingNext, hasMore } = get();
    if (loadingNext || !hasMore || !lastVisibleDoc) return;

    set({ loadingNext: true });
    const startTime = performance.now();

    try {
      const pageSize = 20;
      const q = query(
        collection(db, 'products'),
        orderBy('__name__'),
        startAfter(lastVisibleDoc),
        limit(pageSize)
      );

      const querySnapshot = await getDocs(q);
      const docCount = querySnapshot.size;
      trackFirestoreRead('products_next_page', docCount);

      if (querySnapshot.docs.length > 0) {
        lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      } else {
        lastVisibleDoc = null;
      }

      const nextProductsList = querySnapshot.docs.reduce((acc, docSnapshot) => {
        const data = docSnapshot.data();
        const pPrice = Number(data.price) || 0;
        const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
        const product = {
          id: docSnapshot.id,
          ...data,
          price: pPrice,
          originalPrice: pMrp > pPrice ? pMrp : undefined,
          thumbnailUrl: data.thumbnailUrl || data.imageUrl || ''
        } as unknown as Product;

        acc.push(product);
        return acc;
      }, [] as Product[]);

      const updatedProducts = [...products, ...nextProductsList];
      updatedProducts.sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));

      const nextHasMore = querySnapshot.docs.length === pageSize;

      set({
        products: updatedProducts,
        loadingNext: false,
        hasMore: nextHasMore
      });

      // Update both caches
      cacheManager.set('products', updatedProducts);
      await idb.set('products', updatedProducts, 12 * 60 * 60 * 1000);

      const loadTime = performance.now() - startTime;
      console.log(
        `%c[PERF METRIC] Loaded next 20 products in ${loadTime.toFixed(2)}ms (total count: ${updatedProducts.length})`,
        "color: #10b981; font-weight: bold; font-family: monospace;"
      );

      // Run background thumbnail generation
      triggerBackgroundThumbnailGeneration(nextProductsList, get, set);

    } catch (error: any) {
      console.error("Firestore pagination next page fetch failure:", error);
      set({ loadingNext: false });
    }
  }
}));

function triggerBackgroundThumbnailGeneration(
  items: Product[],
  get: () => ProductsState,
  set: (state: Partial<ProductsState>) => void
) {
  if (typeof window === 'undefined') return;
  
  const email = auth.currentUser?.email;
  const isAdminUser = email === 'freshnlocalco@gmail.com' || email === 'mohitswami855@gmail.com';

  const itemsNeedingThumbnail = items.filter(
    item => {
      const isOldLowRes = !!(item.thumbnailUrl && item.thumbnailUrl.startsWith('data:') && item.thumbnailUrl.length < 24000);
      return item.imageUrl && (!item.thumbnailUrl || item.thumbnailUrl === item.imageUrl || isOldLowRes);
    }
  );

  if (itemsNeedingThumbnail.length === 0) return;

  console.log(`[THUMBNAILS] Found ${itemsNeedingThumbnail.length} products needing optimized thumbnails. Generating in background...`);

  // Run asynchronously without blocking the main UI thread
  (async () => {
    for (const item of itemsNeedingThumbnail) {
      try {
        await ensureProductThumbnail(
          item,
          (updatedItem) => {
            const currentProducts = get().products;
            const idx = currentProducts.findIndex(p => p.id === updatedItem.id);
            if (idx !== -1) {
              const updatedList = [...currentProducts];
              updatedList[idx] = updatedItem;
              set({ products: updatedList });

              // Sync to caches
              cacheManager.set('products', updatedList);
              idb.set('products', updatedList, 12 * 60 * 60 * 1000);
            }
          },
          isAdminUser
        );
      } catch (err) {
        console.debug(`Background thumbnail generation failed for ${item.name}:`, err);
      }
    }
  })();
}
