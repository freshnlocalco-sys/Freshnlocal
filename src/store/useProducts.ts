import { create } from 'zustand';
import { isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import { cacheManager } from '../lib/cacheManager';
import { Product } from './useCart';
import toast from 'react-hot-toast';

interface ProductsState {
  products: Product[];
  lastFetched: number;
  loading: boolean;
  error: string | null;
  fetchProducts: (force?: boolean) => Promise<void>;
}

export const useProducts = create<ProductsState>((set, get) => ({
  products: [],
  lastFetched: 0,
  loading: false,
  error: null,
  fetchProducts: async (force = false) => {
    const { products, loading } = get();
    if (loading) return; // Prevent duplicate/concurrent fetches

    // 1. Avoid re-fetching if data already exists in the Zustand store and not forced
    if (!force && products.length > 0) {
      return;
    }

    // 2. Load from localStorage cache immediately if it exists
    const cachedProducts = cacheManager.get<Product[]>('products', true); // ignore expiry to get values for SWR
    if (cachedProducts && cachedProducts.length > 0) {
      set({ products: cachedProducts });
    }

    // 3. See if the cache is unexpired (< 24 hours) and we aren't forcing
    const isCacheFresh = cacheManager.isValid('products');
    if (!force && isCacheFresh && cachedProducts && cachedProducts.length > 0) {
      return;
    }

    // 4. If we need to fetch (either stale or no cache)
    const isBackgroundRefresh = cachedProducts && cachedProducts.length > 0;
    
    if (!isBackgroundRefresh) {
      set({ loading: true, error: null });
    }

    try {
      // Use the paginated fetch from our cacheManager (fetch 50 at a time)
      const fetchedProducts = await cacheManager.fetchProductsPaginated();
      
      set({ 
        products: fetchedProducts, 
        lastFetched: Date.now(), 
        loading: false 
      });
    } catch (error: any) {
      if (isQuotaError(error)) {
        const errorMsg = error?.message || String(error);
        set({ error: errorMsg, loading: false });
        if (!isBackgroundRefresh) {
          toast.error(`Database error: ${errorMsg}`, { duration: 8000 });
        }
      } else {
        set({ loading: false });
        // Only throw / notify if it wasn't a silent background update
        if (!isBackgroundRefresh) {
          handleFirestoreError(error, OperationType.LIST, 'products');
        } else {
          console.warn("Background update of products failed safely:", error);
        }
      }
    }
  }
}));

