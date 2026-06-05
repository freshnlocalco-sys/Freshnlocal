import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import toast from 'react-hot-toast';

export interface CategoryImageMapping {
  [category: string]: string;
}

export interface JuiceCategory {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  bgLight: string;
}

interface SettingsState {
  categoryImages: CategoryImageMapping;
  productCategories: string[];
  juiceCategories: JuiceCategory[];
  lastFetched: number;
  loading: boolean;
  error: string | null;
  fetchCategoryImages: (force?: boolean) => Promise<void>;
  updateCategoryImage: (category: string, url: string) => Promise<void>;
  addProductCategory: (categoryName: string, imageUrl?: string) => Promise<void>;
  addJuiceCategory: (name: string, tagline: string, imageUrl?: string) => Promise<void>;
}

const CACHE_TIME = 1000 * 60 * 5; // 5 minutes

export const DEFAULT_PRODUCT_CATEGORIES = [
  'Indian Fruits',
  'Exotic Fruits',
  'Exotic Vegetables',
  'Herbs & Seasoning',
  'Fresh & Hygenic Cut Fruits and Vegetables',
  'Imported / Super Exotic Vegetables',
  'Leafy Greens',
  'Frozen Items',
  'Mushrooms'
];

export const DEFAULT_JUICE_SECTIONS: JuiceCategory[] = [
  { id: 'cold-pressed', name: 'Cold Pressed Juices', tagline: '100% natural raw hydraulic squeeze', accent: '#f97316', bgLight: 'bg-orange-500/5' },
  { id: 'detox', name: 'Detox Juices', tagline: 'Power cell cleansing & skin illumination', accent: '#dc2626', bgLight: 'bg-red-500/5' },
  { id: 'satvik', name: 'Satvik', tagline: 'Yogic hydration, cooling botanical remedies', accent: '#059669', bgLight: 'bg-emerald-500/5' },
  { id: 'smoothies', name: 'Sugar Free Smoothies', tagline: 'Rich avocado, Greek yogurt & kesar whip', accent: '#8b5cf6', bgLight: 'bg-purple-500/5' },
  { id: 'sweet-cravings', name: 'Sweet Cravings', tagline: 'Saffron badam thandai & velvet shakes', accent: '#ec4899', bgLight: 'bg-pink-500/5' },
  { id: 'special', name: 'Our Special', tagline: 'Stunning Matcha & Rose nectar layers', accent: '#0284c7', bgLight: 'bg-sky-500/5' }
];

export const useSettings = create<SettingsState>((set, get) => ({
  categoryImages: {},
  productCategories: DEFAULT_PRODUCT_CATEGORIES,
  juiceCategories: DEFAULT_JUICE_SECTIONS,
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
      // 1. Fetch category images
      const docRef = doc(db, 'settings', 'categoryImages');
      const docSnap = await getDoc(docRef);
      const imagesData = docSnap.exists() ? (docSnap.data() as CategoryImageMapping) : {};

      // 2. Fetch dyn categories list
      const catRef = doc(db, 'settings', 'categoriesConfig');
      const catSnap = await getDoc(catRef);
      let prodCats = DEFAULT_PRODUCT_CATEGORIES;
      let juiceCats = DEFAULT_JUICE_SECTIONS;

      if (catSnap.exists()) {
        const catData = catSnap.data();
        if (catData.productCategories) prodCats = catData.productCategories;
        if (catData.juiceCategories) juiceCats = catData.juiceData || catData.juiceCategories;
      }

      set({ 
        categoryImages: imagesData, 
        productCategories: prodCats,
        juiceCategories: juiceCats,
        lastFetched: Date.now(), 
        loading: false 
      });
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
  },
  addProductCategory: async (categoryName: string, imageUrl?: string) => {
    try {
      const current = get().productCategories;
      const normalizedNew = categoryName.trim();
      if (!normalizedNew) {
        toast.error('Category name cannot be empty');
        return;
      }
      if (current.map(c => c.toLowerCase()).includes(normalizedNew.toLowerCase())) {
        toast.error('Product category already exists');
        return;
      }
      
      const updated = [...current, normalizedNew];
      const docRef = doc(db, 'settings', 'categoriesConfig');
      await setDoc(docRef, { productCategories: updated }, { merge: true });
      
      if (imageUrl) {
        const normalizedImgKey = normalizedNew.toLowerCase().replace(/ font-bold/gi, '');
        const imgRef = doc(db, 'settings', 'categoryImages');
        await setDoc(imgRef, { [normalizedImgKey]: imageUrl }, { merge: true });
        
        set(state => ({
          categoryImages: { ...state.categoryImages, [normalizedImgKey]: imageUrl }
        }));
      }

      set({ productCategories: updated });
      toast.success(`Category "${normalizedNew}" added successfully`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/categoriesConfig');
      throw error;
    }
  },
  addJuiceCategory: async (name: string, tagline: string, imageUrl?: string) => {
    try {
      const current = get().juiceCategories;
      const normalizedName = name.trim();
      const normalizedTagline = tagline.trim();
      if (!normalizedName) {
        toast.error('Juice category name cannot be empty');
        return;
      }
      
      const id = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      if (current.some(c => c.id === id || c.name.toLowerCase() === normalizedName.toLowerCase())) {
        toast.error('Juice category already exists');
        return;
      }
      
      const newCat: JuiceCategory = {
        id,
        name: normalizedName,
        tagline: normalizedTagline || 'Refreshing raw handcrafted juice brew',
        accent: '#059669',
        bgLight: 'bg-emerald-500/5'
      };

      const updated = [...current, newCat];
      const docRef = doc(db, 'settings', 'categoriesConfig');
      await setDoc(docRef, { juiceData: updated }, { merge: true });

      if (imageUrl) {
        const normalizedImgKey = normalizedName.toLowerCase().replace(/ font-bold/gi, '');
        const imgRef = doc(db, 'settings', 'categoryImages');
        await setDoc(imgRef, { [normalizedImgKey]: imageUrl }, { merge: true });
        
        set(state => ({
          categoryImages: { ...state.categoryImages, [normalizedImgKey]: imageUrl }
        }));
      }

      set({ juiceCategories: updated });
      toast.success(`Juice subcategory "${normalizedName}" added successfully`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/categoriesConfig');
      throw error;
    }
  }
}));
