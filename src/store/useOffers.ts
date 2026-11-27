import { create } from 'zustand';
import { doc, getDoc } from 'firebase/firestore';
import { setDocMirrored } from '../lib/mirrorToSupabase';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import { cacheManager, trackFirestoreRead, trackSupabaseRead } from '../lib/cacheManager';
import { usingSupabaseCatalogue } from '../lib/supabase';
import { fetchWebSetting } from '../lib/webSettings';
import toast from 'react-hot-toast';

export interface GiftItem {
  id: string;
  productId?: string;
  name: string;
  unit: string;
  imageUrl: string;
  originalPrice: number;
}

export type GiftRewardType = 'all' | 'choice';

export interface FreeGiftOffer {
  enabled: boolean;
  title: string;
  description: string;
  minOrderAmount: number;
  deliveryMethodRequired: 'delivery' | 'pickup' | 'any';
  rewardType: GiftRewardType;
  maxChoices: number;
  giftItems: GiftItem[];
  giftItemName?: string;
  giftItemUnit?: string;
  giftItemImageUrl?: string;
  giftItemOriginalPrice?: number;
  bannerText: string;
  showTopBanner: boolean;
  giftProductId?: string;
  updatedAt?: number;
}

export function getEffectiveGiftItems(offer?: Partial<FreeGiftOffer> | null): GiftItem[] {
  if (!offer) return [];
  if (Array.isArray(offer.giftItems) && offer.giftItems.length > 0) {
    return offer.giftItems;
  }
  if (offer.giftItemName) {
    return [{
      id: offer.giftProductId || 'legacy-gift-item',
      productId: offer.giftProductId,
      name: offer.giftItemName,
      unit: offer.giftItemUnit || '1 Pc',
      imageUrl: offer.giftItemImageUrl || '',
      originalPrice: offer.giftItemOriginalPrice || 0,
    }];
  }
  return [];
}

export const DEFAULT_FREE_GIFT_OFFER: FreeGiftOffer = {
  enabled: true,
  title: '',
  description: '',
  minOrderAmount: 1000,
  deliveryMethodRequired: 'delivery',
  rewardType: 'choice',
  maxChoices: 1,
  giftItems: [],
  giftItemName: '',
  giftItemUnit: '1 Pc',
  giftItemImageUrl: '',
  giftItemOriginalPrice: 0,
  bannerText: '',
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
    id: 'avocado_or_strawberry',
    label: 'Choose 1: Avocado OR Strawberries (₹1000+)',
    icon: '🍓',
    offer: {
      title: 'Free Avocado or Fresh Strawberries Offer',
      description: 'Choose 1 Free Gift (Fresh Avocado or Sweet Strawberries) on all Home Delivery orders of ₹1000 or more!',
      minOrderAmount: 1000,
      deliveryMethodRequired: 'delivery',
      rewardType: 'choice',
      maxChoices: 1,
      giftItems: [
        {
          id: 'gift-avocado',
          name: 'Fresh Avocado',
          unit: '1 Pc',
          imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
          originalPrice: 140,
        },
        {
          id: 'gift-strawberry',
          name: 'Fresh Sweet Strawberries',
          unit: '1 Box (200g)',
          imageUrl: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=600&auto=format&fit=crop&q=80',
          originalPrice: 130,
        }
      ],
      bannerText: '🍓 SPECIAL OFFER: Choose 1 Free Avocado or Sweet Strawberries on Home Delivery orders of ₹1000+!',
      showTopBanner: true,
    }
  },
  {
    id: 'pick_2_of_4',
    label: 'Choose 2 of 4: Avocado, Berries, Dragon Fruit, Juice (₹1500+)',
    icon: '🎁',
    offer: {
      title: 'Pick Any 2 Free Gifts from 4 Fresh Delights',
      description: 'Choose any 2 Free Gifts from Avocado, Strawberries, Pink Dragon Fruit, or Cold-Pressed Juice on orders of ₹1500+!',
      minOrderAmount: 1500,
      deliveryMethodRequired: 'delivery',
      rewardType: 'choice',
      maxChoices: 2,
      giftItems: [
        {
          id: 'gift-avocado',
          name: 'Fresh Avocado',
          unit: '1 Pc',
          imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
          originalPrice: 140,
        },
        {
          id: 'gift-strawberry',
          name: 'Fresh Sweet Strawberries',
          unit: '1 Box (200g)',
          imageUrl: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=600&auto=format&fit=crop&q=80',
          originalPrice: 130,
        },
        {
          id: 'gift-dragonfruit',
          name: 'Exotic Pink Dragon Fruit',
          unit: '1 Pc',
          imageUrl: 'https://images.unsplash.com/photo-1527325678964-54921661f888?w=600&auto=format&fit=crop&q=80',
          originalPrice: 160,
        },
        {
          id: 'gift-juice',
          name: 'Cold-Pressed Valencia Orange Juice',
          unit: '250 ml Bottle',
          imageUrl: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80',
          originalPrice: 150,
        }
      ],
      bannerText: '🎁 SPECIAL OFFER: Pick any 2 Free Gifts on orders of ₹1500+!',
      showTopBanner: true,
    }
  },
  {
    id: 'both_avocado_dragon',
    label: 'Both Free: Avocado + Dragon Fruit (All 2 Free ₹1500+)',
    icon: '🥑',
    offer: {
      title: 'Double Free Gift: Avocado + Dragon Fruit',
      description: 'Get BOTH 1 Fresh Avocado AND 1 Pink Dragon Fruit 100% FREE on Home Delivery orders of ₹1500 or more!',
      minOrderAmount: 1500,
      deliveryMethodRequired: 'delivery',
      rewardType: 'all',
      maxChoices: 2,
      giftItems: [
        {
          id: 'gift-avocado',
          name: 'Fresh Avocado',
          unit: '1 Pc',
          imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
          originalPrice: 140,
        },
        {
          id: 'gift-dragonfruit',
          name: 'Exotic Pink Dragon Fruit',
          unit: '1 Pc',
          imageUrl: 'https://images.unsplash.com/photo-1527325678964-54921661f888?w=600&auto=format&fit=crop&q=80',
          originalPrice: 160,
        }
      ],
      bannerText: '🥑 SPECIAL OFFER: Get BOTH Free Avocado + Dragon Fruit on orders above ₹1500!',
      showTopBanner: true,
    }
  },
  {
    id: 'single_avocado',
    label: '1 Free Avocado (₹1000+ Delivery)',
    icon: '🥑',
    offer: {
      title: 'Free Fresh Avocado Offer',
      description: 'Get 1 Free Fresh Avocado on all Home Delivery orders of ₹1000 or more!',
      minOrderAmount: 1000,
      deliveryMethodRequired: 'delivery',
      rewardType: 'all',
      maxChoices: 1,
      giftItems: [
        {
          id: 'gift-avocado',
          name: 'Fresh Avocado',
          unit: '1 Pc',
          imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
          originalPrice: 140,
        }
      ],
      bannerText: '🥑 SPECIAL OFFER: Get 1 Free Avocado on Home Delivery orders of ₹1000+!',
      showTopBanner: true,
    }
  },
  {
    id: 'coconut_and_kiwi',
    label: 'Both Free: Coconut + Kiwi (All 2 Free ₹1200+)',
    icon: '🥥',
    offer: {
      title: 'Free Tender Coconut + Zespri Kiwi Duo',
      description: 'Get BOTH 1 Fresh Tender Coconut and 1 Kiwi Pack FREE on orders of ₹1200 or more!',
      minOrderAmount: 1200,
      deliveryMethodRequired: 'delivery',
      rewardType: 'all',
      maxChoices: 2,
      giftItems: [
        {
          id: 'gift-coconut',
          name: 'Fresh Tender Green Coconut',
          unit: '1 Pc',
          imageUrl: 'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?w=600&auto=format&fit=crop&q=80',
          originalPrice: 75,
        },
        {
          id: 'gift-kiwi',
          name: 'Zespri Green Kiwi',
          unit: '1 Pack (3 Pcs)',
          imageUrl: 'https://images.unsplash.com/photo-1585059895524-72359e06133a?w=600&auto=format&fit=crop&q=80',
          originalPrice: 130,
        }
      ],
      bannerText: '🥥 SPECIAL OFFER: Get Free Tender Coconut + Kiwi Pack on orders above ₹1200!',
      showTopBanner: true,
    }
  }
];

interface OffersState {
  offer: FreeGiftOffer;
  loading: boolean;
  isLoaded: boolean;
  error: string | null;
  lastFetched: number;
  fetchOffer: (force?: boolean) => Promise<void>;
  updateOffer: (updatedData: Partial<FreeGiftOffer>) => Promise<void>;
  applyPreset: (presetId: string) => Promise<void>;
}

export const useOffers = create<OffersState>((set, get) => ({
  offer: DEFAULT_FREE_GIFT_OFFER,
  loading: false,
  isLoaded: false,
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
      // Clear out legacy hardcoded default avocado banner text if still in localStorage cache
      if (
        cachedOffer.bannerText &&
        (cachedOffer.bannerText.includes('Choose 1 Free Avocado') ||
         cachedOffer.bannerText.includes('🥑 SPECIAL OFFER: Choose 1 Free Avocado') ||
         cachedOffer.bannerText.includes('🥑 SPECIAL OFFER: Get 1 Free Avocado'))
      ) {
        cachedOffer.bannerText = '';
      }
      if (cachedOffer.title === 'Free Avocado or Fresh Strawberries Offer') {
        cachedOffer.title = '';
        cachedOffer.giftItems = [];
      }
      set({ offer: { ...DEFAULT_FREE_GIFT_OFFER, ...cachedOffer }, isLoaded: true });
    }

    // 3. Skip network if cache is still fresh (<24h) and not forced
    if (!force && cacheManager.isValid('freeGiftOffer') && cachedOffer) {
      set({ lastFetched: Date.now(), isLoaded: true });
      return;
    }

    const isBackground = !!cachedOffer;
    if (!isBackground) {
      set({ loading: true, error: null });
    }

    await cacheManager.fetchDeduplicated('free_gift_offer_fetch', async () => {
      try {
        let data: Record<string, any> | null;

        if (usingSupabaseCatalogue()) {
          data = await fetchWebSetting('promotions');
          trackSupabaseRead('web_settings', data ? 1 : 0);
        } else {
          const docRef = doc(db, 'settings', 'promotions');
          const docSnap = await getDoc(docRef);
          trackFirestoreRead('settings', 1);
          data = docSnap.exists() ? docSnap.data() : null;
        }

        let finalOffer = DEFAULT_FREE_GIFT_OFFER;
        if (data) {
          finalOffer = {
            ...DEFAULT_FREE_GIFT_OFFER,
            ...data,
          };
          if (!finalOffer.giftItems || finalOffer.giftItems.length === 0) {
            finalOffer.giftItems = getEffectiveGiftItems(finalOffer);
          }
          if (!finalOffer.rewardType) {
            finalOffer.rewardType = 'choice';
          }
          if (!finalOffer.maxChoices) {
            finalOffer.maxChoices = 1;
          }
        }

        cacheManager.set('freeGiftOffer', finalOffer);
        set({
          offer: finalOffer,
          lastFetched: Date.now(),
          loading: false,
          isLoaded: true,
        });
      } catch (error: any) {
        if (isQuotaError(error)) {
          set({ error: error?.message || String(error), loading: false, isLoaded: true });
        } else {
          set({ loading: false, isLoaded: true });
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
      const mergedItems = updatedData.giftItems !== undefined 
        ? updatedData.giftItems 
        : (current.giftItems || getEffectiveGiftItems(current));

      const firstItem = mergedItems[0];

      const nextOffer: FreeGiftOffer = {
        ...current,
        ...updatedData,
        giftItems: mergedItems,
        rewardType: updatedData.rewardType || current.rewardType || 'choice',
        maxChoices: updatedData.maxChoices || current.maxChoices || 1,
        // Backward compatibility
        giftItemName: firstItem ? firstItem.name : (updatedData.giftItemName || current.giftItemName || ''),
        giftItemUnit: firstItem ? firstItem.unit : (updatedData.giftItemUnit || current.giftItemUnit || '1 Pc'),
        giftItemImageUrl: firstItem ? firstItem.imageUrl : (updatedData.giftItemImageUrl || current.giftItemImageUrl || ''),
        giftItemOriginalPrice: firstItem ? firstItem.originalPrice : (updatedData.giftItemOriginalPrice || current.giftItemOriginalPrice || 0),
        giftProductId: firstItem?.productId || updatedData.giftProductId || current.giftProductId,
        updatedAt: Date.now(),
      };

      const docRef = doc(db, 'settings', 'promotions');
      await setDocMirrored(docRef, nextOffer, { merge: true });

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
