import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import { cacheManager, trackFirestoreRead } from '../lib/cacheManager';
import toast from 'react-hot-toast';

export interface FreeGiftOffer {
  enabled: boolean;
  title: string;
  description: string;
  minOrderAmount: number;
  deliveryMethodRequired: 'delivery' | 'pickup' | 'any';
  giftItemName: string;
  giftItemUnit: string;
  giftItemImageUrl: string;
  giftItemOriginalPrice: number;
  bannerText: string;
  showTopBanner: boolean;
  giftProductId?: string;
  updatedAt?: number;
}

export const DEFAULT_FREE_GIFT_OFFER: FreeGiftOffer = {
  enabled: true,
  title: 'Free Fresh Avocado Offer',
  description: 'Get 1 Free Creamy Avocado on all Home Delivery orders of ₹1000 or more!',
  minOrderAmount: 1000,
  deliveryMethodRequired: 'delivery',
  giftItemName: 'Fresh Avocado',
  giftItemUnit: '1 Pc',
  giftItemImageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
  giftItemOriginalPrice: 140,
  bannerText: '🥑 SPECIAL OFFER: Get 1 Free Avocado on Home Delivery orders of ₹1000+!',
  showTopBanner: true,
};

export interface OfferPreset {
  id: string;
  label: string;
  icon: string;
  offer: Partial<FreeGiftOffer>;
}

export const OFFER_PRESETS: OfferPreset[] = [
  {
    id: 'avocado',
    label: '1 Free Avocado (₹1000+ Delivery)',
    icon: '🥑',
    offer: {
      title: 'Free Fresh Avocado Offer',
      description: 'Get 1 Free Fresh Avocado on all Home Delivery orders of ₹1000 or more!',
      minOrderAmount: 1000,
      deliveryMethodRequired: 'delivery',
      giftItemName: 'Fresh Avocado',
      giftItemUnit: '1 Pc',
      giftItemImageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
      giftItemOriginalPrice: 140,
      bannerText: '🥑 SPECIAL OFFER: Get 1 Free Avocado on Home Delivery orders of ₹1000+!',
      showTopBanner: true,
    }
  },
  {
    id: 'juice',
    label: '1 Free Cold-Pressed Juice (₹1200+)',
    icon: '🍹',
    offer: {
      title: 'Free Signature Cold-Pressed Juice',
      description: 'Get 1 Free 100% Raw Cold-Pressed Juice bottle on orders of ₹1200 or more!',
      minOrderAmount: 1200,
      deliveryMethodRequired: 'any',
      giftItemName: 'Cold-Pressed Valencia Orange Juice',
      giftItemUnit: '250 ml Bottle',
      giftItemImageUrl: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80',
      giftItemOriginalPrice: 150,
      bannerText: '🍹 SPECIAL OFFER: Get 1 Free Cold-Pressed Juice on orders above ₹1200!',
      showTopBanner: true,
    }
  },
  {
    id: 'dragonfruit',
    label: '1 Free Exotic Dragon Fruit (₹1500+)',
    icon: '🐉',
    offer: {
      title: 'Free Exotic Pink Dragon Fruit',
      description: 'Get 1 Free Premium Pink Dragon Fruit on Home Delivery orders of ₹1500 or more!',
      minOrderAmount: 1500,
      deliveryMethodRequired: 'delivery',
      giftItemName: 'Exotic Pink Dragon Fruit',
      giftItemUnit: '1 Pc',
      giftItemImageUrl: 'https://images.unsplash.com/photo-1527325678964-54921661f888?w=600&auto=format&fit=crop&q=80',
      giftItemOriginalPrice: 160,
      bannerText: '🐉 SPECIAL OFFER: Get 1 Free Exotic Pink Dragon Fruit on orders above ₹1500!',
      showTopBanner: true,
    }
  },
  {
    id: 'kiwi',
    label: '1 Free Kiwi Pack (₹1000+)',
    icon: '🥝',
    offer: {
      title: 'Free Zespri Kiwi Pack',
      description: 'Get 1 Free Kiwi Pack on all orders above ₹1000!',
      minOrderAmount: 1000,
      deliveryMethodRequired: 'any',
      giftItemName: 'Zespri Green Kiwi',
      giftItemUnit: '1 Pack (3 Pcs)',
      giftItemImageUrl: 'https://images.unsplash.com/photo-1585059895524-72359e06133a?w=600&auto=format&fit=crop&q=80',
      giftItemOriginalPrice: 130,
      bannerText: '🥝 SPECIAL OFFER: Get 1 Free Zespri Kiwi Pack on orders above ₹1000!',
      showTopBanner: true,
    }
  },
  {
    id: 'coconut',
    label: '1 Free Fresh Tender Coconut (₹800+)',
    icon: '🥥',
    offer: {
      title: 'Free Fresh Tender Coconut',
      description: 'Get 1 Free Sweet Green Coconut on orders of ₹800 or more!',
      minOrderAmount: 800,
      deliveryMethodRequired: 'delivery',
      giftItemName: 'Fresh Tender Green Coconut',
      giftItemUnit: '1 Pc',
      giftItemImageUrl: 'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?w=600&auto=format&fit=crop&q=80',
      giftItemOriginalPrice: 75,
      bannerText: '🥥 SPECIAL OFFER: Get 1 Free Fresh Tender Coconut on orders above ₹800!',
      showTopBanner: true,
    }
  }
];

interface OffersState {
  offer: FreeGiftOffer;
  loading: boolean;
  error: string | null;
  lastFetched: number;
  fetchOffer: (force?: boolean) => Promise<void>;
  updateOffer: (updatedData: Partial<FreeGiftOffer>) => Promise<void>;
  applyPreset: (presetId: string) => Promise<void>;
}

export const useOffers = create<OffersState>((set, get) => ({
  offer: DEFAULT_FREE_GIFT_OFFER,
  loading: false,
  error: null,
  lastFetched: 0,

  fetchOffer: async (force = false) => {
    const { lastFetched } = get();

    // 1. Avoid duplicate fetches if already loaded and not forced
    if (!force && lastFetched > 0) {
      return;
    }

    // 2. Load from localStorage cache immediately
    const cachedOffer = cacheManager.get<FreeGiftOffer>('freeGiftOffer', true);
    if (cachedOffer) {
      set({ offer: { ...DEFAULT_FREE_GIFT_OFFER, ...cachedOffer } });
    }

    // 3. Skip network if cache is still fresh (<24h) and not forced
    if (!force && cacheManager.isValid('freeGiftOffer') && cachedOffer) {
      set({ lastFetched: Date.now() });
      return;
    }

    const isBackground = !!cachedOffer;
    if (!isBackground) {
      set({ loading: true, error: null });
    }

    await cacheManager.fetchDeduplicated('free_gift_offer_fetch', async () => {
      try {
        const docRef = doc(db, 'settings', 'promotions');
        const docSnap = await getDoc(docRef);
        trackFirestoreRead('settings', 1);

        let finalOffer = DEFAULT_FREE_GIFT_OFFER;
        if (docSnap.exists()) {
          const data = docSnap.data();
          finalOffer = {
            ...DEFAULT_FREE_GIFT_OFFER,
            ...data,
          };
        }

        cacheManager.set('freeGiftOffer', finalOffer);
        set({
          offer: finalOffer,
          lastFetched: Date.now(),
          loading: false,
        });
      } catch (error: any) {
        if (isQuotaError(error)) {
          set({ error: error?.message || String(error), loading: false });
        } else {
          set({ loading: false });
          if (!isBackground) {
            handleFirestoreError(error, OperationType.GET, 'settings/promotions');
          } else {
            console.warn('Background fetch of promotions failed safely:', error);
          }
        }
      }
    });
  },

  updateOffer: async (updatedData: Partial<FreeGiftOffer>) => {
    try {
      const current = get().offer;
      const nextOffer: FreeGiftOffer = {
        ...current,
        ...updatedData,
        updatedAt: Date.now(),
      };

      const docRef = doc(db, 'settings', 'promotions');
      await setDoc(docRef, nextOffer, { merge: true });

      cacheManager.set('freeGiftOffer', nextOffer);
      set({ offer: nextOffer });
      toast.success('Promotional offer updated successfully!');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/promotions');
      throw error;
    }
  },

  applyPreset: async (presetId: string) => {
    const found = OFFER_PRESETS.find(p => p.id === presetId);
    if (!found) {
      toast.error('Preset not found');
      return;
    }
    await get().updateOffer(found.offer);
    toast.success(`Applied "${found.label}" preset!`);
  }
}));
