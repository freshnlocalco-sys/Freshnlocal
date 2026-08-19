import { create } from 'zustand';
import { getCustomerHorecaPrices, saveCustomerHorecaPrice } from '../lib/horecaPrices';
import { cacheManager } from '../lib/cacheManager';

interface HorecaPricesState {
  prices: Record<string, any>;
  loading: boolean;
  lastFetchedUserId: string | null;
  lastFetchedTime: number;
  loadPrices: (userId: string, userEmail?: string, force?: boolean) => Promise<void>;
  updatePrice: (userId: string, productId: string, price: number, productName?: string, userEmail?: string, unit?: string) => Promise<void>;
}

// In-flight promise to prevent concurrent duplicate network queries
let inFlightFetch: Promise<Record<string, any>> | null = null;

const getCachedPrices = (key: string): Record<string, any> => {
  if (!key) return {};
  return cacheManager.get<Record<string, any>>(`horeca_prices_${key}`, true) || {};
};

export const useHorecaPrices = create<HorecaPricesState>((set, get) => ({
  prices: {},
  loading: false,
  lastFetchedUserId: null,
  lastFetchedTime: 0,
  
  loadPrices: async (userId: string, userEmail?: string, force = false) => {
    const userKey = (userId || userEmail || '').toLowerCase().trim();
    if (!userKey) {
      set({ prices: {} });
      return;
    }

    const { lastFetchedUserId, lastFetchedTime, prices } = get();
    const now = Date.now();
    const isSameUser = lastFetchedUserId === userKey;
    const isFresh = isSameUser && (now - lastFetchedTime < 5 * 60 * 1000) && Object.keys(prices).length > 0;

    // If data is fresh and not forced, return immediately
    if (isFresh && !force) {
      return;
    }

    // 1. Instant hydration from local cache if current in-memory is empty
    if (Object.keys(prices).length === 0 || !isSameUser) {
      const cached = getCachedPrices(userKey);
      if (Object.keys(cached).length > 0) {
        set({ prices: cached, lastFetchedUserId: userKey });
      }
    }

    // 2. Reuse in-flight promise if already loading
    if (inFlightFetch) {
      try {
        const result = await inFlightFetch;
        set({ prices: result, loading: false, lastFetchedUserId: userKey, lastFetchedTime: Date.now() });
      } catch {
        // silent
      }
      return;
    }

    set({ loading: Object.keys(get().prices).length === 0 });

    // 3. Fetch deduplicated
    inFlightFetch = getCustomerHorecaPrices(userId, userEmail);
    try {
      const fetched = await inFlightFetch;
      cacheManager.set(`horeca_prices_${userKey}`, fetched);
      set({ prices: fetched, loading: false, lastFetchedUserId: userKey, lastFetchedTime: Date.now() });
    } catch (err) {
      console.warn("Could not fetch HoReCa prices:", err);
      set({ loading: false });
    } finally {
      inFlightFetch = null;
    }
  },

  updatePrice: async (userId: string, productId: string, price: number, productName?: string, userEmail?: string, unit?: string) => {
    const userKey = (userId || userEmail || '').toLowerCase().trim();
    const updatedPrices = { ...get().prices, [productId]: price };
    if (productName) {
      updatedPrices[productName.trim()] = price;
      updatedPrices[productName.toLowerCase().trim()] = price;
    }
    if (unit) {
      updatedPrices[`${productId}-${unit}`] = price;
      if (productName) {
        updatedPrices[`${productName.trim()}-${unit}`] = price;
      }
    }
    set({ prices: updatedPrices });
    if (userKey) {
      cacheManager.set(`horeca_prices_${userKey}`, updatedPrices);
    }
    await saveCustomerHorecaPrice(userId, productId, price, productName, userEmail, unit);
  }
}));
