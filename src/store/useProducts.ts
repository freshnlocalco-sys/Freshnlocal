import { create } from 'zustand';
import { isQuotaError, handleFirestoreError, OperationType, db } from '../lib/firebase';
import { Product } from './useCart';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { trackFirestoreRead } from '../lib/cacheManager';

interface ProductsState {
  products: Product[];
  lastFetched: number;
  loading: boolean;
  loadingNext: boolean;
  hasMore: boolean;
  error: string | null;
  fetchProducts: (categoryOrForce?: string | boolean, force?: boolean, fetchAllForAdmin?: boolean) => Promise<void>;
  fetchNextProducts: (category?: string) => Promise<void>;
}

export const useProducts = create<ProductsState>((set, get) => ({
  products: [],
  lastFetched: 0,
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

    // Reuse the already loaded catalog if it was fetched within the last 5 minutes (caches database reads!)
    if (!force && products.length > 0 && (Date.now() - lastFetched) < 5 * 60 * 1000) {
      return;
    }

    set({ loading: true, error: null });

    try {
      const q = query(collection(db, 'products'), orderBy('__name__'));
      const querySnapshot = await getDocs(q);
      trackFirestoreRead('products_all', querySnapshot.size);

      const fetchedList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const pPrice = Number(data.price) || 0;
        const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
        return {
          id: doc.id,
          ...data,
          price: pPrice,
          originalPrice: pMrp > pPrice ? pMrp : undefined,
          thumbnailUrl: data.thumbnailUrl || data.imageUrl || ''
        } as unknown as Product;
      });

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
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    }
  },

  fetchNextProducts: async () => {
    // Simplified model does not require paginated scrolling
  }
}));
