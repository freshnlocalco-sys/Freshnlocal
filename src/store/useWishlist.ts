import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product } from './useCart';

interface WishlistStore {
  items: Product[];
  addToWishlist: (product: Product) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
}

export const useWishlist = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      addToWishlist: (product) => {
        const currentItems = get().items;
        if (!currentItems.find(i => i.id === product.id)) {
          set({ items: [...currentItems, product] });
        }
      },
      removeFromWishlist: (productId) => {
        set({ items: get().items.filter(i => i.id !== productId) });
      },
      isInWishlist: (productId) => {
        return !!get().items.find(i => i.id === productId);
      },
      clearWishlist: () => set({ items: [] }),
    }),
    {
      name: 'fresh-n-local-wishlist',
      onRehydrateStorage: () => (state) => {
        if (state && state.items) {
          const stringified = JSON.stringify(state.items);
          if (stringified.length > 500000) {
            console.warn("Wishlist state too large, clearing to prevent quota issues");
            state.items = [];
          }
        }
      }
    }
  )
);
