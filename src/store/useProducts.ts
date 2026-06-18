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
    const products = cacheManager.get<Product[]>('products_v3', true) || [];
    const lastFetched = cacheManager.get<number>('products_last_fetched_v3', true) || 0;
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
      let dbProducts = await idb.get<Product[]>('products_v3');
      let dbLastFetched = await idb.get<number>('products_last_fetched_v3');
      
      // Fallback to localStorage if IndexedDB is blocked or empty
      if (!dbProducts || dbProducts.length === 0) {
        dbProducts = cacheManager.get<Product[]>('products_v3', true) || [];
        dbLastFetched = cacheManager.get<number>('products_last_fetched_v3', true) || 0;
      }

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
    const force = typeof categoryOrForce === 'boolean' ? categoryOrForce : !!forceParam;
    const { products, lastFetched, loading } = get();
    if (loading) return; // Prevent concurrent requests

    const needsFetch = force || (Date.now() - lastFetched) >= 12 * 60 * 60 * 1000 || products.length === 0;
    if (!needsFetch) return;

    if (!force && products.length > 0) {
      // SILENT background refresh and return immediately
      get().performActualFetch(true);
      return;
    }

    // Blocking fetch
    await get().performActualFetch(false);
  },

  performActualFetch: async (isSilent: boolean) => {
    if (!isSilent) {
      set({ loading: true, error: null });
    }

    try {
      // Query all products without limits or ordering requirements to avoid missing any newly added items
      const q = query(
        collection(db, 'products')
      );
      
      const querySnapshot = await getDocs(q);
      const docCount = querySnapshot.size;
      trackFirestoreRead('products_all', docCount);

      // Clean up duplicate juices if any, though with storage backend they shouldn't exist
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

      // Reset the module-level pagination cursor
      lastVisibleDoc = null;
      const hasMore = false;

      // Sync fetched list to IndexedDB and LocalStorage fallback
      try {
        cacheManager.set('products_v3', fetchedList);
        cacheManager.set('products_last_fetched_v3', Date.now());
        await idb.set('products_v3', fetchedList, 12 * 60 * 60 * 1000);
        await idb.set('products_last_fetched_v3', Date.now(), 12 * 60 * 60 * 1000);
      } catch (cacheErr) {
        console.warn("Cache set failed safely:", cacheErr);
      }

      set({
        products: fetchedList,
        lastFetched: Date.now(),
        loading: false,
        hasMore,
        error: null
      });

      // Trigger automatic background thumbnail generation for products that don't have it
      triggerBackgroundThumbnailGeneration(fetchedList, get, set);

    } catch (error: any) {
      console.error("Firestore loading error:", error);
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
    const { loadingNext, hasMore, products } = get();
    if (loadingNext || !hasMore || !lastVisibleDoc) return;

    set({ loadingNext: true });
    try {
      const q = query(
        collection(db, 'products'),
        orderBy('__name__'),
        startAfter(lastVisibleDoc),
        limit(50)
      );

      const querySnapshot = await getDocs(q);
      const docCount = querySnapshot.size;
      trackFirestoreRead('products_next_page', docCount);

      const nextList: Product[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const pPrice = Number(data.price) || 0;
        const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
        nextList.push({
          id: docSnap.id,
          ...data,
          price: pPrice,
          originalPrice: pMrp > pPrice ? pMrp : undefined,
          thumbnailUrl: data.thumbnailUrl || data.imageUrl || ''
        } as unknown as Product);
      });

      lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
      const nextHasMore = querySnapshot.docs.length === 50;

      const updatedProducts = [...products, ...nextList];

      try {
        await idb.set('products_v3', updatedProducts, 12 * 60 * 60 * 1000);
      } catch (cacheErr) {
        console.warn("IndexedDB cache update failed safely:", cacheErr);
      }

      set({
        products: updatedProducts,
        loadingNext: false,
        hasMore: nextHasMore
      });

      triggerBackgroundThumbnailGeneration(nextList, get, set);

    } catch (error) {
      console.error("Firestore fetch next page error:", error);
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
              cacheManager.set('products_v3', updatedList);
              idb.set('products_v3', updatedList, 12 * 60 * 60 * 1000);
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
