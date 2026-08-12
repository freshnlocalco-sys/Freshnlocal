import { create } from 'zustand';
import { getCustomerHorecaPrices, saveCustomerHorecaPrice } from '../lib/horecaPrices';

interface HorecaPricesState {
  prices: Record<string, number>;
  loading: boolean;
  loadPrices: (userId: string) => Promise<void>;
  updatePrice: (userId: string, productId: string, price: number, productName?: string) => Promise<void>;
}

export const useHorecaPrices = create<HorecaPricesState>((set) => ({
  prices: {},
  loading: false,
  loadPrices: async (userId: string) => {
    if (!userId) {
      set({ prices: {} });
      return;
    }
    set({ loading: true });
    const fetched = await getCustomerHorecaPrices(userId);
    set({ prices: fetched, loading: false });
  },
  updatePrice: async (userId: string, productId: string, price: number, productName?: string) => {
    await saveCustomerHorecaPrice(userId, productId, price, productName);
    set(state => ({
      prices: { ...state.prices, [productId]: price }
    }));
  }
}));
