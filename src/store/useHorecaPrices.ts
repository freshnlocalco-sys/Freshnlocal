import { create } from 'zustand';
import { getCustomerHorecaPrices, saveCustomerHorecaPrice } from '../lib/horecaPrices';

interface HorecaPricesState {
  prices: Record<string, number>;
  loading: boolean;
  loadPrices: (userId: string, userEmail?: string) => Promise<void>;
  updatePrice: (userId: string, productId: string, price: number, productName?: string, userEmail?: string) => Promise<void>;
}

export const useHorecaPrices = create<HorecaPricesState>((set) => ({
  prices: {},
  loading: false,
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
