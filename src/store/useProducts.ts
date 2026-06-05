import { create } from 'zustand';
import { collection, query, getDocs } from 'firebase/firestore';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product } from './useCart';
import toast from 'react-hot-toast';

interface ProductsState {
  products: Product[];
  lastFetched: number;
  loading: boolean;
  error: string | null;
  fetchProducts: (force?: boolean) => Promise<void>;
}

const CACHE_TIME = 1000 * 60 * 5; // 5 minutes

export const useProducts = create<ProductsState>((set, get) => ({
  products: [],
  lastFetched: 0,
  loading: false,
  error: null,
  fetchProducts: async (force = false) => {
    const { lastFetched, loading } = get();
    if (loading) return; // Prevent concurrent fetches
    
    // Use cache if not forced and within cache time
    if (!force && (Date.now() - lastFetched) < CACHE_TIME) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const q = query(collection(db, 'products'));
      const querySnapshot = await getDocs(q);
      const fetchedProducts = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const pPrice = Number(data.price) || 0;
        const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
        return {
          id: doc.id,
          ...data,
          price: pPrice,
          originalPrice: pMrp > pPrice ? pMrp : undefined
        };
      }) as Product[];
      set({ products: fetchedProducts, lastFetched: Date.now(), loading: false });
    } catch (error: any) {
      if (isQuotaError(error)) {
        const errorMsg = error?.message || String(error);
        set({ error: errorMsg, loading: false });
        toast.error(`Database error: ${errorMsg}`, { duration: 8000 });
      } else {
        set({ loading: false });
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    }
  }
}));
