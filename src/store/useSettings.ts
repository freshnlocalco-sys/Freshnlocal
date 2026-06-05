import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import toast from 'react-hot-toast';

export interface CategoryImageMapping {
  [category: string]: string;
}

interface SettingsState {
  categoryImages: CategoryImageMapping;
  lastFetched: number;
  loading: boolean;
  error: string | null;
  fetchCategoryImages: (force?: boolean) => Promise<void>;
  updateCategoryImage: (category: string, url: string) => Promise<void>;
}

const CACHE_TIME = 1000 * 60 * 5; // 5 minutes

export const useSettings = create<SettingsState>((set, get) => ({
  categoryImages: {},
  lastFetched: 0,
  loading: false,
  error: null,
  fetchCategoryImages: async (force = false) => {
    const { lastFetched, loading } = get();
    if (loading) return; 
    
    if (!force && (Date.now() - lastFetched) < CACHE_TIME) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const docRef = doc(db, 'settings', 'categoryImages');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        set({ categoryImages: docSnap.data() as CategoryImageMapping, lastFetched: Date.now(), loading: false });
      } else {
        set({ categoryImages: {}, lastFetched: Date.now(), loading: false });
      }
    } catch (error: any) {
      if (isQuotaError(error)) {
        const errorMsg = error?.message || String(error);
        set({ error: errorMsg, loading: false });
      } else {
        set({ loading: false });
        handleFirestoreError(error, OperationType.GET, 'settings/categoryImages');
      }
    }
  },
  updateCategoryImage: async (category: string, url: string) => {
    try {
      const normalizedCategory = category.toLowerCase().replace(/ font-bold/gi, '');
      const currentImages = get().categoryImages;
      const newImages = { ...currentImages, [normalizedCategory]: url };
      
      const docRef = doc(db, 'settings', 'categoryImages');
      await setDoc(docRef, newImages, { merge: true });
      
      set({ categoryImages: newImages });
      toast.success('Category image updated successfully');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/categoryImages');
      throw error;
    }
  }
}));
