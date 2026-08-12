import { create } from 'zustand';
import { getCustomerHorecaPrices, saveCustomerHorecaPrice, subscribeToCustomerHorecaPrices } from '../lib/horecaPrices';

interface HorecaPricesState {
  prices: Record<string, number>;
  loading: boolean;
  activeSubKey: string | null;
  unsubscribeFn: (() => void) | null;
  subscribePrices: (userId: string, userEmail?: string) => void;
  loadPrices: (userId: string, userEmail?: string) => Promise<void>;
  updatePrice: (userId: string, productId: string, price: number, productName?: string, userEmail?: string) => Promise<void>;
}

export const useHorecaPrices = create<HorecaPricesState>((set, get) => ({
  prices: {},
  loading: false,
  activeSubKey: null,
  unsubscribeFn: null,

  subscribePrices: (userId: string, userEmail?: string) => {
    const key = `${userId || ''}_${userEmail || ''}`;
    if (get().activeSubKey === key && get().unsubscribeFn) {
      return; // already subscribed
    }

    // Clean up old listener if key changed
    if (get().unsubscribeFn) {
      get().unsubscribeFn!();
    }

    if (!userId && !userEmail) {
      set({ prices: {}, activeSubKey: null, unsubscribeFn: null });
      return;
    }

    set({ loading: true, activeSubKey: key });

    const unsub = subscribeToCustomerHorecaPrices(userId, userEmail, (freshPrices) => {
      set({ prices: freshPrices, loading: false });
    });

    set({ unsubscribeFn: unsub });
  },

  loadPrices: async (userId: string, userEmail?: string) => {
    if (!userId && !userEmail) {
      set({ prices: {} });
      return;
    }
    set({ loading: true });
    const fetched = await getCustomerHorecaPrices(userId, userEmail);
    set({ prices: fetched, loading: false });
  },

  updatePrice: async (userId: string, productId: string, price: number, productName?: string, userEmail?: string) => {
    await saveCustomerHorecaPrice(userId, productId, price, productName, userEmail);
    set(state => ({
      prices: { ...state.prices, [productId]: price }
    }));
  }
}));
