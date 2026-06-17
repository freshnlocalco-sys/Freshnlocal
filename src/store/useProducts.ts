import { create } from 'zustand';
import { isQuotaError, handleFirestoreError, OperationType, db } from '../lib/firebase';
import { Product } from './useCart';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { cacheManager, trackFirestoreRead } from '../lib/cacheManager';

interface ProductsState {
  products: Product[];
  lastFetched: number;
  loading: boolean;
  loadingNext: boolean;
  hasMore: boolean;
  error: string | null;
  fetchProducts: (categoryOrForce?: string | boolean, force?: boolean, fetchAllForAdmin?: boolean) => Promise<void>;
  fetchNextProducts: (category?: string) => Promise<void>;
  performActualFetch: (isSilent: boolean) => Promise<void>;
}

const loadOfflineProducts = (): { products: Product[]; lastFetched: number } => {
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

const offline = loadOfflineProducts();

export const useProducts = create<ProductsState>((set, get) => ({
  products: offline.products,
  lastFetched: offline.lastFetched,
  loading: false,
  loadingNext: false,
  hasMore: false,
  error: null,

  fetchProducts: async (categoryOrForce = false, forceParam = false) => {
    const { products, lastFetched, loading } = get();
    if (loading) return; // Prevent concurrent fetches

    let force = false;
    if (typeof categoryOrForce === 'boolean') {
      force = categoryOrForce;
    } else {
      force = forceParam;
    }

    const now = Date.now();
    const needsFetch = force || (now - lastFetched) >= 5 * 60 * 1000;

    if (!needsFetch) {
      return;
    }

    // SWR trigger:
    // If we have cached products, do NOT block the caller or set loading state.
    // Instead, return immediately and let the actual Firestore fetch run in the background.
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

    try {
      const q = query(collection(db, 'products'), orderBy('__name__'));
      const querySnapshot = await getDocs(q);
      trackFirestoreRead('products_all', querySnapshot.size);

      // Clean up duplicate juices
      const byName = new Map<string, string>();
      const duplicatesToDelete: string[] = [];
      
      const fetchedList = querySnapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        const pPrice = Number(data.price) || 0;
        const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
        const product = {
          id: doc.id,
          ...data,
          price: pPrice,
          originalPrice: pMrp > pPrice ? pMrp : undefined,
          thumbnailUrl: data.thumbnailUrl || data.imageUrl || ''
        } as unknown as Product;

        const isJuice = (product.category || '').toLowerCase().includes('juice');
        if (isJuice) {
          const key = (product.name || '').toLowerCase() + '|' + (product.category || '').toLowerCase();
          if (byName.has(key)) {
            duplicatesToDelete.push(doc.id);
            return acc; // skip adding to list
          } else {
            byName.set(key, doc.id);
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

      // Sync fetched list back to cache
      cacheManager.set('products', fetchedList);
      cacheManager.set('products_last_fetched', Date.now());

      set({
        products: fetchedList,
        lastFetched: Date.now(),
        loading: false,
        error: null
      });

    } catch (error: any) {
      console.error("Firestore global load failure:", error);
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
    // Simplified model does not require paginated scrolling
  }
}));
