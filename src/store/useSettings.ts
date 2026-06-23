import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import { cacheManager, trackFirestoreRead } from '../lib/cacheManager';
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
  deleteProductCategory: (categoryName: string) => Promise<void>;
  deleteJuiceCategory: (id: string, name: string) => Promise<void>;
  reorderProductCategories: (newOrder: string[]) => Promise<void>;
  reorderJuiceCategories: (newOrder: JuiceCategory[]) => Promise<void>;
}

export const DEFAULT_PRODUCT_CATEGORIES = [
  'In Season Fruits',
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

interface CropSettings {
  targetWidth: number;
  targetHeight: number;
  quality: number;
  cropSquare: boolean;
}

export const useSettings = create<SettingsState>((set, get) => ({
  categoryImages: {},
  productCategories: DEFAULT_PRODUCT_CATEGORIES,
  juiceCategories: DEFAULT_JUICE_SECTIONS,
  lastFetched: 0,
  loading: false,
  error: null,
  fetchCategoryImages: async (force = false) => {
    const { categoryImages, lastFetched } = get();
    
    // 1. Avoid re-fetching if data already exists in the Zustand store and not forced
    if (!force && lastFetched > 0 && Object.keys(categoryImages).length > 0) {
      return;
    }

    // 2. Load from localStorage immediately if cache exists (supports SWR instantly)
    const cachedImages = cacheManager.get<CategoryImageMapping>('categoryImages', true);
    const cachedProdCats = cacheManager.get<string[]>('productCategories', true);
    const cachedJuiceCats = cacheManager.get<JuiceCategory[]>('juiceCategories', true);

    if (cachedImages) {
      set({ categoryImages: cachedImages });
    }
    if (cachedProdCats) {
      set({ productCategories: cachedProdCats });
    }
    if (cachedJuiceCats) {
      set({ juiceCategories: cachedJuiceCats });
    }

    // 3. See if the cache is unexpired (< 24 hours) and we aren't forcing
    // 3. See if the cache is unexpired (< 24 hours) and we aren't forcing
    const isCacheFresh = cacheManager.isValid('categoryImages') && cacheManager.isValid('productCategories') && cacheManager.isValid('juiceCategories');
    if (!force && isCacheFresh && cachedImages && cachedProdCats && cachedJuiceCats) {
      set({ lastFetched: Date.now() }); // Hot state: keep lastFetched mark to prevent subsequent local checks
      return;
    }

    // 4. Trigger deduplicated background/foreground fetch from Firestore
    const isBackgroundRefresh = !!(cachedImages && cachedProdCats && cachedJuiceCats);
    if (!isBackgroundRefresh) {
      set({ loading: true, error: null });
    }

    await cacheManager.fetchDeduplicated('category_images_config_fetch', async () => {
      try {
        // Fetch 1: Category Images
        const docRef = doc(db, 'settings', 'categoryImages');
        const docSnap = await getDoc(docRef);
        trackFirestoreRead('settings', 1);
        const imagesData = docSnap.exists() ? (docSnap.data() as CategoryImageMapping) : {};

        // Fetch 2: Categories configuration
        const catRef = doc(db, 'settings', 'categoriesConfig');
        const catSnap = await getDoc(catRef);
        trackFirestoreRead('settings', 1);
        let prodCats = DEFAULT_PRODUCT_CATEGORIES;
        let juiceCats = DEFAULT_JUICE_SECTIONS;

        if (catSnap.exists()) {
          const catData = catSnap.data();
          if (catData.productCategories) {
            prodCats = catData.productCategories;
          }
          if (catData.juiceCategories || catData.juiceData) {
            juiceCats = catData.juiceData || catData.juiceCategories;
          }
        }

        // Save back to cache
        cacheManager.set('categoryImages', imagesData);
        cacheManager.set('productCategories', prodCats);
        cacheManager.set('juiceCategories', juiceCats);

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
          if (!isBackgroundRefresh) {
            handleFirestoreError(error, OperationType.GET, 'settings/categoryImages');
          } else {
            console.warn("Background update of settings failed safely:", error);
          }
        }
      }
    });
  },
  updateCategoryImage: async (category: string, url: string) => {
    try {
      const normalizedCategory = category.toLowerCase().replace(/ font-bold/gi, '').trim();
      const currentImages = get().categoryImages;
      
      // Utilize raw original URL without downscaling or compression
      const finalUrl = url;

      const newImages = { ...currentImages, [normalizedCategory]: finalUrl };
      
      // Handle singular and plural matches so both work seamlessly
      const singularKey = normalizedCategory.endsWith('s') ? normalizedCategory.slice(0, -1) : normalizedCategory;
      const pluralKey = normalizedCategory.endsWith('s') ? normalizedCategory : normalizedCategory + 's';
      newImages[singularKey] = finalUrl;
      newImages[pluralKey] = finalUrl;
      
      const docRef = doc(db, 'settings', 'categoryImages');
      await setDoc(docRef, newImages, { merge: true });
      
      cacheManager.set('categoryImages', newImages);
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
      if (current.map(c => c ? c.toLowerCase().trim() : '').includes(normalizedNew.toLowerCase())) {
        toast.error('Product category already exists');
        return;
      }
      
      const updated = [...current, normalizedNew];
      const docRef = doc(db, 'settings', 'categoriesConfig');
      await setDoc(docRef, { productCategories: updated }, { merge: true });
      
      cacheManager.set('productCategories', updated);
      
      if (imageUrl) {
        const finalUrl = imageUrl;
        const normalizedImgKey = normalizedNew.toLowerCase().replace(/ font-bold/gi, '').trim();
        const imgRef = doc(db, 'settings', 'categoryImages');
        const imgUpdate: Record<string, string> = { [normalizedImgKey]: finalUrl };
        
        // Populate singular/plural in image config
        const singularKey = normalizedImgKey.endsWith('s') ? normalizedImgKey.slice(0, -1) : normalizedImgKey;
        const pluralKey = normalizedImgKey.endsWith('s') ? normalizedImgKey : normalizedImgKey + 's';
        imgUpdate[singularKey] = finalUrl;
        imgUpdate[pluralKey] = finalUrl;

        await setDoc(imgRef, imgUpdate, { merge: true });
        
        const newImages = { ...get().categoryImages, ...imgUpdate };
        cacheManager.set('categoryImages', newImages);
        set({ categoryImages: newImages });
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
      if (current.some(c => c.id === id || (c.name && c.name.toLowerCase() === normalizedName.toLowerCase()))) {
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

      cacheManager.set('juiceCategories', updated);

      if (imageUrl) {
        const finalUrl = imageUrl;
        const normalizedImgKey = normalizedName.toLowerCase().replace(/ font-bold/gi, '');
        const imgRef = doc(db, 'settings', 'categoryImages');
        const imgUpdate: Record<string, string> = { [normalizedImgKey]: finalUrl };
        
        // Populate singular/plural in image config
        const singularKey = normalizedImgKey.endsWith('s') ? normalizedImgKey.slice(0, -1) : normalizedImgKey;
        const pluralKey = normalizedImgKey.endsWith('s') ? normalizedImgKey : normalizedImgKey + 's';
        imgUpdate[singularKey] = finalUrl;
        imgUpdate[pluralKey] = finalUrl;

        await setDoc(imgRef, imgUpdate, { merge: true });
        
        const newImages = { ...get().categoryImages, ...imgUpdate };
        cacheManager.set('categoryImages', newImages);
        set({ categoryImages: newImages });
      }

      set({ juiceCategories: updated });
      toast.success(`Juice subcategory "${normalizedName}" added successfully`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/categoriesConfig');
      throw error;
    }
  },
  deleteProductCategory: async (categoryName: string) => {
    try {
      const current = get().productCategories;
      const normalizedName = categoryName.trim();
      const updated = current.filter(c => c && c.toLowerCase().trim() !== normalizedName.toLowerCase());
      
      const docRef = doc(db, 'settings', 'categoriesConfig');
      await setDoc(docRef, { productCategories: updated }, { merge: true });
      
      // Clean up image references from state and database
      const normalizedImgKey = normalizedName.toLowerCase().replace(/ font-bold/gi, '').trim();
      const currentImages = get().categoryImages;
      const newImages = { ...currentImages };
      
      delete newImages[normalizedImgKey];
      const singularKey = normalizedImgKey.endsWith('s') ? normalizedImgKey.slice(0, -1) : normalizedImgKey;
      const pluralKey = normalizedImgKey.endsWith('s') ? normalizedImgKey : normalizedImgKey + 's';
      delete newImages[singularKey];
      delete newImages[pluralKey];

      const imgRef = doc(db, 'settings', 'categoryImages');
      await setDoc(imgRef, newImages);

      cacheManager.set('productCategories', updated);
      cacheManager.set('categoryImages', newImages);

      set({ 
        productCategories: updated,
        categoryImages: newImages
      });
      toast.success(`Category "${categoryName}" deleted successfully`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/categoriesConfig');
      throw error;
    }
  },
  deleteJuiceCategory: async (id: string, name: string) => {
    try {
      const current = get().juiceCategories;
      const updated = current.filter(c => c.id !== id);
      
      const docRef = doc(db, 'settings', 'categoriesConfig');
      await setDoc(docRef, { juiceData: updated }, { merge: true });
      
      // Clean up image associations if any
      const normalizedImgKey = name.toLowerCase().replace(/ font-bold/gi, '').trim();
      const currentImages = get().categoryImages;
      const newImages = { ...currentImages };
      
      delete newImages[normalizedImgKey];
      const singularKey = normalizedImgKey.endsWith('s') ? normalizedImgKey.slice(0, -1) : normalizedImgKey;
      const pluralKey = normalizedImgKey.endsWith('s') ? normalizedImgKey : normalizedImgKey + 's';
      delete newImages[singularKey];
      delete newImages[pluralKey];

      const imgRef = doc(db, 'settings', 'categoryImages');
      await setDoc(imgRef, newImages);

      cacheManager.set('juiceCategories', updated);
      cacheManager.set('categoryImages', newImages);

      set({ 
        juiceCategories: updated,
        categoryImages: newImages
      });
      toast.success(`Juice subcategory "${name}" deleted successfully`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/categoriesConfig');
      throw error;
    }
  },
  reorderProductCategories: async (newOrder: string[]) => {
    try {
      const docRef = doc(db, 'settings', 'categoriesConfig');
      await setDoc(docRef, { productCategories: newOrder }, { merge: true });
      cacheManager.set('productCategories', newOrder);
      set({ productCategories: newOrder });
    } catch (error: any) {
      toast.error('Failed to reorder categories');
      throw error;
    }
  },
  reorderJuiceCategories: async (newOrder: JuiceCategory[]) => {
    try {
      const docRef = doc(db, 'settings', 'juiceCategories');
      await setDoc(docRef, { categories: newOrder }, { merge: true });
      cacheManager.set('juiceCategories', newOrder);
      set({ juiceCategories: newOrder });
    } catch (error: any) {
      toast.error('Failed to reorder juice menu');
      throw error;
    }
  },
}));
