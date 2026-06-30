import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isQuotaError, handleFirestoreError, OperationType } from '../lib/firebase';
import { cacheManager, trackFirestoreRead } from '../lib/cacheManager';
import { updateFaviconInDOM } from '../lib/utils';
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
  editProductCategory: (oldCategoryName: string, newCategoryName: string) => Promise<void>;
  addJuiceCategory: (name: string, tagline: string, imageUrl?: string) => Promise<void>;
  deleteProductCategory: (categoryName: string) => Promise<void>;
  deleteJuiceCategory: (id: string, name: string) => Promise<void>;
  reorderProductCategories: (newOrder: string[]) => Promise<void>;
  reorderJuiceCategories: (newOrder: JuiceCategory[]) => Promise<void>;
  faviconUrl: string | null;
  fetchFavicon: () => Promise<void>;
  updateFavicon: (url: string | null) => Promise<void>;
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
  faviconUrl: null,
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
  editProductCategory: async (oldCategoryName: string, newCategoryName: string) => {
    try {
      const current = get().productCategories;
      const normalizedOld = oldCategoryName.trim();
      const normalizedNew = newCategoryName.trim();
      
      if (!normalizedNew) {
        throw new Error('New category name cannot be empty');
      }

      let updated;
      if (normalizedOld.toLowerCase() === normalizedNew.toLowerCase()) {
         // Case change only
         updated = current.map(c => c === oldCategoryName ? normalizedNew : c);
      } else if (current.some(c => c && c.toLowerCase() === normalizedNew.toLowerCase())) {
         // Target already exists! Remove the old one instead of renaming to avoid duplicates
         updated = current.filter(c => c !== oldCategoryName);
      } else {
         updated = current.map(c => c === oldCategoryName ? normalizedNew : c);
      }
      
      const docRef = doc(db, 'settings', 'categoriesConfig');
      await setDoc(docRef, { productCategories: updated }, { merge: true });
      cacheManager.set('productCategories', updated);
      
      // We also update categoryImages to copy over the old image to the new key
      const oldKey = normalizedOld.toLowerCase().replace(/ font-bold/gi, '').trim();
      const newKey = normalizedNew.toLowerCase().replace(/ font-bold/gi, '').trim();
      
      const currentImages = get().categoryImages;
      if (currentImages[oldKey]) {
        const oldImg = currentImages[oldKey];
        const newImages = { ...currentImages };
        
        // Remove old keys
        delete newImages[oldKey];
        const oldSingular = oldKey.endsWith('s') ? oldKey.slice(0, -1) : oldKey;
        const oldPlural = oldKey.endsWith('s') ? oldKey : oldKey + 's';
        delete newImages[oldSingular];
        delete newImages[oldPlural];
        
        // Add new keys
        newImages[newKey] = oldImg;
        const newSingular = newKey.endsWith('s') ? newKey.slice(0, -1) : newKey;
        const newPlural = newKey.endsWith('s') ? newKey : newKey + 's';
        newImages[newSingular] = oldImg;
        newImages[newPlural] = oldImg;
        
        const imgRef = doc(db, 'settings', 'categoryImages');
        await setDoc(imgRef, newImages);
        cacheManager.set('categoryImages', newImages);
        set({ categoryImages: newImages });
      }

      set({ productCategories: updated });
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
  fetchFavicon: async () => {
    try {
      const docRef = doc(db, 'settings', 'branding');
      const docSnap = await getDoc(docRef);
      trackFirestoreRead('settings', 1);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const faviconUrl = data.faviconUrl || null;
        set({ faviconUrl });
        updateFaviconInDOM(faviconUrl);
        if (faviconUrl && 'caches' in window) {
          caches.open('fnl-branding')
            .then(async (cache) => {
              await cache.put('/branding-icon-url', new Response(faviconUrl));
              try {
                const cachedImg = await cache.match('/branding-icon-image');
                if (!cachedImg) {
                  const imgResponse = await fetch(faviconUrl);
                  if (imgResponse.ok) {
                    await cache.put('/branding-icon-image', imgResponse);
                  }
                }
              } catch (imgErr) {
                console.warn("Failed to pre-cache branding icon image:", imgErr);
              }
            })
            .catch(err => console.warn("Failed to cache favicon URL:", err));
        }
      } else {
        set({ faviconUrl: null });
        updateFaviconInDOM(null);
      }
    } catch (error) {
      console.warn("Could not fetch favicon settings", error);
    }
  },
  updateFavicon: async (url: string | null) => {
    try {
      const docRef = doc(db, 'settings', 'branding');
      await setDoc(docRef, { faviconUrl: url }, { merge: true });
      set({ faviconUrl: url });
      updateFaviconInDOM(url);
      if ('caches' in window) {
        caches.open('fnl-branding')
          .then(async (cache) => {
            if (url) {
              await cache.put('/branding-icon-url', new Response(url));
              try {
                const imgResponse = await fetch(url);
                if (imgResponse.ok) {
                  await cache.put('/branding-icon-image', imgResponse);
                }
              } catch (imgErr) {
                console.warn("Failed to pre-cache updated branding icon image:", imgErr);
              }
            } else {
              await cache.delete('/branding-icon-url');
              await cache.delete('/branding-icon-image');
            }
          })
          .catch(err => console.warn("Failed to update cache favicon URL:", err));
      }
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/branding');
      throw error;
    }
  },
}));
