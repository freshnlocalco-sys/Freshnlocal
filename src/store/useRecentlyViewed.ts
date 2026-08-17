import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product } from './useCart';

interface RecentlyViewedStore {
  items: Product[];
  addProduct: (product: Product) => void;
  clearRecentlyViewed: () => void;
}

export const useRecentlyViewed = create<RecentlyViewedStore>()(
  persist(
    (set, get) => ({
      items: [],
      addProduct: (product) => {
        if (!product || !product.id) return;
        const currentItems = get().items;
        // Filter out if already exists, then put at the front, limit to 10
        const filtered = currentItems.filter(i => i.id !== product.id);
        const updated = [product, ...filtered].slice(0, 10);
        set({ items: updated });
      },
      clearRecentlyViewed: () => set({ items: [] }),
    }),
    {
      name: 'fresh-n-local-recently-viewed',
      onRehydrateStorage: () => (state) => {
        if (state && state.items) {
          const stringified = JSON.stringify(state.items);
          if (stringified.length > 500000) {
            state.items = [];
          }
        }
      }
    }
  )
);
