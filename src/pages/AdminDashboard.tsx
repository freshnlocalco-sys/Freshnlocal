import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, auth, db, handleFirestoreError, OperationType, isQuotaError, storage, fallbackStorage, AppUser } from '../lib/firebase';
import { collection, query, getDocs, doc, updateDoc, addDoc, deleteDoc, writeBatch, setDoc, getDoc, limit, orderBy } from 'firebase/firestore';
import { ref, uploadString, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Package, Users, ShoppingBag, Plus, Trash2, Upload, Download, Sparkles, Sliders, Check, FileText, Edit2, ChevronDown, ChevronUp, Filter, Calendar, TrendingUp, X, Star, Globe, GripVertical } from 'lucide-react';
import { Product } from '../store/useCart';
import { useSettings } from '../store/useSettings';
import { BrandingSettings } from '../components/BrandingSettings';
import { AUTHENTIC_FNL_JUICES } from './FNLJuice';
import * as XLSX from 'xlsx';
import { getCategoryImage, CATEGORIES } from '../lib/constants';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-400' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-500' },
  { value: 'shipped', label: 'Shipped', color: 'bg-indigo-500' },
  { value: 'delivered', label: 'Delivered', color: 'bg-emerald-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
];

const PICKUP_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-400' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-500' },
  { value: 'ready', label: 'Ready for Pickup', color: 'bg-indigo-500' },
  { value: 'takeaway', label: 'Take Away', color: 'bg-emerald-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
];

class BrandingErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Branding Settings Crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto my-12 p-8 rounded-2xl bg-red-50 border border-red-200 text-left space-y-4">
          <span className="text-red-600 font-mono text-xs uppercase tracking-widest block font-black">⚠️ Rendering Error Boundary Triggered</span>
          <h2 className="text-lg font-black uppercase text-red-900 leading-tight">Branding Settings Load Failure</h2>
          <p className="text-xs text-red-700 font-medium">The branding page failed to render due to a runtime script exception:</p>
          <pre className="text-[10px] font-mono text-red-800 bg-white p-4 rounded-xl border border-red-100 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text">
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all"
          >
            🔄 Reload Dashboard
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

function OrderStatusDropdown({ currentStatus, onStatusChange, isPickup }: { currentStatus: string, onStatusChange: (status: string) => void, isPickup?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const options = isPickup ? PICKUP_STATUS_OPTIONS : STATUS_OPTIONS;
  const currentOption = options.find(o => o.value === currentStatus) || options[0];

  return (
    <div className="relative inline-block text-left w-[130px] sm:w-[150px]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white text-foreground px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-border focus:border-primary transition-colors cursor-pointer flex items-center justify-between shadow-sm outline-none"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${currentOption.color}`}></span>
          {currentOption.label}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform opacity-50 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute z-50 mt-1 w-full rounded-xl bg-white shadow-lg border border-border overflow-hidden">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onStatusChange(option.value);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3.5 py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-black/5 flex items-center gap-2 transition-colors cursor-pointer text-foreground"
              >
                <span className={`w-2 h-2 rounded-full ${option.color}`}></span>
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}



export function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const activeTab = useMemo(() => {
    if (location.pathname.includes('/admin/inventory')) return 'products';
    if (location.pathname.includes('/admin/customers')) return 'customers';
    if (location.pathname.includes('/admin/spotlights')) return 'spotlights';
    if (location.pathname.includes('/admin/categories')) return 'categories';
    if (location.pathname.includes('/admin/reviews')) return 'reviews';
    if (location.pathname.includes('/admin/hero')) return 'hero';
    if (location.pathname.includes('/admin/branding')) return 'branding';
    return 'orders'; // corresponds to consignments
  }, [location.pathname]);
  
  const [diagError, setDiagError] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);

  const [customers, setCustomers] = useState<AppUser[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const q = query(collection(db, 'users'), orderBy('displayName'));
      const snapshot = await getDocs(q);
      import('../lib/cacheManager').then(m => m.trackFirestoreRead('users', snapshot.docs.length)).catch(() => {});
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
      setCustomers(usersData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'customers') {
      fetchCustomers();
    }
  }, [activeTab]);

  const handleToggleHoreca = async (customerUser: AppUser) => {
    if (customerUser.role === 'admin') {
      toast.error('Cannot change admin role');
      return;
    }
    const newRole = customerUser.role === 'horeca' ? 'customer' : 'horeca';
    try {
      await updateDoc(doc(db, 'users', customerUser.uid), { role: newRole });
      setCustomers(customers.map(c => c.uid === customerUser.uid ? { ...c, role: newRole } : c));
      toast.success(`User role updated to ${newRole}`);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };

  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const uploadedUrlsCache = useRef<Record<string, string>>({});
  const [lastUploadTiming, setLastUploadTiming] = useState<{
    fileName: string;
    fileSizeKB: number;
    selectTime: number;
    uploadStartTime: number;
    uploadCompleteTime: number;
    urlRetrievalCompleteTime: number;
    uploadDurationMs: number;
    urlRetrievalDurationMs: number;
    totalUploadDurationMs: number;
  } | null>(null);
  
  const { 
    categoryImages, 
    productCategories, 
    juiceCategories, 
    fetchCategoryImages, 
    updateCategoryImage, 
    addProductCategory, 
    addJuiceCategory, 
    deleteProductCategory,
    deleteJuiceCategory,
    reorderProductCategories,
    reorderJuiceCategories,
    loading: settingsLoading 
  } = useSettings();

  // Dynamic Categories addition state
  const [newProdCatName, setNewProdCatName] = useState('');
  const [newProdCatImg, setNewProdCatImg] = useState('');
  const [isAddingProdCat, setIsAddingProdCat] = useState(false);

  const [newJuiceCatName, setNewJuiceCatName] = useState('');
  const [newJuiceCatTagline, setNewJuiceCatTagline] = useState('');
  const [newJuiceCatImg, setNewJuiceCatImg] = useState('');
  const [isAddingJuiceCat, setIsAddingJuiceCat] = useState(false);

  // Confirmation states to avoid iframe-blocking window.confirm
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [prodCatToDelete, setProdCatToDelete] = useState<string | null>(null);
  const [editingProdCat, setEditingProdCat] = useState<{ oldName: string; newName: string } | null>(null);
  const [juiceCatToDelete, setJuiceCatToDelete] = useState<{ id: string; name: string } | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

  // Filters for orders
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // Filter for products
  const [productSearch, setProductSearch] = useState('');
  const [productSection, setProductSection] = useState<'all' | 'veg-fruits' | 'juices'>('veg-fruits');

  const [migrationStatus, setMigrationStatus] = useState<{
    migrating: boolean;
    total: number;
    processed: number;
    migrated: number;
    errors: number;
  }>({
    migrating: false,
    total: 0,
    processed: 0,
    migrated: 0,
    errors: 0
  });

  

  useEffect(() => {
    const fixOrphanedProducts = async () => {
      if (!user || user.role !== 'admin' || products.length === 0) return;
      
      let count = 0;
      for (const p of products) {
        const cat = p.category?.toLowerCase().trim();
        let newCat = null;
        
        if (cat === 'exotic vegetables' || cat === 'exotic vegetable' || cat === 'imported / super exotic vegetables') {
           newCat = 'exotic vegetable';
        } else if (cat === 'imported vegetables' || cat === 'imported vegetable') {
           newCat = 'imported vegetable';
        }

        if (newCat && p.category !== newCat) {
          try {
            await updateDoc(doc(db, 'products', p.id), { category: newCat });
            count++;
          } catch (e) {}
        }
      }

      if (count > 0) {
        toast.success(`Restored ${count} products to singular category names.`);
        const m = await import('../store/useProducts');
        await m.useProducts.getState().fetchProducts(true);
      }

      const { productCategories, addProductCategory, editProductCategory, deleteProductCategory } = useSettings.getState();
      
      const hasPluralImp = productCategories.find(c => c && c.toLowerCase().trim() === 'imported vegetables');
      const hasSingularImp = productCategories.find(c => c && c.toLowerCase().trim() === 'imported vegetable');

      try {
        if (hasPluralImp && hasSingularImp) {
          await deleteProductCategory(hasPluralImp);
        } else if (hasPluralImp && !hasSingularImp) {
          await editProductCategory(hasPluralImp, 'Imported Vegetable');
        } else if (!hasPluralImp && !hasSingularImp) {
          await addProductCategory('Imported Vegetable');
        }
      } catch (e) {
        console.warn('Failed to fix imported vegetables category:', e);
      }

      const hasPluralExo = productCategories.find(c => c && c.toLowerCase().trim() === 'exotic vegetables');
      const hasSingularExo = productCategories.find(c => c && c.toLowerCase().trim() === 'exotic vegetable');
      
      try {
        if (hasPluralExo && hasSingularExo) {
          await deleteProductCategory(hasPluralExo);
        } else if (hasPluralExo && !hasSingularExo) {
          await editProductCategory(hasPluralExo, 'Exotic Vegetable');
        } else if (!hasPluralExo && !hasSingularExo) {
          await addProductCategory('Exotic Vegetable');
        }
      } catch (e) {
        console.warn('Failed to fix exotic vegetables category:', e);
      }
    };
    fixOrphanedProducts();
  }, [products.length, user]);

  useEffect(() => {
    // 4. Audit and Log Firebase Storage initialization at runtime
    try {
      const appName = storage?.app?.name || "NONE/Unknown";
      const projectIdVal = storage?.app?.options?.projectId || "NONE/Unknown";
      const bucketName = storage?.app?.options?.storageBucket || "NONE/Unknown";
      const storageExists = typeof storage !== 'undefined' && storage !== null;
      
      console.log(`[Storage Audit] Runtime Configuration Debug Check:
- Firebase App Name: ${appName}
- Project ID (projectId): ${projectIdVal}
- Storage Bucket (storageBucket): gs://${bucketName}
- Storage Instance initialized: ${storageExists}`);

      if (!storageExists) {
        console.error('[Storage Audit] FAIL: Firebase Storage is null or undefined!');
      }
    } catch (err: any) {
      console.error('[Storage Audit] FAIL: Exception during storage diagnostics check:', err);
    }
  }, [storage]);

  const dataURLtoBlob = (dataurl: string): Blob => {
    try {
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error('Failed to parse base64 directly:', e);
      throw e;
    }
  };



  const runImageMigration = async () => {
    if (migrationStatus.migrating) return;
    
    setMigrationStatus({
      migrating: true,
      total: 0,
      processed: 0,
      migrated: 0,
      errors: 0
    });

    try {
      toast.loading('Scanning products for base64 images...', { id: 'image-migration' });
      const productsSnap = await getDocs(collection(db, 'products'));
      const allDocs = productsSnap.docs;
      
      const docsToMigrate = allDocs.filter(d => {
        const data = d.data();
        return (data.imageUrl && data.imageUrl.startsWith('data:image/'));
      });

      const totalCount = docsToMigrate.length;
      if (totalCount === 0) {
        toast.success('All product images are already in Cloud Storage! No migration needed.', { id: 'image-migration' });
        setMigrationStatus(prev => ({ ...prev, migrating: false }));
        return;
      }

      toast.loading(`Found ${totalCount} products to migrate. Processing in batches...`, { id: 'image-migration' });
      setMigrationStatus(prev => ({
        ...prev,
        total: totalCount,
        processed: 0,
        migrated: 0,
        errors: 0
      }));

      let localProcessed = 0;
      let localMigrated = 0;
      let localErrors = 0;

      const BATCH_SIZE = 3;
      for (let i = 0; i < docsToMigrate.length; i += BATCH_SIZE) {
        const batch = docsToMigrate.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (docSnap) => {
          const productId = docSnap.id;
          const data = docSnap.data();
          const base64Img = data.imageUrl;
          
          try {
            const blobToUpload = dataURLtoBlob(base64Img);
            const originalPath = `products/${productId}/original`;
            let mainUrl = '';

            try {
              // Try primary storage bucket
              const storageRef = ref(storage, originalPath);
              await uploadBytesResumable(storageRef, blobToUpload);
              mainUrl = await getDownloadURL(storageRef);
            } catch (primaryStorageErr) {
              console.warn(`[Migration] Primary storage upload failed for product ${productId}. Retrying with fallback storage bucket...`, primaryStorageErr);
              // Retry using fallback storage bucket
              const storageRef = ref(fallbackStorage, originalPath);
              await uploadBytesResumable(storageRef, blobToUpload);
              mainUrl = await getDownloadURL(storageRef);
            }

            await updateDoc(doc(db, 'products', productId), {
              imageUrl: mainUrl,
              updatedAt: Date.now()
            });

            localProcessed++;
            localMigrated++;
            setMigrationStatus(prev => ({
              ...prev,
              processed: localProcessed,
              migrated: localMigrated
            }));
          } catch (err) {
            console.error(`Failed to migrate product ${productId}:`, err);
            localProcessed++;
            localErrors++;
            setMigrationStatus(prev => ({
              ...prev,
              processed: localProcessed,
              errors: localErrors
            }));
          }
        }));
      }

      const m = await import('../store/useProducts');
      await m.useProducts.getState().fetchProducts(true);
      setProducts(m.useProducts.getState().products);

      if (localErrors > 0) {
        toast.error(
          `Migration finished with warnings: successfully migrated ${localMigrated} images, but failed on ${localErrors}. If this keeps failing, Firebase Storage is not enabled or its security rules limit uploads. Ensure Storage has been initialized on the Firebase console.`,
          { id: 'image-migration', duration: 10000 }
        );
      } else {
        toast.success(`Migration completed! Successfully migrated ${localMigrated} images to Firebase Storage.`, { id: 'image-migration', duration: 5000 });
      }
    } catch (err) {
      console.error("Migration fatal error:", err);
      toast.error('Fatal error during image migration.', { id: 'image-migration' });
    } finally {
      setMigrationStatus(prev => ({ ...prev, migrating: false }));
    }
  };

  const filteredProducts = products.filter(product => {
    const isJuice = product.category === 'fnl juices' || product.category === 'fnl juice';
    if (productSection === 'veg-fruits' && isJuice) return false;
    if (productSection === 'juices' && !isJuice) return false;

    const q = productSearch.toLowerCase();
    const name = (product.name || '').toLowerCase();
    const cat = (product.category || '').toLowerCase();
    const subCat = ((product as any).subCategory || '').toLowerCase();

    return !q ? true : (
      name.startsWith(q) || name.includes(` ${q}`) || name.includes(`-${q}`) ||
      cat.startsWith(q) || cat.includes(` ${q}`) || cat.includes(`-${q}`) ||
      subCat.startsWith(q) || subCat.includes(` ${q}`) || subCat.includes(`-${q}`)
    );
  });

  const categorizedFilteredProducts = useMemo(() => {
    const list = [...filteredProducts];
    const catOrder = new Map();
    productCategories.forEach((c, i) => { if (c) catOrder.set(c.toLowerCase().trim(), i) });
    const juiceOrder = new Map();
    juiceCategories.forEach((c, i) => { if (c && c.id) juiceOrder.set(c.id, i) });

    list.sort((a, b) => {
      const isOutA = a.inStock === false;
      const isOutB = b.inStock === false;

      let catA = (a.category || '').toLowerCase().trim();
      let catB = (b.category || '').toLowerCase().trim();
      if (catA === 'exotic vegetables') catA = 'exotic vegetable';
      if (catA === 'imported vegetables') catA = 'imported vegetable';
      if (catA === 'mushrooms') catA = 'mushroom';
      if (catB === 'exotic vegetables') catB = 'exotic vegetable';
      if (catB === 'imported vegetables') catB = 'imported vegetable';
      if (catB === 'mushrooms') catB = 'mushroom';

      if (catA !== catB) {
        const idxA = catOrder.has(catA) ? catOrder.get(catA) : 999;
        const idxB = catOrder.has(catB) ? catOrder.get(catB) : 999;
        return idxA - idxB;
      }
      
      const isJuiceA = catA === 'fnl juices' || catA === 'fnl juice';
      const isJuiceB = catB === 'fnl juices' || catB === 'fnl juice';
      
      if (isJuiceA && isJuiceB) {
         const subA = ((a as any).subCategory || 'cold-pressed').toLowerCase().trim();
         const subB = ((b as any).subCategory || 'cold-pressed').toLowerCase().trim();
         if (subA !== subB) {
            const idxSubA = juiceOrder.has(subA) ? juiceOrder.get(subA) : 999;
            const idxSubB = juiceOrder.has(subB) ? juiceOrder.get(subB) : 999;
            return idxSubA - idxSubB;
         }
      }

      if (isOutA !== isOutB) {
        return isOutA ? 1 : -1;
      }

      return (a.orderIndex ?? 999) - (b.orderIndex ?? 999);
    });
    return list;
  }, [filteredProducts, productCategories, juiceCategories]);

  // Filtered orders logic
  const filteredOrders = orders.filter((order) => {
    // filter by status
    if (filterStatus !== 'all' && order.status !== filterStatus) return false;
    
    // filter by date
    if (dateRange.start) {
      const orderDate = new Date(order.createdAt).getTime();
      const startDate = new Date(dateRange.start).getTime();
      if (orderDate < startDate) return false;
    }
    if (dateRange.end) {
      const orderDate = new Date(order.createdAt).getTime();
      // Add 24 hours to end date to include the whole day
      const endDate = new Date(dateRange.end).getTime() + 86400000;
      if (orderDate >= endDate) return false;
    }
    return true;
  });

  const topProducts = React.useMemo(() => {
    const productCounts: Record<string, { name: string; quantity: number; revenue: number }> = {};
    filteredOrders.filter(o => o.status !== 'cancelled').forEach(order => {
      order.items?.forEach((item: any) => {
        const prod = item?.product || item;
        if (!prod || !prod.id) return;
        if (!productCounts[prod.id]) {
          productCounts[prod.id] = { name: prod.name || 'Unknown Product', quantity: 0, revenue: 0 };
        }
        productCounts[prod.id].quantity += item.quantity || 0;
        productCounts[prod.id].revenue += (item.quantity || 0) * (prod.price || 0);
      });
    });
    return Object.values(productCounts).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [filteredOrders]);

  // Spotlights state
  const [spotlightsConfig, setSpotlightsConfig] = useState<Record<string, {title: string, image: string}>>({});
  const [heroBanners, setHeroBanners] = useState<{id: string, imageUrl: string, link: string}[]>([]);
  const [draggedBannerIndex, setDraggedBannerIndex] = useState<number | null>(null);

  // New product form handling
  const [newProduct, setNewProduct] = useState<{ name: string; price: string; originalPrice: string; horecaPrice: string; horecaUnit: string; category: string; subCategory: string; description: string; imageUrl: string; unit: string; quantityValue: string; quantityUnit: string; horecaQuantityValue: string; horecaQuantityUnit: string; variants: { unit: string; quantityValue: string; quantityUnit: string; horecaQuantityValue: string; horecaQuantityUnit: string; price: string; originalPrice: string; horecaPrice: string; horecaUnit: string }[] }>({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: 'indian fruits', subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', quantityValue: '', quantityUnit: 'Kg', horecaQuantityValue: '', horecaQuantityUnit: 'Kg', variants: [] });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [seedingJuices, setSeedingJuices] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});

  const [draggedProductIdx, setDraggedProductIdx] = useState<number | null>(null);
  const [dragOverProductIdx, setDragOverProductIdx] = useState<number | null>(null);

  const [draggedProdCat, setDraggedProdCat] = useState<number | null>(null);
  const [dragOverProdCat, setDragOverProdCat] = useState<number | null>(null);
  
  const [draggedJuiceCat, setDraggedJuiceCat] = useState<number | null>(null);
  const [dragOverJuiceCat, setDragOverJuiceCat] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    
    async function fetchData() {
      try {
        setLoading(true);
        if (activeTab === 'orders') {
          const ordersSnap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)));
          const mCache = await import('../lib/cacheManager');
          mCache.trackFirestoreRead('orders', ordersSnap.size);
          setOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } else if (activeTab === 'products') {
          const m = await import('../store/useProducts');
          await m.useProducts.getState().fetchProducts(true);
          setProducts(m.useProducts.getState().products);
        } else if (activeTab === 'spotlights') {
          const m = await import('./Home');
          const defaultSpots = m.CATEGORIES;
          const userProducts = useSettings.getState().productCategories || [];
          const mCache = await import('../lib/cacheManager');
          const currentCategoryImages = useSettings.getState().categoryImages;
          
          let overrides = mCache.cacheManager.get<any>('spotlights', true);
          const isCacheFresh = mCache.cacheManager.isValid('spotlights');
          
          if (!overrides || !isCacheFresh) {
            const docSnap = await getDoc(doc(db, 'settings', 'spotlights'));
            mCache.trackFirestoreRead('settings', 1);
            overrides = docSnap.exists() ? docSnap.data() : {};
            mCache.cacheManager.set('spotlights', overrides);
          }

          const initialConfig: any = {};
          
          const activeSpots = userProducts.length > 0 ? userProducts.map(catName => {
            const match = defaultSpots.find(c => 
              c.name.toLowerCase() === catName.toLowerCase() || 
              c.id.toLowerCase() === catName.toLowerCase() ||
              (catName.toLowerCase() === 'exotics' && c.id.includes('imported')) ||
              (catName.toLowerCase() === 'clean cuts' && c.id.includes('hygenic'))
            );
            if (match) {
              return {
                ...match,
                name: catName,
                originalId: match.id,
                id: catName.toLowerCase()
              };
            }
            return { id: catName.toLowerCase(), name: catName, tagline: 'Fresh & Fresh', discount: 'New' };
          }) : defaultSpots;
          
          activeSpots.forEach(cat => {
            const normalizedKey = cat.name.toLowerCase().replace(/ font-bold/gi, '').trim();
            initialConfig[cat.id] = { 
              title: cat.name,
              image: overrides[cat.id]?.image || currentCategoryImages[normalizedKey] || ''
            };
          });
          
          setSpotlightsConfig(initialConfig);
        } else if (activeTab === 'categories') {
          await fetchCategoryImages(true);
        } else if (activeTab === 'reviews') {
          const reviewsSnap = await getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc')));
          setReviews(reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } else if (activeTab === 'hero') {
          const docSnap = await getDoc(doc(db, 'settings', 'heroBanners'));
          if (docSnap.exists() && docSnap.data().banners) {
            setHeroBanners(docSnap.data().banners);
          } else {
            setHeroBanners([]);
          }
        }
      } catch (error: any) {
        console.error("Dashboard failed to retrieve live data:", error);
        if (isQuotaError(error)) {
          toast.error("Database limit reached. Dashboard data unavailable.");
        } else {
          toast.error(`Running in Offline/Sandbox mode: ${error.message || 'Firebase block bypassed'}`);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user, activeTab]);

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4">
        <span className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin"></span>
        VERIFYING CREDENTIALS...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto my-24 p-8 rounded-[28px] bg-secondary border border-border space-y-4 shadow-sm">
        <div className="text-center">
          <span className="text-primary font-mono text-xs uppercase tracking-widest block">ADMINISTRATION</span>
          <h2 className="text-xl font-black uppercase text-foreground">Authentication Required</h2>
          <p className="text-xs text-muted-foreground mt-2">Please log in to access the control desk.</p>
        </div>
        
        <form onSubmit={async (e) => {
          e.preventDefault();
          const target = e.target as typeof e.target & {
             email: { value: string };
             password: { value: string };
          };
          const m = await import('../lib/firebase');
          try {
             await m.signInWithEmail(target.email.value, target.password.value);
             toast.success("Login successful!");
          } catch (error: any) {
             const errMsg = error?.code || error?.message || '';
             
             // First check if it's a wrong password for an existing account
             if (errMsg === 'auth/wrong-password') {
                 toast.error('Incorrect password. Please try again.');
                 return;
             }
             
             // If account doesn't exist, try to sign up
             if (errMsg.includes('user-not-found') || errMsg === 'auth/user-not-found') {
                 try {
                     await m.signUpWithEmail(target.email.value, target.password.value, 'Admin');
                     toast.success("Admin account created and logged in!");
                 } catch (signUpErr: any) {
                     toast.error(`Sign Up Error: ${signUpErr.message}`);
                 }
                 return;
             }
             
             // If they use Google Sign In, Firebase throws invalid-credential if you try to use a password
             if (errMsg.includes('invalid-credential') || errMsg.includes('auth/invalid-login-credentials')) {
                 toast.error(`Invalid credentials. If this was a Google account, you cannot use a password.`);
                 return;
             }

             console.error("Sign-in failed", error);
             toast.error(`Sign In Error: ${error.message || 'Authentication failed'}`);
          }
        }} className="space-y-3 mt-6">
           <div>
             <label className="block text-[10px] font-bold uppercase tracking-widest mb-1">Admin Email</label>
             <input required name="email" type="email" placeholder="admin@example.com" className="w-full border border-border px-3 py-2 bg-white outline-none text-xs rounded-lg focus:border-primary transition-colors" />
           </div>
           <div>
             <label className="block text-[10px] font-bold uppercase tracking-widest mb-1">Password</label>
             <input required name="password" type="password" placeholder="••••••••" className="w-full border border-border px-3 py-2 bg-white outline-none text-xs rounded-lg focus:border-primary transition-colors" />
           </div>
           <button type="submit" className="slice-btn-primary w-full py-3 mt-2">Sign In with Credentials</button>
           <p className="text-[9px] text-center text-muted-foreground uppercase tracking-widest mt-2">
             New Admin? Sign up using the Profile icon in the top right.
           </p>
        </form>

        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-4 text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Or</span>
            <div className="flex-grow border-t border-border"></div>
        </div>

        {typeof window !== 'undefined' && window.self !== window.top && (
          <div className="bg-amber-50 border border-amber-200 p-3 sm:p-4 rounded-xl text-[11px] text-amber-800 leading-normal mb-4 font-semibold text-left">
            <span className="font-black uppercase tracking-widest mb-1 text-[10px] text-amber-950 block">⚠️ Preview Iframe Warning</span>
            Google Sign-In popups are restricted inside design preview frames by default browser privacy policies.
            <div className="mt-2 space-y-1 text-amber-900">
              <p>• <strong className="text-amber-950">Option 1:</strong> Use the "Admin Email" form above to sign in or register instantly.</p>
              <p>• <strong className="text-amber-950">Option 2:</strong> Open the app in a new browser tab to use authentic Google Login.</p>
            </div>
          </div>
        )}

        {diagError && (
          <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl text-xs text-amber-900 leading-normal mb-6 font-medium text-left">
            <div className="flex justify-between items-start mb-2">
              <span className="font-extrabold text-amber-950 uppercase tracking-wider text-[9px] block">🔍 Sign-In Diagnostic Helper</span>
              <button 
                type="button" 
                onClick={() => setDiagError(null)} 
                className="text-amber-600 hover:text-amber-950 font-bold text-[10px] uppercase tracking-wide cursor-pointer"
              >
                Clear
              </button>
            </div>
            
            <p className="font-semibold text-red-700 mb-2">
              Error code: <code className="bg-red-50 px-1 py-0.5 rounded border border-red-200 font-mono text-[10px]">{diagError.code || 'unknown'}</code>
            </p>
            <p className="text-[11px] text-amber-950 mb-3 leading-relaxed break-words">
              {diagError.message}
            </p>

            <div className="border-t border-amber-200 pt-3 mt-3 space-y-3">
              <span className="font-bold uppercase tracking-widest text-[9px] text-amber-950 block">Step-By-Step Solution:</span>
              
              {diagError.code === 'auth/unauthorized-domain' || String(diagError.code || '').includes('unauthorized-domain') || String(diagError.message || '').includes('unauthorized domain') ? (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p>
                    Your current domain <strong className="bg-amber-100 px-1.5 py-0.5 text-amber-950 rounded font-mono select-all break-all">{typeof window !== 'undefined' ? window.location.hostname : 'this domain'}</strong> is not whitelisted by Firebase Auth.
                  </p>
                  <p className="font-bold">To fix this in 30 seconds:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline text-blue-700 font-bold hover:text-blue-900">Firebase Console</a></li>
                    <li>Select project: <strong className="font-mono bg-white px-1 border">freshnlocal-4a420</strong></li>
                    <li>Go to <strong className="font-sans">Authentication ➔ Settings ➔ Authorized domains</strong></li>
                    <li>Click <strong className="font-sans">Add Domain</strong> and type or paste: <code className="bg-white px-1.5 py-0.5 border select-all font-mono text-[10px] text-amber-950 font-bold">{typeof window !== 'undefined' ? window.location.hostname : 'your-domain'}</code></li>
                    <li>Make sure to also add <code className="bg-white px-1 border text-[10px] font-mono">freshnlocal.co</code> if you are testing on your production domain!</li>
                  </ol>
                </div>
              ) : diagError.code === 'auth/operation-not-allowed' ? (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p>
                    Google Sign-In is not enabled inside your Firebase project.
                  </p>
                  <p className="font-bold">To fix this:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline text-blue-700 font-bold">Firebase Console</a></li>
                    <li>Go to <strong className="font-sans">Authentication ➔ Sign-in method</strong></li>
                    <li>Click <strong className="font-sans">Add new provider</strong> (or edit existing) and select <strong className="font-sans">Google</strong></li>
                    <li>Toggle the <strong className="font-bold">Enable</strong> switch, enter a support email, and click <strong className="font-bold">Save</strong></li>
                  </ol>
                </div>
              ) : diagError.code === 'auth/popup-blocked' ? (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p>
                    The browser blocked the authentication popup window.
                  </p>
                  <p className="font-bold">To fix this:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>Look at your browser's URL address bar for a blocked popup icon (looks like a key, 🚫 or a popup warning).</li>
                    <li>Click it and select "Always allow popups from this site".</li>
                    <li>Or, click "Open in new tab" in the top-right of your AI Studio workspace to log in without iframe blocks.</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p className="font-bold">General Sign-In suggestions:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>If you are in Incognito / Private browsing, your browser may block cross-origin authentication. Try a standard window.</li>
                    <li>You can always register a traditional account with any email/password instantly above instead!</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <button 
          onClick={async () => {
             const m = await import('../lib/firebase');
             try {
               setDiagError(null);
               await m.signIn();
             } catch (error: any) {
               console.error("Sign-in failed", error);
               setDiagError(error);
               if (error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized domain')) {
                 toast.error('Vercel Domain Not Authorized: Please add your URL to Firebase Console -> Authentication -> Settings -> Authorized domains.', { duration: 8000 });
               } else {
                 toast.error(`Sign In Error: ${error.message || 'Firebase block'}`);
               }
             }
          }}
          className="w-full py-3 bg-white text-foreground text-xs font-bold uppercase tracking-widest border border-border hover:bg-black/5 transition-colors rounded-lg flex justify-center items-center gap-2"
        >
          Sign In with Google
        </button>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-24 p-8 rounded-[28px] bg-secondary border border-red-500/20 text-center space-y-4">
        <span className="text-red-400 font-mono text-xs uppercase tracking-widest block">403 FORBIDDEN</span>
        <h2 className="text-xl font-black uppercase text-foreground">Access Denied</h2>
        <p className="text-xs text-muted-foreground">You do not possess the necessary administrative credentials to view this control desk.</p>
      </div>
    );
  }

  const handleExportCSV = () => {
    try {
      const headers = ["PRODUCT NAME", "CATEGORY", "UNIT", "MRP", "RATE PRICE", "DESCRIPTION"];
      const csvRows = [];
      csvRows.push(headers.join(","));
      
      filteredProducts.forEach(product => {
        const row = [
          `"${(product.name || '').replace(/"/g, '""')}"`,
          `"${(product.category || '').replace(/"/g, '""')}"`,
          `"${(product.unit || '').replace(/"/g, '""')}"`,
          `"${product.originalPrice || product.price || ''}"`,
          `"${product.price || ''}"`,
          `"${(product.description || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(","));
      });
      
      const csvString = csvRows.join("\n");
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `products_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Products exported successfully.");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export products.");
    }
  };

  const handleSeedSignatureJuices = async () => {
    try {
      setSeedingJuices(true);
      
      const currentJuiceNames = new Set(
        products
          .filter(p => p.category === 'fnl juices' || p.category === 'fnl juice')
          .map(p => (p.name || '').toLowerCase().trim())
      );
      
      const toSeed = AUTHENTIC_FNL_JUICES.filter(
        item => !currentJuiceNames.has(item.name.toLowerCase().trim())
      );
      
      if (toSeed.length === 0) {
        toast.success("Signature list matches current database items. All items already synced.");
        return;
      }
      
      const chunks = [];
      for (let i = 0; i < toSeed.length; i += 100) {
        chunks.push(toSeed.slice(i, i + 100));
      }

      const seededProducts: Product[] = [];
      
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const newDocRef = doc(collection(db, 'products'));
          const productPayload = {
            ...item,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          batch.set(newDocRef, productPayload);
          seededProducts.push({
            id: newDocRef.id,
            ...productPayload
          } as unknown as Product);
        });
        await batch.commit();
      }
      setProducts(prev => [...seededProducts, ...prev]);
      toast.success(`Successfully imported ${toSeed.length} signature FNL juices!`);
    } catch (err: any) {
      if (isQuotaError(err)) {
        toast.error("Cloud database limits reached. Daily read/write tier full.");
      } else {
        console.error(err);
        toast.error("Failed to seed items from catalog.");
      }
    } finally {
      setSeedingJuices(false);
    }
  };

  const updateSpotlightValue = async (key: string, field: 'title' | 'image', value: string) => {
    try {
      const currentItem = spotlightsConfig[key] || { title: '', image: '' };
      const updatedItem = { ...currentItem, [field]: value };
      const newConfig = { ...spotlightsConfig, [key]: updatedItem };
      setSpotlightsConfig(newConfig);

      // Save directly to Firestore for auto-save
      const optimizedItem = { ...updatedItem };

      await setDoc(doc(db, 'settings', 'spotlights'), {
        [key]: optimizedItem
      }, { merge: true });

      const mCache = await import('../lib/cacheManager');
      const existingCache = mCache.cacheManager.get<any>('spotlights', true) || {};
      mCache.cacheManager.set('spotlights', { ...existingCache, [key]: optimizedItem });

      if (field === 'image') toast.success('Spotlight image updated');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save spotlight setting');
    }
  };

  const handleHeroBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isUploading) {
      toast.error('Another upload is in progress');
      return;
    }

    setIsUploading(true);
    const selectTime = performance.now();
    const toastId = toast.loading('Uploading banner...');
    try {
      const { url, timing } = await uploadRawFileToStorage(file, 'heroBanners', selectTime, (prog) => {
        toast.loading(`Uploading banner: ${prog.toFixed(0)}%`, { id: toastId });
      });
      setLastUploadTiming(timing);
      
      const newBanner = { id: Date.now().toString(), imageUrl: url, link: '' };
      const newBanners = [...heroBanners, newBanner];
      
      await setDoc(doc(db, 'settings', 'heroBanners'), { banners: newBanners }, { merge: true });
      setHeroBanners(newBanners);
      
      toast.success('Banner uploaded!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to upload banner.', { id: toastId });
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const deleteHeroBanner = async (bannerId: string) => {
    try {
      const newBanners = heroBanners.filter(b => b.id !== bannerId);
      await setDoc(doc(db, 'settings', 'heroBanners'), { banners: newBanners }, { merge: true });
      setHeroBanners(newBanners);
      toast.success('Banner deleted');
    } catch (error) {
      toast.error('Failed to delete banner');
    }
  };

  const updateHeroBannerLink = async (bannerId: string, link: string) => {
    try {
      const newBanners = heroBanners.map(b => b.id === bannerId ? { ...b, link } : b);
      await setDoc(doc(db, 'settings', 'heroBanners'), { banners: newBanners }, { merge: true });
      setHeroBanners(newBanners);
      toast.success('Banner link updated');
    } catch (error) {
      toast.error('Failed to update banner link');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedBannerIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedBannerIndex === null || draggedBannerIndex === dropIndex) return;

    const newBanners = [...heroBanners];
    const draggedBanner = newBanners[draggedBannerIndex];
    newBanners.splice(draggedBannerIndex, 1);
    newBanners.splice(dropIndex, 0, draggedBanner);

    setHeroBanners(newBanners);
    setDraggedBannerIndex(null);

    try {
      await setDoc(doc(db, 'settings', 'heroBanners'), { banners: newBanners }, { merge: true });
      toast.success('Banners rearranged');
    } catch (error) {
      toast.error('Failed to rearrange banners');
    }
  };

  const handleSpotlightImageUpload = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isUploading) {
      toast.error('Another upload is in progress');
      return;
    }

    setIsUploading(true);
    const selectTime = performance.now();
    console.log(`[Step 1: File Selection] Spotlight image file "${file.name}" selected at ${new Date().toISOString()}`);
    const toastId = toast.loading('Uploading spotlight image: 0%...');
    try {
      const { url, timing } = await uploadRawFileToStorage(file, 'spotlights', selectTime, (prog) => {
        toast.loading(`Uploading spotlight image: ${prog.toFixed(0)}%`, { id: toastId });
      });
      setLastUploadTiming(timing);
      updateSpotlightValue(key, 'image', url);
      toast.success('Spotlight image uploaded!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to upload spotlight image.', { id: toastId });
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveItemFromOrder = async (orderId: string, itemIndex: number) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      if (!order.items || order.items.length <= 1) {
        toast.error("Cannot remove the last item. Cancel or delete the order instead.");
        return;
      }
      const newItems = [...order.items];
      newItems.splice(itemIndex, 1);
      
      const newTotal = newItems.reduce((sum, item) => {
        const p = item.product || item;
        return sum + (p.price || 0) * (item.quantity || 1);
      }, 0);

      await updateDoc(doc(db, 'orders', orderId), { 
        items: newItems, 
        totalAmount: newTotal,
        updatedAt: Date.now() 
      });
      
      const updatedOrder = { ...order, items: newItems, totalAmount: newTotal };
      setOrders(orders.map(o => o.id === orderId ? updatedOrder : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(updatedOrder);
      }
      toast.success('Item removed from order');
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
      toast.error(e?.message || 'Failed to remove item');
    }
  };

  const handleUpdateItemQuantityFromOrder = async (orderId: string, itemIndex: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.items) return;
      
      const newItems = [...order.items];
      newItems[itemIndex] = { ...newItems[itemIndex], quantity: newQuantity };
      
      const newTotal = newItems.reduce((sum, item) => {
        const p = item.product || item;
        return sum + (p.price || 0) * (item.quantity || 1);
      }, 0);

      await updateDoc(doc(db, 'orders', orderId), { 
        items: newItems, 
        totalAmount: newTotal,
        updatedAt: Date.now() 
      });
      
      const updatedOrder = { ...order, items: newItems, totalAmount: newTotal };
      setOrders(orders.map(o => o.id === orderId ? updatedOrder : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(updatedOrder);
      }
      toast.success('Item quantity updated');
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
      toast.error(e?.message || 'Failed to update item quantity');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: Date.now() });
      setOrders(orders.map(o => o.id === orderId ? { ...o, status } : o));
      toast.success(`Order ${orderId.slice(0, 6)} state changed to ${status}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
      toast.error('Failed to update status.');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
      await deleteDoc(doc(db, 'orders', orderId));
      setOrders(orders.filter(o => o.id !== orderId));
      setOrderToDelete(null);
      toast.success('Order deleted successfully.');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `orders/${orderId}`);
      toast.error('Failed to delete order.');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const processStartTime = performance.now();
    let firestoreDurationMs = 0;
    let reactRenderDurationMs = 0;
    let cacheRefreshDurationMs = 0;

    console.log(`[Step 5: Firestore Save Started] Saving product catalog document for "${newProduct.name}" to Firestore...`);
    
    try {
      const firestoreStartTime = performance.now();
      const finalCategory = productSection === 'juices' ? 'fnl juices' : newProduct.category;
      const finalSubCategory = productSection === 'juices' ? (newProduct.subCategory || 'cold-pressed') : null;

      const finalImageUrl = newProduct.imageUrl || '';
      const productId = editingProductId || doc(collection(db, 'products')).id;
      const variantsToSave = (newProduct.variants || []).map(v => ({
        ...v,
        quantityValue: v.quantityValue ? Number(v.quantityValue) : null,
        quantityUnit: v.quantityUnit || 'Kg',
        price: Number(v.price),
        originalPrice: v.originalPrice ? Number(v.originalPrice) : null,
        horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : null,
        horecaUnit: v.horecaUnit || '',
      }));



      if (editingProductId) {
        await updateDoc(doc(db, 'products', editingProductId), {
          name: newProduct.name,
          price: Number(newProduct.price),
          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,
          horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,
          horecaUnit: newProduct.horecaUnit || '',
          category: finalCategory,
          subCategory: finalSubCategory,
          description: newProduct.description,
          imageUrl: finalImageUrl,
          unit: newProduct.unit || '',
          quantityValue: newProduct.quantityValue ? Number(newProduct.quantityValue) : null,
          quantityUnit: newProduct.quantityUnit || 'Kg',
          variants: variantsToSave,
          updatedAt: Date.now()
        });
      } else {
        await setDoc(doc(db, 'products', productId), {
          name: newProduct.name,
          price: Number(newProduct.price),
          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,
          horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : null,
          horecaUnit: newProduct.horecaUnit || '',
          category: finalCategory,
          subCategory: finalSubCategory,
          description: newProduct.description,
          imageUrl: finalImageUrl,
          unit: newProduct.unit || '',
          quantityValue: newProduct.quantityValue ? Number(newProduct.quantityValue) : null,
          quantityUnit: newProduct.quantityUnit || 'Kg',
          variants: variantsToSave,
          stock: 100,
          inStock: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      firestoreDurationMs = performance.now() - firestoreStartTime;

      const renderStartTime = performance.now();
      const updatedProductObj: Product = {
        id: productId,
        name: newProduct.name,
        price: Number(newProduct.price),
        originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : undefined,
        horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : undefined,
        horecaUnit: newProduct.horecaUnit || '',
        category: finalCategory,
        subCategory: finalSubCategory ? finalSubCategory : undefined,
        description: newProduct.description,
        imageUrl: finalImageUrl,
        unit: newProduct.unit || '',
        quantityValue: newProduct.quantityValue ? Number(newProduct.quantityValue) : undefined,
        quantityUnit: newProduct.quantityUnit || 'Kg',
        variants: variantsToSave,
        stock: 100,
        inStock: true,
        createdAt: editingProductId ? (products.find(p => p.id === editingProductId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now()
      } as unknown as Product;

      let nextProductsList: Product[];
      if (editingProductId) {
        nextProductsList = products.map(p => p.id === editingProductId ? updatedProductObj : p);
        setProducts(nextProductsList);
        toast.success('Product updated successfully!');
        setEditingProductId(null);
      } else {
        nextProductsList = [updatedProductObj, ...products];
        setProducts(nextProductsList);
        toast.success('New product cataloged successfully!');
      }
      reactRenderDurationMs = performance.now() - renderStartTime;

      const cacheStartTime = performance.now();
      const mProductsStore = await import('../store/useProducts');
      const currentStoreProducts = mProductsStore.useProducts.getState().products;
      let nextStoreProducts: Product[];
      if (editingProductId) {
        nextStoreProducts = currentStoreProducts.map(p => p.id === editingProductId ? updatedProductObj : p);
      } else {
        nextStoreProducts = [updatedProductObj, ...currentStoreProducts];
      }
      mProductsStore.useProducts.getState().products = nextStoreProducts;
      mProductsStore.useProducts.getState().lastFetched = Date.now();

      const mCache = await import('../lib/cacheManager');
      const mIdb = await import('../lib/indexedDB');
      try {
        mCache.cacheManager.set('products_v6', nextStoreProducts);
        mCache.cacheManager.set('products_last_fetched_v4', Date.now());
        mIdb.idb.set('products_v6', nextStoreProducts, 24 * 60 * 60 * 1000).catch(()=>{});
        mIdb.idb.set('products_last_fetched_v4', Date.now(), 24 * 60 * 60 * 1000).catch(()=>{});
      } catch (cacheErr) {
        console.warn("Async Cache sync failed safely:", cacheErr);
      }
      cacheRefreshDurationMs = performance.now() - cacheStartTime;

      const processEndTime = performance.now();
      const processDurationMs = processEndTime - processStartTime;

      if (lastUploadTiming) {
        const totalPipelineDuration = (processEndTime - lastUploadTiming.selectTime);
        console.log(`
============================================================
              UPLOAD PIPELINE AUDIT REPORT
============================================================
* File Name:                  ${lastUploadTiming.fileName}
* File Size:                  ${lastUploadTiming.fileSizeKB.toFixed(2)} KB
* Upload Start Time:          ${new Date(lastUploadTiming.selectTime).toLocaleTimeString()}
* Image Upload Duration:      ${lastUploadTiming.uploadDurationMs.toFixed(2)} ms
* Download URL Duration:      ${lastUploadTiming.urlRetrievalDurationMs.toFixed(2)} ms
* Firestore Write Duration:   ${firestoreDurationMs.toFixed(2)} ms
* React Re-render Duration:   ${reactRenderDurationMs.toFixed(2)} ms
* Cache Refresh Duration:     ${cacheRefreshDurationMs.toFixed(2)} ms
* Total Workflow Duration:    ${processDurationMs.toFixed(2)} ms
* Total Pipeline Duration:    ${totalPipelineDuration.toFixed(2)} ms
============================================================
        `);
        toast.success(`Pipeline Success: Saved in ${totalPipelineDuration.toFixed(0)}ms total!`);
        setLastUploadTiming(null); // Clear log
      }

      setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', quantityValue: '', quantityUnit: 'Kg', horecaQuantityValue: '', horecaQuantityUnit: 'Kg', variants: [] });
    } catch (error) {
      console.error(`[Step 5: Firestore Save Error] Failed to save product catalog document:`, error);
      handleFirestoreError(error, editingProductId ? OperationType.UPDATE : OperationType.CREATE, 'products');
      toast.error('Could not save product catalog.');
    }
  };

  const parseQuantityAndUnit = (unitStr: string | undefined): { qVal: string, qUnit: string } => {
    if (!unitStr) return { qVal: '', qUnit: 'Kg' };
    const match = unitStr.match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      let u = match[2].trim();
      if (u.toLowerCase() === 'kg') u = 'Kg';
      else if (u.toLowerCase() === 'gm' || u.toLowerCase() === 'g') u = 'g';
      else if (u.toLowerCase() === 'l') u = 'L';
      else if (u.toLowerCase() === 'ml') u = 'ml';
      else if (u.toLowerCase() === 'pc' || u.toLowerCase() === 'piece') u = 'Pc';
      else if (u.toLowerCase() === 'pack') u = 'Pack';
      else if (u.toLowerCase() === 'box') u = 'Box';
      else if (u.toLowerCase() === 'bottle') u = 'Bottle';
      else if (u.toLowerCase() === 'can') u = 'Can';
      else if (u.toLowerCase() === 'dozen') u = 'Dozen';
      else if (u.toLowerCase() === 'bunch') u = 'Bunch';
      else if (u.toLowerCase() === 'tray') u = 'Tray';
      else u = 'Kg';
      return { qVal: match[1], qUnit: u };
    }
    return { qVal: '', qUnit: 'Kg' };
  };

  const handleEditSetup = (product: Product) => {
    setEditingProductId(product.id);
    const isJuice = product.category === 'fnl juices' || product.category === 'fnl juice';
    
    const parsedMain = parseQuantityAndUnit(product.unit);
    const mainQuantityValue = product.quantityValue ? product.quantityValue.toString() : parsedMain.qVal;
    const mainQuantityUnit = product.quantityUnit || parsedMain.qUnit;
    
    const parsedHoreca = parseQuantityAndUnit(product.horecaUnit || '');

    setNewProduct({
      name: product.name,
      price: product.price.toString(),
      originalPrice: product.originalPrice ? product.originalPrice.toString() : '',
      horecaPrice: product.horecaPrice ? product.horecaPrice.toString() : '',
      horecaUnit: product.horecaUnit || '',
      category: product.category,
      subCategory: (product as any).subCategory || 'cold-pressed',
      description: product.description,
      imageUrl: product.imageUrl || '',
      unit: product.unit || '',
      quantityValue: mainQuantityValue,
      quantityUnit: mainQuantityUnit,
      horecaQuantityValue: parsedHoreca.qVal,
      horecaQuantityUnit: parsedHoreca.qUnit,
      variants: ((product as any).variants || []).map((v: any) => {
        const parsedV = parseQuantityAndUnit(v.unit);
        const parsedVHoreca = parseQuantityAndUnit(v.horecaUnit || '');
        return {
          unit: v.unit,
          quantityValue: v.quantityValue ? v.quantityValue.toString() : parsedV.qVal,
          quantityUnit: v.quantityUnit || parsedV.qUnit,
          price: v.price ? v.price.toString() : '',
          originalPrice: v.originalPrice ? v.originalPrice.toString() : '',
          horecaPrice: v.horecaPrice ? v.horecaPrice.toString() : '',
          horecaUnit: v.horecaUnit || '',
          horecaQuantityValue: parsedVHoreca.qVal,
          horecaQuantityUnit: parsedVHoreca.qUnit
        };
      })
    });
    setProductSection(isJuice ? 'juices' : 'veg-fruits');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', quantityValue: '', quantityUnit: 'Kg', horecaQuantityValue: '', horecaQuantityUnit: 'Kg', variants: [] });
  };

  const uploadRawFileToStorage = async (
    file: File,
    pathPrefix: string,
    selectTime: number,
    onProgress?: (progress: number) => void
  ): Promise<{
    url: string;
    timing: {
      fileName: string;
      fileSizeKB: number;
      selectTime: number;
      uploadStartTime: number;
      uploadCompleteTime: number;
      urlRetrievalCompleteTime: number;
      uploadDurationMs: number;
      urlRetrievalDurationMs: number;
      totalUploadDurationMs: number;
    };
  }> => {
    // 1. Check duplicate cache to prevent redundant uploads
    const cacheKey = `${file.name}_${file.size}`;
    if (uploadedUrlsCache.current[cacheKey]) {
      const cachedUrl = uploadedUrlsCache.current[cacheKey];
      if (onProgress) onProgress(100);
      return {
        url: cachedUrl,
        timing: {
          fileName: `${file.name} (cached)`,
          fileSizeKB: file.size / 1024,
          selectTime,
          uploadStartTime: performance.now(),
          uploadCompleteTime: performance.now(),
          urlRetrievalCompleteTime: performance.now(),
          uploadDurationMs: 0,
          urlRetrievalDurationMs: 0,
          totalUploadDurationMs: performance.now() - selectTime
        }
      };
    }

    const uploadStartTime = performance.now();
    const originalPath = `${pathPrefix}/${Date.now()}_${file.name}`;
    let mainUrl = '';

    try {
      const storageRef = ref(storage, originalPath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) onProgress(progress);
          },
          (error) => reject(error),
          () => resolve()
        );
      });
      
      const uploadCompleteTime = performance.now();
      mainUrl = await getDownloadURL(storageRef);
      const urlRetrievalCompleteTime = performance.now();
      
      uploadedUrlsCache.current[cacheKey] = mainUrl;

      return {
        url: mainUrl,
        timing: {
          fileName: file.name,
          fileSizeKB: file.size / 1024,
          selectTime,
          uploadStartTime,
          uploadCompleteTime,
          urlRetrievalCompleteTime,
          uploadDurationMs: uploadCompleteTime - uploadStartTime,
          urlRetrievalDurationMs: urlRetrievalCompleteTime - uploadCompleteTime,
          totalUploadDurationMs: urlRetrievalCompleteTime - selectTime
        }
      };
    } catch (primaryStorageErr) {
      console.warn(`Primary storage upload failed. Retrying with fallback storage bucket...`, primaryStorageErr);
      const storageRef = ref(fallbackStorage, originalPath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) onProgress(progress);
          },
          (error) => reject(error),
          () => resolve()
        );
      });
      
      const uploadCompleteTime = performance.now();
      mainUrl = await getDownloadURL(storageRef);
      const urlRetrievalCompleteTime = performance.now();
      
      uploadedUrlsCache.current[cacheKey] = mainUrl;

      return {
        url: mainUrl,
        timing: {
          fileName: file.name,
          fileSizeKB: file.size / 1024,
          selectTime,
          uploadStartTime,
          uploadCompleteTime,
          urlRetrievalCompleteTime,
          uploadDurationMs: uploadCompleteTime - uploadStartTime,
          urlRetrievalDurationMs: urlRetrievalCompleteTime - uploadCompleteTime,
          totalUploadDurationMs: urlRetrievalCompleteTime - selectTime
        }
      };
    }
  };

  const processImageFile = async (file: File, callback: (url: string) => void, _cropSquare: boolean = false) => {
    if (!file) return;
    if (isUploading) {
      toast.error('Another upload is in progress');
      return;
    }
    
    setIsUploading(true);
    const selectTime = performance.now();
    console.log(`[Step 1: File Selection] Category image file "${file.name}" selected at ${new Date().toISOString()}`);
    const toastId = toast.loading('Uploading file: 0%...');
    try {
      const { url, timing } = await uploadRawFileToStorage(file, 'categories', selectTime, (prog) => {
        toast.loading(`Uploading file: ${prog.toFixed(0)}%`, { id: toastId });
      });
      setLastUploadTiming(timing);
      callback(url);
      toast.success('File uploaded successfully!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to upload file.', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isUploading) {
      toast.error('Another upload is in progress');
      return;
    }

    setIsUploading(true);
    const selectTime = performance.now();
    console.log(`[Step 1: File Selection] Product image file "${file.name}" selected at ${new Date().toISOString()}`);
    const toastId = toast.loading('Uploading image: 0%...');
    try {
      const { url, timing } = await uploadRawFileToStorage(file, 'products', selectTime, (prog) => {
        toast.loading(`Uploading image: ${prog.toFixed(0)}%`, { id: toastId });
      });
      setLastUploadTiming(timing);
      setNewProduct(prev => ({ ...prev, imageUrl: url }));
      toast.success('Image uploaded successfully!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to upload image.', { id: toastId });
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = ''; // Reset input to allow re-upload
    }
  };

  const handleDeleteProduct = (productId: string) => {
    setProductToDelete(productId);
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await deleteDoc(doc(db, 'products', productToDelete));
      setProducts(products.filter(p => p.id !== productToDelete));
      toast.success('Product catalog item cleared.');
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `products/${productToDelete}`);
       toast.error('Failed to remove product.');
    } finally {
      setProductToDelete(null);
    }
  };

  const handleConfirmDeleteProdCat = async () => {
    if (!prodCatToDelete) return;
    try {
      await deleteProductCategory(prodCatToDelete);
    } catch (error: any) {
      toast.error(`Failed to delete category: ${error.message}`);
    } finally {
      setProdCatToDelete(null);
    }
  };

  const handleConfirmEditProdCat = async () => {
    if (!editingProdCat || !editingProdCat.newName.trim() || editingProdCat.newName === editingProdCat.oldName) {
      setEditingProdCat(null);
      return;
    }
    try {
      const { editProductCategory } = useSettings.getState();
      await editProductCategory(editingProdCat.oldName, editingProdCat.newName);
      
      const oldCatOriginal = editingProdCat.oldName.toLowerCase().trim();
      let oCat = oldCatOriginal;
      if (oCat === 'exotic vegetables') oCat = 'exotic vegetable';
      if (oCat === 'imported vegetables') oCat = 'imported vegetable';
      if (oCat === 'mushrooms') oCat = 'mushroom';
      
      const newCat = editingProdCat.newName.trim();
      
      const productsToUpdate = products.filter(p => {
        let pCat = p.category?.toLowerCase().trim() || '';
        if (pCat === 'exotic vegetables') pCat = 'exotic vegetable';
        if (pCat === 'imported vegetables') pCat = 'imported vegetable';
        if (pCat === 'mushrooms') pCat = 'mushroom';
        return pCat === oCat || pCat === oldCatOriginal || p.category?.toLowerCase().trim() === oldCatOriginal;
      });
      
      if (productsToUpdate.length > 0) {
        let updatedCount = 0;
        for (const p of productsToUpdate) {
           try {
             await updateDoc(doc(db, 'products', p.id), { 
               category: newCat,
               updatedAt: Date.now()
             });
             updatedCount++;
           } catch(e: any) {
             console.error(`Failed to update product category for ${p.name}:`, e.message);
           }
        }
        if (updatedCount > 0) {
          const m = await import('../store/useProducts');
          await m.useProducts.getState().fetchProducts(true);
          toast.success(`Category renamed and ${updatedCount} products updated`);
        } else {
          toast.success('Category renamed successfully');
        }
      } else {
        toast.success('Category renamed successfully');
      }

    } catch (error: any) {
      toast.error(`Failed to rename category: ${error.message}`);
    } finally {
      setEditingProdCat(null);
    }
  };

  const handleConfirmDeleteJuiceCat = async () => {
    if (!juiceCatToDelete) return;
    try {
      await deleteJuiceCategory(juiceCatToDelete.id, juiceCatToDelete.name);
    } catch (error: any) {
      toast.error(`Failed to delete juice section: ${error.message}`);
    } finally {
      setJuiceCatToDelete(null);
    }
  };

  const handleProductDrop = async (dropIndex: number) => {
    if (draggedProductIdx === null || draggedProductIdx === dropIndex) {
      setDraggedProductIdx(null);
      setDragOverProductIdx(null);
      return;
    }

    const newOrder = [...categorizedFilteredProducts];
    const itemToMove = newOrder[draggedProductIdx];
    const dropItem = newOrder[dropIndex];
    
    // Auto-update category if moved
    let categoryChanged = false;
    if (dropItem) {
        if (itemToMove.category !== dropItem.category) {
            itemToMove.category = dropItem.category;
            categoryChanged = true;
        }
        
        const isJuice1 = itemToMove.category === 'fnl juices' || itemToMove.category === 'fnl juice';
        const isJuice2 = dropItem.category === 'fnl juices' || dropItem.category === 'fnl juice';
        if (isJuice1 && isJuice2) {
           const dropSub = (dropItem as any).subCategory || 'cold-pressed';
           if ((itemToMove as any).subCategory !== dropSub) {
              (itemToMove as any).subCategory = dropSub;
              categoryChanged = true;
           }
        }
    }

    const [removed] = newOrder.splice(draggedProductIdx, 1);
    newOrder.splice(dropIndex, 0, removed);

    try {
      const updates: { id: string, data: any }[] = [];
      newOrder.forEach((p, idx) => {
        const newOrderIndex = (idx + 1) * 10;
        let pData: any = { orderIndex: newOrderIndex, updatedAt: Date.now() };
        if (p.id === itemToMove.id && categoryChanged) {
           pData.category = itemToMove.category;
           if (p.category === 'fnl juices' || p.category === 'fnl juice') {
              pData.subCategory = (itemToMove as any).subCategory;
           }
        }
        if (p.orderIndex !== newOrderIndex || (p.id === itemToMove.id && categoryChanged)) {
          updates.push({ id: p.id, data: pData });
        }
      });

      const chunks = [];
      for (let i = 0; i < updates.length; i += 100) {
        const batch = writeBatch(db);
        const chunk = updates.slice(i, i + 100);
        chunk.forEach(update => {
          batch.update(doc(db, 'products', update.id), update.data);
        });
        await batch.commit();
      }

      setProducts(prevProducts => {
        const updated = prevProducts.map(p => ({...p}));
        newOrder.forEach((p, idx) => {
          const match = updated.find(up => up.id === p.id);
          if (match) {
            match.orderIndex = (idx + 1) * 10;
            if (p.id === itemToMove.id && categoryChanged) {
              match.category = itemToMove.category;
              if (itemToMove.category === 'fnl juices' || itemToMove.category === 'fnl juice') {
                (match as any).subCategory = (itemToMove as any).subCategory;
              }
            }
          }
        });
        return updated.sort((a,b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));
      });
      toast.success('Products reordered successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to reorder products');
    }

    setDraggedProductIdx(null);
    setDragOverProductIdx(null);
  };

  const handleToggleStock = async (product: Product) => {
    try {
      const newStockStatus = !(product.inStock ?? true);
      await updateDoc(doc(db, 'products', product.id), { inStock: newStockStatus, updatedAt: Date.now() });
      setProducts(products.map(p => p.id === product.id ? { ...p, inStock: newStockStatus } : p));
      toast.success(`${product.name} marked as ${newStockStatus ? 'In Stock' : 'Out of Stock'}`);
    } catch (error) {
      toast.error('Failed to update stock status.');
    }
  };

  const handlePriceChange = (productId: string, newPrice: string) => {
    setEditingPrices(prev => ({ ...prev, [productId]: newPrice }));
  };

  const handleSavePrice = async (product: Product) => {
    const newPriceValue = editingPrices[product.id];
    if (!newPriceValue || isNaN(Number(newPriceValue))) {
      toast.error('Invalid price');
      return;
    }
    const parsedPrice = Number(newPriceValue);
    try {
      await updateDoc(doc(db, 'products', product.id), { price: parsedPrice, updatedAt: Date.now() });
      setProducts(products.map(p => p.id === product.id ? { ...p, price: parsedPrice } : p));
      
      const newEditingPrices = { ...editingPrices };
      delete newEditingPrices[product.id];
      setEditingPrices(newEditingPrices);
      
      toast.success(`Price updated to ₹${parsedPrice}`);
    } catch (error) {
      toast.error('Failed to update price.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const fileType = file.name.split('.').pop()?.toLowerCase();
      let rawJson: any[] = [];

      if (fileType === 'csv') {
        const text = await file.text();
        const splitRow = (line: string, delimiter: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
              result.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current);
          return result;
        };

        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length >= 2) {
          const firstLine = lines[0];
          const delimiters = [',', ';', '\t'];
          let detectedDelimiter = ',';
          let maxCols = 0;

          for (const s of delimiters) {
            const cols = firstLine.split(s).length;
            if (cols > maxCols) {
              maxCols = cols;
              detectedDelimiter = s;
            }
          }

          const headers = splitRow(firstLine, detectedDelimiter).map(h => 
            h.replace(/^\ufeff/, '').replace(/^["']|["']$/g, '').trim().toLowerCase()
          );

          for (let i = 1; i < lines.length; i++) {
            const rowValues = splitRow(lines[i], detectedDelimiter);
            const item: Record<string, any> = {};
            for (let j = 0; j < headers.length; j++) {
              const key = headers[j];
              const val = rowValues[j] ? rowValues[j].replace(/^["']|["']$/g, '').trim() : '';
              if (key) {
                item[key] = val;
              }
            }
            rawJson.push(item);
          }
        }
      }

      if (rawJson.length === 0) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        rawJson = XLSX.utils.sheet_to_json(worksheet) as any[];
      }

      const validRows: any[] = [];

      for (const rawRow of rawJson) {
        const row: Record<string, any> = {};
        for (const key in rawRow) {
          const cleanKey = key.replace(/^\ufeff/, '').replace(/^["']|["']$/g, '').trim().toLowerCase();
          row[cleanKey] = rawRow[key];
        }

        let rowName = row.name || row.title || row.product || row.item || row.heading || row.label;
        let rowPrice = row.price || row.sellingprice || row.rate || row.amount || row.priceinrs || row.rupees;
        let rowMrp = row.mrp || row.originalprice || row.regularprice || row.retailprice || row.strikeoutprice;

        if (!rowName || rowPrice === undefined) {
          for (const key of Object.keys(row)) {
            const lowerKey = key.toLowerCase();
            if (!rowName && (lowerKey.includes('name') || lowerKey.includes('product') || lowerKey.includes('title') || lowerKey.includes('item') || lowerKey.includes('fruit') || lowerKey.includes('vegetable') || lowerKey.includes('veg'))) {
              rowName = row[key];
            }
            if (rowPrice === undefined && (lowerKey.includes('price') && !lowerKey.includes('mrp') && !lowerKey.includes('original') || lowerKey.includes('cost') || lowerKey.includes('rate') || lowerKey.includes('amount') || lowerKey.includes('value') || lowerKey.includes('rupee'))) {
              rowPrice = row[key];
            }
            if (rowMrp === undefined && (lowerKey.includes('mrp') || lowerKey.includes('original') || lowerKey.includes('regular'))) {
              rowMrp = row[key];
            }
          }
        }

        if (!rowName || rowPrice === undefined) continue;
        
        let parsedPrice = Number(String(rowPrice).replace(/[^0-9.]/g, '') || 0);
        let parsedMrp = rowMrp ? Number(String(rowMrp).replace(/[^0-9.]/g, '')) : undefined;

        validRows.push({
          name: String(rowName).trim(),
          price: parsedPrice,
          originalPrice: parsedMrp && parsedMrp > parsedPrice ? parsedMrp : null,
          category: (row.category || row.type || 'indian fruits').toLowerCase().trim(),
          description: row.description || row.desc || row.details || '',
          imageUrl: row.imageurl || row.image || row.img || row.photo || '',
          stock: Number(row.stock || row.quantity || row.qty || 100),
          inStock: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      
      if (validRows.length === 0) {
        toast.error('No suitable products identified inside CSV. Standard columns expected: "Name", "Price".');
        setLoading(false);
        if (e.target) e.target.value = '';
        return;
      }
      
      const chunks = [];
      for (let i = 0; i < validRows.length; i += 100) {
        chunks.push(validRows.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(newProd => {
          const docRef = doc(collection(db, 'products'));
          batch.set(docRef, newProd);
        });
        await batch.commit();
      }

      let importedCount = validRows.length;
      
      const m = await import('../store/useProducts');
      await m.useProducts.getState().fetchProducts(true);
      setProducts(m.useProducts.getState().products);

      toast.success(`Excel Import Complete! Cataloged ${importedCount} items.`);
    } catch (error: any) {
      console.error(error);
      toast.error(`Import failed: ${error.message || 'Server error'}`);
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const downloadCsvTemplate = () => {
    const headers = ['Name', 'Price', 'MRP', 'Category', 'Description', 'ImageUrl', 'Stock'];
    const sampleData = [
      ['Gourmet Red Apples', '180', '250', 'Exotic Fruits', 'Sweet and crisp red apples imported from premium orchards.', 'https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg?auto=compress&cs=tinysrgb&w=800', '100'],
      ['Fresh Broccoli Crown', '95', '', 'Exotic Vegetables', 'Grown fresh Broccoli clusters rich in vitamin C.', 'https://images.pexels.com/photos/1359421/pexels-photo-1359421.jpeg?auto=compress&cs=tinysrgb&w=800', '80']
    ];

    const csvRows = [
      headers.join(','),
      ...sampleData.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ];
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.id = "download-csv-link";
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "FreshNLocal_Bulk_Product_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcelTemplate = () => {
    try {
      const templateData = [
        {
          'Name': 'Premium Devgad Alphonso Mangoes',
          'Price': 250,
          'MRP': 350,
          'Category': 'indian fruits',
          'Description': 'Naturally ripened sweet, aromatic mangoes direct from farmers.',
          'ImageUrl': 'https://images.pexels.com/photos/2290753/pexels-photo-2290753.jpeg?auto=compress&cs=tinysrgb&w=800',
          'Stock': 150
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products Template');
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.id = "download-xlsx-link";
      link.href = url;
      link.setAttribute('download', 'FreshNLocal_Bulk_Product_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      downloadCsvTemplate();
    }
  };

  const deleteReview = async (reviewId: string) => {
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      setReviews(reviews.filter(r => r.id !== reviewId));
      toast.success("Review deleted successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete review");
    }
  };

  return (
    <div className="w-full max-w-full box-border overflow-x-hidden flex flex-col md:flex-row min-h-[calc(100vh-80px)] bg-background text-foreground">
      
      {/* Admin Sidebar Navigation */}
      <div className="w-full md:w-64 lg:w-72 border-b md:border-b-0 md:border-r border-border bg-secondary shrink-0 flex flex-col p-4 sm:p-6 sticky top-0 md:top-20 z-10 md:h-[calc(100vh-80px)] overflow-y-auto">
        <div className="space-y-1.5 bg-transparent mb-6 sm:mb-8 mt-2">
          <span className="glass-pill text-[8px] sm:text-[10px]">Command Station</span>
          <h1 className="text-xl sm:text-2xl font-sans font-black uppercase text-foreground tracking-tight mt-2.5">
            Logistics
          </h1>
        </div>
        
        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 no-scrollbar">
          <button 
            onClick={() => navigate('/admin/consignments')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'orders' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <ShoppingBag className="w-4 h-4" /> Consignments
          </button>
          <button 
            onClick={() => navigate('/admin/inventory')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'products' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <Package className="w-4 h-4" /> Order Inventory
          </button>
          <button 
            onClick={() => navigate('/admin/spotlights')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'spotlights' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <Sparkles className="w-4 h-4" /> Spotlights
          </button>
          <button 
            onClick={() => navigate('/admin/categories')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'categories' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <Sliders className="w-4 h-4" /> Categories
          </button>
          <button 
            onClick={() => navigate('/admin/customers')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'customers' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <Users className="w-4 h-4" /> Customers
          </button>
          <button 
            onClick={() => navigate('/admin/hero')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'hero' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <Sparkles className="w-4 h-4" /> Hero Banners
          </button>
          <button 
            onClick={() => navigate('/admin/reviews')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'reviews' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <Sparkles className="w-4 h-4" /> Reviews
          </button>
          <button 
            onClick={() => navigate('/admin/branding')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'branding' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <Globe className="w-4 h-4" /> Branding Settings
          </button>
        </nav>
      </div>

      <div className="flex-1 min-w-0 w-full max-w-[1600px] mx-auto p-4 md:p-8 lg:p-12">

      {loading ? (
        <div className="max-w-7xl mx-auto px-4 py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4">
          <span className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin"></span>
          ACCESSING DATABASES & SYNCHRONIZING SECURE TUNNELS...
        </div>
      ) : (
        activeTab === 'orders' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="slice-bento !p-4 sm:!p-5 flex flex-col gap-1 sm:gap-2">
                <span className="text-muted-foreground text-[9px] sm:text-[10px] font-black uppercase tracking-widest">Total Orders</span>
                <span className="text-2xl sm:text-3xl font-black text-primary tracking-tighter">{filteredOrders.length}</span>
              </div>
              <div className="slice-bento !p-4 sm:!p-5 flex flex-col gap-1 sm:gap-2">
                <span className="text-muted-foreground text-[9px] sm:text-[10px] font-black uppercase tracking-widest">Total Revenue</span>
                <span className="text-2xl sm:text-3xl font-black text-primary tracking-tighter">₹{filteredOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)}</span>
              </div>
              <div className="slice-bento !p-4 sm:!p-5 flex flex-col gap-1 sm:gap-2">
                <span className="text-muted-foreground text-[9px] sm:text-[10px] font-black uppercase tracking-widest">Total Pending</span>
                <span className="text-2xl sm:text-3xl font-black text-primary tracking-tighter">{filteredOrders.filter(o => o.status === 'pending').length}</span>
              </div>
            </div>

            {topProducts.length > 0 && (
              <div className="slice-bento !p-4 sm:!p-5">
                <span className="text-foreground text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-4 block flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Top Selling Products</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {topProducts.map((p, i) => (
                    <div key={i} className="bg-secondary p-3 rounded-xl border border-border flex flex-col gap-1">
                      <span className="text-xs font-bold text-foreground truncate">{p.name}</span>
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-muted-foreground font-bold">{p.quantity} units</span>
                        <span className="text-primary font-mono font-black">₹{p.revenue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter Section */}
            <div className="flex flex-col sm:flex-row gap-4 items-end justify-between bg-secondary p-4 sm:p-5 rounded-2xl border border-border/70 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                  <label className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Filter className="w-3 h-3" /> Filter Status</label>
                  <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="appearance-none border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full sm:w-[160px] uppercase font-black tracking-wider text-foreground cursor-pointer shadow-sm pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat"
                  >
                    <option value="all">ANY STATUS</option>
                    {Array.from(new Map([...STATUS_OPTIONS, ...PICKUP_STATUS_OPTIONS].map(item => [item.value, item])).values()).map(opt => <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                  <label className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Start Date</label>
                  <input 
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full font-mono font-bold tracking-wider text-foreground shadow-sm uppercase min-h-[40px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                  <label className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3 h-3" /> End Date</label>
                  <input 
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    min={dateRange.start}
                    className="border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full font-mono font-bold tracking-wider text-foreground shadow-sm uppercase min-h-[40px]"
                  />
                </div>

              </div>
            </div>
            
            <div className="slice-bento !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px] sm:min-w-[800px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Order ID</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Customer Details</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Items Ordered</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Date and Time</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Amount & Payment</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Order Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[10px] sm:text-xs text-foreground">
                    {filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-black/5 transition-colors">
                        <td className="p-3 sm:p-4 md:p-5 font-mono font-black tracking-wider">
                          <button 
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="text-primary hover:underline text-left flex flex-col gap-1 cursor-pointer focus:outline-none"
                          >
                            <span className="font-extrabold">{order.orderNumber || `FNL-${order.id.slice(0, 8).toUpperCase()}`}</span>
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground bg-neutral-100 hover:bg-neutral-200 border border-border px-1.5 py-0.5 rounded-md inline-block text-center font-bold">View Slip 🧾</span>
                          </button>
                        </td>
                        <td className="p-3 sm:p-4 md:p-5 leading-relaxed max-w-[200px] sm:max-w-xs whitespace-normal">
                          <span className="font-extrabold text-foreground uppercase block text-[10px] sm:text-xs">{order.shippingDetails?.name || 'Customer'}</span>
                          <span className={`inline-flex px-1.5 py-0.5 mt-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${order.customerType === 'horeca' ? 'bg-orange-500/10 text-orange-600' : 'bg-blue-500/10 text-blue-600'}`}>
                            {order.customerType || 'retail'}
                          </span>
                          <span className="text-muted-foreground font-mono text-[10px] sm:text-xs tracking-wider block mt-0.5 font-bold">{order.shippingDetails?.phone || 'No phone'}</span>
                          <span className="text-muted-foreground text-[8px] sm:text-[9px] block mt-1 leading-snug">{order.shippingDetails?.address?.includes('Store Pickup') ? 'STORE PICKUP' : (order.shippingDetails?.address || 'No address provided')}</span>
                        </td>
                        <td className="p-3 sm:p-4 md:p-5 leading-normal max-w-[220px] whitespace-normal">
                          <div className="space-y-1">
                            {order.items && order.items.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {(order.items || []).map((item: any, idx: number) => {
                                  const prod = item?.product || item;
                                  if (!prod) return null;
                                  return (
                                    <div key={idx} className="flex justify-between items-start gap-2 text-[10px] sm:text-xs border-b border-dashed border-border/40 pb-0.5 last:border-0">
                                      <span className="text-muted-foreground font-medium truncate max-w-[140px] sm:max-w-[170px] inline-block">
                                        <span className="font-extrabold text-[#111111]">{item.quantity || 1}x</span> {prod.name || 'Unknown'}
                                        {prod.unit ? <span className="text-[8px] text-muted-foreground ml-1">({prod.unit})</span> : null}
                                      </span>
                                      <span className="font-mono text-muted-foreground text-[9px] sm:text-[10px] shrink-0 font-black">
                                        ₹{(prod.price || 0) * (item.quantity || 1)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic text-[9px]">No items found</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 sm:p-4 md:p-5 font-medium whitespace-nowrap">
                          <span className="block font-bold">{new Date(order.createdAt).toLocaleDateString()}</span>
                          <span className="block text-muted-foreground text-[10px] mt-0.5">{new Date(order.createdAt).toLocaleTimeString()}</span>
                        </td>
                        <td className="p-3 sm:p-4 md:p-5 leading-relaxed whitespace-nowrap">
                          <span className="font-black text-primary text-sm sm:text-base block mb-1">₹{order.totalAmount}</span>
                          <span className="text-foreground font-bold text-[9px] bg-secondary border border-border px-2 py-0.5 rounded tracking-widest uppercase inline-block">{order.paymentMethod || 'COD'}</span>
                        </td>
                        <td className="p-3 sm:p-4 md:p-5">
                          <div className="flex items-center gap-2">
                            <OrderStatusDropdown 
                              currentStatus={order.status} 
                              onStatusChange={(newStatus) => handleUpdateOrderStatus(order.id, newStatus)} 
                              isPickup={order.shippingDetails?.address?.includes('Store Pickup')}
                            />
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(order.id)}
                              className="text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-xl transition-colors shrink-0"
                              title="Delete Order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-muted-foreground font-mono text-xxs tracking-widest uppercase">
                          Zero active consignments match filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'products' ? (
          <div className="space-y-6 sm:space-y-8">
            {/* Top Workspace Segmentation Selector */}
            <div className="flex bg-neutral-100 p-1 rounded-xl max-w-md mx-auto border border-border shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setProductSection('veg-fruits');
                  setNewProduct(prev => ({ ...prev, category: 'indian fruits' }));
                }}
                className={`flex-1 py-2.5 px-4 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  productSection === 'veg-fruits'
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🍏 Veggies & Fruits
              </button>
              <button
                type="button"
                onClick={() => {
                  setProductSection('juices');
                  setNewProduct(prev => ({ ...prev, category: 'fnl juices' }));
                }}
                className={`flex-1 py-2.5 px-4 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  productSection === 'juices'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-orange-600 hover:text-orange-700'
                }`}
              >
                🍹 Juice House Menu
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
              {/* Left form desk: manual additions & CSV operations */}
              <div className={`col-span-12 lg:col-span-4 xl:col-span-3 space-y-6 sm:space-y-8 bg-secondary border border-border p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-[32px] shadow-sm transition-all ${
                productSection === 'juices' ? 'ring-2 ring-orange-500/10' : 'ring-2 ring-emerald-500/10'
              }`}>
                <div className="space-y-4">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground flex items-start gap-2">
                    {editingProductId ? <Edit2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0 mt-0.5" /> : <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0 mt-0.5" />} 
                    {editingProductId ? (
                      productSection === 'juices' ? 'Edit FNL Juice Listing' : 'Edit Produce Listing'
                    ) : (
                      productSection === 'juices' ? 'Add FNL Cold-Pressed Juice' : 'Add New Produce Stock'
                    )}
                  </h3>

                  {productSection === 'juices' && !editingProductId && (
                    <div className="p-3 bg-gradient-to-br from-orange-500/5 to-amber-500/5 border border-orange-500/20 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-orange-600 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-orange-700">Signature Juice Menu Sync</span>
                      </div>
                      <p className="text-[9px] text-[#4a4a4a] leading-relaxed font-semibold">
                        Instantly deploy the 36 authentic FreshNLocal.CO menu products (Smoothies, detox cold-presses, satvik hydration) directly into your active store database.
                      </p>
                      <button
                        type="button"
                        disabled={seedingJuices}
                        onClick={handleSeedSignatureJuices}
                        className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white text-[8px] sm:text-[9px] font-black uppercase tracking-widest rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {seedingJuices ? "Syncing Catalogue..." : "Deploy 36 Menu Items Now"}
                      </button>
                    </div>
                  )}
                  
                  <form onSubmit={handleSaveProduct} className="space-y-4">
                    <div className="space-y-1.5 sm:space-y-2">
                      <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        {productSection === 'juices' ? 'Juice / Drink Name' : 'Crop/Item Name'}
                      </label>
                      <input 
                        required 
                        placeholder={productSection === 'juices' ? 'Watermelon Punch or Mango Smoothie...' : 'Royal Washington Red Apples...'} 
                        className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                        value={newProduct.name} 
                        onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rate Price (₹)</label>
                        <input 
                          required 
                          type="number" 
                          placeholder="180" 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                          value={newProduct.price} 
                          onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
                        />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">MRP (Optional ₹)</label>
                        <input 
                          type="number" 
                          placeholder="250" 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                          value={newProduct.originalPrice} 
                          onChange={e => setNewProduct({...newProduct, originalPrice: e.target.value})} 
                        />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Price (Optional ₹)</label>
                        <input 
                          type="number" 
                          placeholder="150" 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                          value={newProduct.horecaPrice} 
                          onChange={e => setNewProduct({...newProduct, horecaPrice: e.target.value})} 
                        />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Quantity & Unit</label>
                        <div className="flex gap-2">
                          <input 
                            required
                            type="number"
                            step="any"
                            placeholder="Qty (e.g. 1, 500)" 
                            className="flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                            value={newProduct.quantityValue || ''} 
                            onChange={e => setNewProduct({...newProduct, quantityValue: e.target.value, unit: `${e.target.value} ${newProduct.quantityUnit || 'Kg'}`})} 
                          />
                          <select
                            className="w-20 sm:w-24 flex-shrink-0 appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 pr-8 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-bold bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] sm:bg-[length:12px_12px] bg-[right_8px_center] sm:bg-[right_10px_center] bg-no-repeat"
                            value={newProduct.quantityUnit || 'Kg'}
                            onChange={e => setNewProduct({...newProduct, quantityUnit: e.target.value, unit: `${newProduct.quantityValue || ''} ${e.target.value}`})}
                          >
                            {['Kg', 'g', 'L', 'ml', 'Pc', 'Pack', 'Box', 'Bottle', 'Can', 'Dozen', 'Bunch', 'Tray'].map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Unit (Optional)</label>
                        <div className="flex gap-2">
                          <input 
                            type="number"
                            step="any"
                            placeholder="Qty" 
                            className="flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                            value={newProduct.horecaQuantityValue || ''} 
                            onChange={e => setNewProduct({...newProduct, horecaQuantityValue: e.target.value, horecaUnit: e.target.value ? `${e.target.value} ${newProduct.horecaQuantityUnit || 'Kg'}` : ''})} 
                          />
                          <select
                            className="w-20 sm:w-24 flex-shrink-0 appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 pr-8 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-bold bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] sm:bg-[length:12px_12px] bg-[right_8px_center] sm:bg-[right_10px_center] bg-no-repeat"
                            value={newProduct.horecaQuantityUnit || 'Kg'}
                            onChange={e => setNewProduct({...newProduct, horecaQuantityUnit: e.target.value, horecaUnit: newProduct.horecaQuantityValue ? `${newProduct.horecaQuantityValue} ${e.target.value}` : ''})}
                          >
                            {['Kg', 'g', 'L', 'ml', 'Pc', 'Pack', 'Box', 'Bottle', 'Can', 'Dozen', 'Bunch', 'Tray'].map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    
                    {/* Variants Management */}
                    <div className="space-y-3 bg-secondary/30 p-4 rounded-xl border border-border/50 col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-foreground">Different Sizes / Variants</label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewProduct({
                              ...newProduct,
                              variants: [...(newProduct.variants || []), { unit: '', quantityValue: '', quantityUnit: 'Kg', horecaQuantityValue: '', horecaQuantityUnit: 'Kg', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '' }]
                            });
                          }}
                          className="text-[10px] bg-primary text-white px-2 py-1 rounded flex items-center gap-1 font-bold"
                        >
                          <Plus className="w-3 h-3" /> Add Variant
                        </button>
                      </div>
                      
                      {newProduct.variants && newProduct.variants.length > 0 && (
                        <div className="space-y-4">
                          {newProduct.variants.map((variant, vIdx) => (
                            <div key={vIdx} className="bg-white p-4 sm:p-5 rounded-2xl border border-border relative">
                              <button
                                type="button"
                                onClick={() => {
                                  const newVariants = newProduct.variants.filter((_, i) => i !== vIdx);
                                  setNewProduct({...newProduct, variants: newVariants});
                                }}
                                className="absolute -top-3 -right-3 bg-white text-red-500 p-2 rounded-full border border-border shadow-sm hover:bg-red-50 transition-colors z-10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              
                              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rate Price (₹)</label>
                                  <input 
                                    placeholder="180" 
                                    type="number"
                                    value={variant.price}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].price = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono"
                                  />
                                </div>
                                
                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">MRP (Optional ₹)</label>
                                  <input 
                                    placeholder="250" 
                                    type="number"
                                    value={variant.originalPrice}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].originalPrice = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono"
                                  />
                                </div>

                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Price (Optional ₹)</label>
                                  <input 
                                    placeholder="150" 
                                    type="number"
                                    value={variant.horecaPrice}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].horecaPrice = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono"
                                  />
                                </div>

                                <div className="space-y-1.5 sm:space-y-2 col-span-2 sm:col-span-1">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Quantity & Unit</label>
                                  <div className="flex gap-2">
                                    <input 
                                      required
                                      type="number"
                                      step="any"
                                      placeholder="Qty" 
                                      value={variant.quantityValue || ''}
                                      onChange={(e) => {
                                        const newVariants = [...newProduct.variants];
                                        newVariants[vIdx].quantityValue = e.target.value;
                                        newVariants[vIdx].unit = `${e.target.value} ${newVariants[vIdx].quantityUnit || 'Kg'}`;
                                        setNewProduct({...newProduct, variants: newVariants});
                                      }}
                                      className="flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs"
                                    />
                                    <select
                                      className="w-20 sm:w-24 flex-shrink-0 appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 pr-8 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-bold bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] sm:bg-[length:12px_12px] bg-[right_8px_center] sm:bg-[right_10px_center] bg-no-repeat"
                                      value={variant.quantityUnit || 'Kg'}
                                      onChange={(e) => {
                                        const newVariants = [...newProduct.variants];
                                        newVariants[vIdx].quantityUnit = e.target.value;
                                        newVariants[vIdx].unit = `${newVariants[vIdx].quantityValue || ''} ${e.target.value}`;
                                        setNewProduct({...newProduct, variants: newVariants});
                                      }}
                                    >
                                      {['Kg', 'g', 'L', 'ml', 'Pc', 'Pack', 'Box', 'Bottle', 'Can', 'Dozen', 'Bunch', 'Tray'].map(u => (
                                        <option key={u} value={u}>{u}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                
                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">HoReCa Unit</label>
                                  <div className="flex gap-2">
                                    <input 
                                      type="number"
                                      step="any"
                                      placeholder="Qty" 
                                      value={variant.horecaQuantityValue || ''}
                                      onChange={(e) => {
                                        const newVariants = [...newProduct.variants];
                                        newVariants[vIdx].horecaQuantityValue = e.target.value;
                                        newVariants[vIdx].horecaUnit = e.target.value ? `${e.target.value} ${newVariants[vIdx].horecaQuantityUnit || 'Kg'}` : '';
                                        setNewProduct({...newProduct, variants: newVariants});
                                      }}
                                      className="flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs"
                                    />
                                    <select
                                      className="w-20 sm:w-24 flex-shrink-0 appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 pr-8 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-bold bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] sm:bg-[length:12px_12px] bg-[right_8px_center] sm:bg-[right_10px_center] bg-no-repeat"
                                      value={variant.horecaQuantityUnit || 'Kg'}
                                      onChange={(e) => {
                                        const newVariants = [...newProduct.variants];
                                        newVariants[vIdx].horecaQuantityUnit = e.target.value;
                                        newVariants[vIdx].horecaUnit = newVariants[vIdx].horecaQuantityValue ? `${newVariants[vIdx].horecaQuantityValue} ${e.target.value}` : '';
                                        setNewProduct({...newProduct, variants: newVariants});
                                      }}
                                    >
                                      {['Kg', 'g', 'L', 'ml', 'Pc', 'Pack', 'Box', 'Bottle', 'Can', 'Dozen', 'Bunch', 'Tray'].map(u => (
                                        <option key={u} value={u}>{u}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {productSection === 'veg-fruits' ? (
                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#059669] font-extrabold">Produce Category</label>
                          <select 
                            className="w-full appearance-none border border-border rounded-xl sm:rounded-2xl py-2.5 sm:py-3.5 pl-3 sm:pl-4 pr-10 bg-white outline-none focus:border-primary text-foreground transition-colors text-[9px] sm:text-[10px] uppercase font-bold tracking-wider bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_14px_center] bg-no-repeat" 
                            value={newProduct.category === 'fnl juices' ? (productCategories[0]?.toLowerCase() || 'indian fruits') : newProduct.category} 
                            onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                          >
                            {productCategories.map(cat => cat ? (
                              <option key={cat} value={cat.toLowerCase()}>{cat}</option>
                            ) : null)}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-orange-600 font-extrabold">Juice Menu Section</label>
                          <select 
                            className="w-full appearance-none border border-orange-500/20 rounded-xl sm:rounded-2xl py-2.5 sm:py-3.5 pl-3 sm:pl-4 pr-10 bg-orange-50/20 outline-none focus:border-orange-500 text-[#151515] transition-colors text-[9px] sm:text-[10px] uppercase font-black tracking-wider bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23f97316%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_14px_center] bg-no-repeat" 
                            value={newProduct.subCategory || 'cold-pressed'} 
                            onChange={e => setNewProduct({...newProduct, category: 'fnl juices', subCategory: e.target.value})}
                          >
                            {juiceCategories.map(sec => sec ? (
                              <option key={sec.id} value={sec.id}>{sec.name.toUpperCase()}</option>
                            ) : null)}
                          </select>
                        </div>
                      )}
                    </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground flex justify-between">
                      <span>Product Image (URL or Upload)</span>
                      <label className="text-primary hover:underline cursor-pointer">
                        Direct Upload
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-16 aspect-[4/3] bg-white dark:bg-white rounded-xl border border-border flex items-center justify-center overflow-hidden shrink-0">
                        {newProduct.imageUrl ? (
                          <img src={newProduct.imageUrl || undefined} alt="Preview" className="w-full h-full object-contain object-center" />
                        ) : (
                          <Upload className="w-4 h-4 text-muted-foreground opacity-50" />
                        )}
                      </div>
                      <input 
                        placeholder="https://images.pexels.com/... or upload" 
                        className="flex-1 min-w-0 border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                        value={newProduct.imageUrl} 
                        onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})} 
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Order Description</label>
                    <textarea 
                      placeholder="Details about seed origin, crisp index, weight parameters..." 
                      rows={3} 
                      className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs resize-none placeholder:text-muted-foreground font-medium leading-relaxed" 
                      value={newProduct.description} 
                      onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                    />
                  </div>

                  {editingProductId ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      <button 
                        type="button" 
                        onClick={handleCancelEdit}
                        className="w-full py-3 sm:py-4 text-[9px] sm:text-[10px] bg-white border border-border text-foreground font-black uppercase tracking-widest rounded-xl hover:bg-black/5 transition-all outline-none"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="slice-btn-primary w-full py-3 sm:py-4 text-[9px] sm:text-[10px] font-black shadow-[0_4px_15px_rgba(0,184,83,0.2)] hover:scale-102 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        Update Stock <Check className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      type="submit" 
                      className="slice-btn-primary w-full py-3 sm:py-4 text-[9px] sm:text-[10px] font-black mt-2 shadow-[0_4px_15px_rgba(0,184,83,0.2)] hover:scale-102 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Commit Stock <Plus className="w-4 h-4 text-white" />
                    </button>
                  )}
                </form>
              </div>
              
              {/* Excel/CSV Block integration */}
              <div className="pt-6 sm:pt-8 border-t border-border space-y-4 sm:space-y-6" id="bulk-import-section">
                <div className="space-y-1 sm:space-y-2">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                    <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> Bulk Harvest Injector
                  </h3>
                  <p className="text-muted-foreground text-[9px] sm:text-xxs font-semibold leading-relaxed">
                    Instantly catalog hundreds of crops from farmer spreadsheet boards. Fuzzy mappings auto-resolve headers.
                  </p>
                </div>
                
                <div className="p-4 sm:p-5 bg-white border border-dashed border-border rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4">
                  <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Download Standard template sheets
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3.5">
                    <button 
                      type="button" 
                      onClick={downloadExcelTemplate} 
                      className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 bg-background hover:bg-black/5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider rounded-lg sm:rounded-xl border border-border transition-colors text-foreground cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" /> <span className="hidden sm:inline">Excel</span> (.xlsx)
                    </button>
                    <button 
                      type="button" 
                      onClick={downloadCsvTemplate} 
                      className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 bg-background hover:bg-black/5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider rounded-lg sm:rounded-xl border border-border transition-colors text-foreground cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" /> <span className="hidden sm:inline">CSV</span> (.csv)
                    </button>
                  </div>
                </div>

                <label className="w-full py-3 sm:py-4.5 rounded-xl sm:rounded-[18px] bg-white hover:bg-primary/5 border border-border hover:border-primary/50 text-foreground hover:text-primary transition-all flex items-center justify-center gap-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest cursor-pointer">
                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Inject Excel / CSV file
                  <input 
                    type="file" 
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
              </div>

              {/* Image Storage Migration Section */}
              <div className="pt-6 sm:pt-8 border-t border-border space-y-4 sm:space-y-6">
                <div className="space-y-1 sm:space-y-2">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" /> Cloud Storage Migrate
                  </h3>
                  <p className="text-muted-foreground text-[9px] sm:text-xxs font-semibold leading-relaxed">
                    Optimize database storage by shifting embedded base64 product images into secure Firebase Cloud Storage buckets. This prevents slow loads and memory crashes.
                  </p>
                </div>

                <div className="p-4 sm:p-5 bg-white border border-border rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4 shadow-sm">
                  {migrationStatus.migrating ? (
                    <div className="space-y-3.5">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        <span>Processing Images...</span>
                        <span className="text-primary font-mono">{migrationStatus.processed} / {migrationStatus.total}</span>
                      </div>
                      <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${migrationStatus.total ? (migrationStatus.processed / migrationStatus.total) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[9px] font-black tracking-widest uppercase text-muted-foreground">
                        <div>Migrated: <span className="text-primary">{migrationStatus.migrated}</span></div>
                        <div>Errors: <span className="text-red-500">{migrationStatus.errors}</span></div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={runImageMigration}
                      className="w-full py-3 sm:py-4 bg-[#09120b] hover:bg-neutral-800 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Migrate Images to Cloud Storage
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Live table view of product catalogs */}
            <div className="col-span-12 lg:col-span-8 xl:col-span-9 bg-white border border-border shadow-sm rounded-2xl sm:rounded-[32px] overflow-hidden min-w-0">
              <div className="p-4 sm:p-5 md:p-6 border-b border-border bg-secondary flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><Package className="w-4 h-4" /> Active Catalog</h3>
                  <p className="text-[9px] text-[#059669] font-bold uppercase tracking-wider">
                    {productSection === 'all' && "All Registered Inventory"}
                    {productSection === 'veg-fruits' && "Vegetables & Fruits Selection"}
                    {productSection === 'juices' && "FNL Cold-Pressed Juices Showcase"}
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleExportCSV}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-neutral-900 hover:bg-black text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <input 
                    type="search"
                    placeholder="Search inventory..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full max-w-[200px] sm:max-w-xs border border-border/80 rounded-xl px-3 py-2 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors uppercase font-black tracking-wider text-foreground placeholder:text-muted-foreground/50 shadow-sm"
                  />
                </div>
              </div>

              {/* SECTION NAVIGATION FOR FRUITS/VEGETABLES VS JUICE SECTIONS */}
              <div className="flex border-b border-border bg-neutral-50 p-1.5 gap-1.5">
                <button
                  onClick={() => setProductSection('all')}
                  className={`flex-1 py-2 rounded-xl text-[8.5px] uppercase font-black tracking-widest transition-all cursor-pointer ${
                    productSection === 'all'
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
                  }`}
                >
                  All Items ({products.length})
                </button>
                <button
                  onClick={() => setProductSection('veg-fruits')}
                  className={`flex-1 py-2 rounded-xl text-[8.5px] uppercase font-black tracking-widest transition-all cursor-pointer ${
                    productSection === 'veg-fruits'
                      ? 'bg-[#059669] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-neutral-100'
                  }`}
                >
                  🍎 Vegetables & Fruits ({products.filter(p => p.category !== 'fnl juices' && p.category !== 'fnl juice').length})
                </button>
                <button
                  onClick={() => setProductSection('juices')}
                  className={`flex-1 py-2 rounded-xl text-[8.5px] uppercase font-black tracking-widest transition-all cursor-pointer ${
                    productSection === 'juices'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-orange-600 hover:text-orange-700 hover:bg-neutral-100'
                  }`}
                >
                  🍹 FNL Juices ({products.filter(p => p.category === 'fnl juices' || p.category === 'fnl juice').length})
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[550px] lg:min-w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 whitespace-nowrap">Product Details</th>
                      <th className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 whitespace-nowrap">Catalog Category</th>
                      <th className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 whitespace-nowrap">Rate (₹)</th>
                      <th className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 whitespace-nowrap text-center">In Stock</th>
                      <th className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 text-right whitespace-nowrap">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[10px] sm:text-xs text-foreground">
                    {categorizedFilteredProducts.map((product, idx) => {
                      const isJuice = product.category === 'fnl juices' || product.category === 'fnl juice';
                      
                      const juiceSubCategory = (product as any).subCategory || 'cold-pressed';
                      const currentCategoryGroupId = isJuice ? 'juice_' + juiceSubCategory.toLowerCase().trim() : (product.category || '').toLowerCase().trim();
                      
                      let previousCategoryGroupId = null;
                      if (idx > 0) {
                         const prev = categorizedFilteredProducts[idx - 1];
                         const prevIsJuice = prev.category === 'fnl juices' || prev.category === 'fnl juice';
                         const prevSubCategory = (prev as any).subCategory || 'cold-pressed';
                         previousCategoryGroupId = prevIsJuice ? 'juice_' + prevSubCategory.toLowerCase().trim() : (prev.category || '').toLowerCase().trim();
                      }
                      
                      const showHeader = currentCategoryGroupId !== previousCategoryGroupId;
                      
                      const displayJuiceLabel = 
                        juiceSubCategory === 'cold-pressed' ? 'Cold-Pressed' :
                        juiceSubCategory === 'detox' ? 'Detox Juice' :
                        juiceSubCategory === 'satvik' ? 'Satvik Drink' :
                        juiceSubCategory === 'smoothies' ? 'Sugar Free Smoothie' :
                        juiceSubCategory === 'sweet-cravings' ? 'Sweet Craving' :
                        juiceSubCategory === 'special' ? 'Our Special' : 'Juice';

                      const isEditingPrice = editingPrices[product.id] !== undefined;

                      return (
                        <React.Fragment key={product.id}>
                          {showHeader && (
                            <tr className="bg-secondary/30">
                              <td colSpan={5} className="py-4 sm:py-6 px-3 sm:px-5">
                                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#151515] bg-white border border-border px-4 py-2 rounded-xl shadow-sm">
                                  {isJuice ? '🍹 FNL Juices / ' + displayJuiceLabel : (product.category || '').replace(/ font-bold/gi, '')}
                                </span>
                              </td>
                            </tr>
                          )}
                          <tr 
                            draggable 
                            onDragStart={(e) => {
                               setDraggedProductIdx(idx);
                               e.dataTransfer.effectAllowed = 'move';
                            }}
                          onDragOver={(e) => {
                             e.preventDefault();
                             setDragOverProductIdx(idx);
                          }}
                          onDragLeave={() => setDragOverProductIdx(null)}
                          onDrop={(e) => {
                             e.preventDefault();
                             handleProductDrop(idx);
                          }}
                          className={`transition-colors cursor-move ${dragOverProductIdx === idx ? 'border-primary border-t-2 border-dashed' : ''} ${product.inStock === false ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-black/5'}`}
                        >
                          <td className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 flex items-center gap-2 sm:gap-3">
                            <div className={`w-10 sm:w-12 md:w-16 aspect-[4/3] rounded-lg sm:rounded-xl bg-white dark:bg-white overflow-hidden border border-border flex-shrink-0 ${product.inStock === false ? 'opacity-50 grayscale' : ''}`}>
                              <img src={product.imageUrl || getCategoryImage(product.category) || undefined} alt="" loading="lazy" className="w-full h-full object-contain object-center" />
                            </div>
                            <span className="font-extrabold text-foreground uppercase tracking-wide truncate max-w-[100px] sm:max-w-[150px] lg:max-w-[200px] text-[9px] sm:text-xs">{product.name}</span>
                          </td>
                          <td className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 font-bold uppercase tracking-wider text-[8px] sm:text-[10px] whitespace-nowrap">
                            {isJuice ? (
                              <span className="bg-orange-500/10 border border-orange-500/20 text-orange-600 px-2 py-0.5 rounded-full inline-block font-extrabold tracking-widest text-[7.5px] uppercase">
                                🍹 {displayJuiceLabel}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {(product.category || '').replace(/ font-bold/gi, '')}
                              </span>
                            )}
                          </td>
                          <td className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 font-bold font-mono text-foreground text-[10px] sm:text-xs whitespace-nowrap">
                            {isEditingPrice ? (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">₹</span>
                                <input
                                  type="number"
                                  className="w-16 sm:w-20 bg-white border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary"
                                  value={editingPrices[product.id] ?? ''}
                                  onChange={(e) => handlePriceChange(product.id, e.target.value)}
                                />
                                <button onClick={() => handleSavePrice(product)} className="text-primary hover:text-green-600 font-black bg-primary/10 rounded px-2 py-1 tracking-widest uppercase text-[8px]">
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span>₹{product.price}</span>
                                <button onClick={() => handlePriceChange(product.id, String(product.price))} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary p-1 bg-white border border-border rounded">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleToggleStock(product)}
                              className={`relative inline-flex h-5 sm:h-6 w-9 sm:w-11 items-center rounded-full transition-colors ${
                                product.inStock !== false ? 'bg-primary' : 'bg-red-500'
                              } focus:outline-none`}
                            >
                              <span
                                className={`inline-block h-3 sm:h-4 w-3 sm:w-4 transform rounded-full bg-white transition-transform ${
                                  product.inStock !== false ? 'translate-x-5 sm:translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                            <span className="block mt-1 text-muted-foreground uppercase tracking-widest text-[7px] whitespace-nowrap">
                              {product.inStock !== false ? 'In Stock' : 'Out'}
                            </span>
                          </td>
                          <td className="p-3 sm:p-4 md:p-5 lg:p-3 xl:p-4 text-right space-x-2 whitespace-nowrap">
                          <button 
                            onClick={() => handleEditSetup(product)} 
                            className="text-muted-foreground hover:text-primary p-1.5 sm:p-2 md:p-2.5 bg-background border border-border rounded-full hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteProduct(product.id)} 
                            className="text-muted-foreground hover:text-red-500 p-1.5 sm:p-2 md:p-2.5 bg-background border border-border rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      </React.Fragment>
                      );
                    })}
                    {categorizedFilteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-10 text-center text-muted-foreground font-mono text-xxs tracking-widest uppercase">
                          Zero items registered inside the database yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
        ) : activeTab === 'spotlights' ? (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase text-foreground">Shop By Categories Config</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                  Manage the visuals for Home page category cards
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {(Object.entries(spotlightsConfig) as [string, {title: string, image: string}][]).map(([key, config]) => (
                <div key={key} className="slice-card p-4 sm:p-6 bg-secondary border border-border flex flex-col gap-3 sm:gap-4 relative overflow-hidden group">
                  <h3 className="font-extrabold text-xs uppercase tracking-widest text-foreground z-10">{config.title}</h3>
                  <div className="w-full aspect-square rounded-xl overflow-hidden bg-white border border-border z-10">
                     <img src={config.image || null} alt={config.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="z-10 bg-white/50 dark:bg-black/50 p-3 rounded-lg backdrop-blur-sm border border-border">
                    <label className="text-[9px] uppercase tracking-widest font-extrabold text-foreground block mb-2">Image Source</label>
                    <div className="flex flex-col gap-3">
                      <div className="relative group/upload">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleSpotlightImageUpload(key, e)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-secondary hover:bg-secondary/80 border border-border border-dashed rounded-lg transition-colors group-hover/upload:border-primary">
                          <Upload className="w-3.5 h-3.5 text-muted-foreground group-hover/upload:text-primary transition-colors" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover/upload:text-primary transition-colors">
                            Upload / Take Photo
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="h-px bg-border flex-1"></div>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">or</span>
                        <div className="h-px bg-border flex-1"></div>
                      </div>

                      <input 
                        type="url"
                        value={config.image}
                        onChange={(e) => updateSpotlightValue(key, 'image', e.target.value)}
                        placeholder="https://..."
                        className="slice-input w-full text-[10px]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        ) : activeTab === 'customers' ? (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-border shadow-sm">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Customers</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage user roles and HoReCa access</p>
              </div>
            </div>
            
            
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-border">
                <input 
                  type="text" 
                  placeholder="Search customers by name, email, or phone..." 
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full sm:max-w-md border border-border rounded-xl px-4 py-3 bg-muted/30 outline-none focus:border-primary text-xs"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground border-b border-border">
                      <th className="px-4 sm:px-6 py-4">Customer</th>
                      <th className="px-4 sm:px-6 py-4">Contact</th>
                      <th className="px-4 sm:px-6 py-4">Role</th>
                      <th className="px-4 sm:px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingCustomers ? (
                      <tr>
                        <td colSpan={4} className="px-4 sm:px-6 py-8 text-center text-xs text-muted-foreground">Loading customers...</td>
                      </tr>
                    ) : customers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 sm:px-6 py-8 text-center text-xs text-muted-foreground">No customers found.</td>
                      </tr>
                    ) : (
                      customers.filter(c => 
                        (c.displayName || '').toLowerCase().includes(customerSearch.toLowerCase()) || 
                        (c.email || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
                        (c.phone || '').includes(customerSearch)
                      ).map(customer => (
                        <tr key={customer.uid} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                          <td className="px-4 sm:px-6 py-4">
                            <div className="text-xs sm:text-sm font-bold text-foreground">{customer.displayName || 'Unknown'}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="text-[10px] sm:text-xs text-muted-foreground">{customer.email}</div>
                            {customer.phone && <div className="text-[10px] sm:text-xs text-muted-foreground">{customer.phone}</div>}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${customer.role === 'admin' ? 'bg-red-500/10 text-red-600' : customer.role === 'horeca' ? 'bg-orange-500/10 text-orange-600' : 'bg-blue-500/10 text-blue-600'}`}>
                              {customer.role || 'customer'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-right">
                            {customer.role !== 'admin' && (
                              <button 
                                onClick={() => handleToggleHoreca(customer)}
                                className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${customer.role === 'horeca' ? 'bg-muted text-foreground hover:bg-muted/80' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                              >
                                {customer.role === 'horeca' ? 'Revoke HoReCa' : 'Make HoReCa'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'categories' ? (
          <div className="max-w-4xl mx-auto space-y-12">
            
            {/* PRODUCE CATEGORIES MANAGEMENT */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase text-foreground">Produce Categories</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                  Manage categories in the farm catalog or register custom ones
                </p>
              </div>

              {/* Add Produce Category Form Card */}
              <div className="slice-card p-6 bg-secondary/80 border border-border rounded-w flex flex-col gap-4">
                <span className="text-[10px] uppercase tracking-widest font-extrabold text-primary">Add New Produce Category</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Category Name</label>
                    <input 
                      type="text"
                      id="new-prod-cat-name-input"
                      value={newProdCatName}
                      onChange={(e) => setNewProdCatName(e.target.value)}
                      placeholder="e.g. Dry Fruits, Exotic Berries..."
                      className="slice-input w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="block text-[8px] font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                      <span>Illustration Image (URL or Upload)</span>
                      <label className="text-primary hover:underline cursor-pointer font-black uppercase tracking-wider text-[8px]">
                        [ Direct Upload ]
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              processImageFile(file, (url) => setNewProdCatImg(url), true);
                            }
                          }} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                    <input 
                      type="url"
                      id="new-prod-cat-img-input"
                      value={newProdCatImg}
                      onChange={(e) => setNewProdCatImg(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="slice-input w-full"
                    />
                  </div>
                </div>
                <button
                  id="add-prod-cat-btn"
                  disabled={isAddingProdCat}
                  onClick={async () => {
                    if (!newProdCatName.trim()) {
                      toast.error('Please enter a category name');
                      return;
                    }
                    try {
                      setIsAddingProdCat(true);
                      await addProductCategory(newProdCatName.trim(), newProdCatImg.trim() || undefined);
                      setNewProdCatName('');
                      setNewProdCatImg('');
                    } catch (e: any) {
                      toast.error(e.message || 'Error occurred');
                    } finally {
                      setIsAddingProdCat(false);
                    }
                  }}
                  className="slice-btn-primary px-6 py-3 self-end flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Produce Category
                </button>
              </div>

              {/* Grid of registered produce categories */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {productCategories.map((cat, index) => {
                  if (!cat) return null;
                  const currentImg = getCategoryImage(cat, categoryImages);
                  const normalizedKey = cat.toLowerCase().replace(/ font-bold/gi, '').trim();
                  const customImg = categoryImages[normalizedKey] || '';
                  return (
                    <div 
                      key={cat} 
                      draggable
                      onDragStart={(e) => {
                        setDraggedProdCat(index);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverProdCat(index);
                      }}
                      onDragLeave={() => setDragOverProdCat(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedProdCat !== null && draggedProdCat !== index) {
                          const newOrder = [...productCategories];
                          const [removed] = newOrder.splice(draggedProdCat, 1);
                          newOrder.splice(index, 0, removed);
                          reorderProductCategories(newOrder);
                        }
                        setDraggedProdCat(null);
                        setDragOverProdCat(null);
                      }}
                      className={`slice-card p-4 sm:p-6 bg-secondary border flex flex-col gap-3 sm:gap-4 relative overflow-hidden group cursor-move transition-all ${dragOverProdCat === index ? 'border-primary border-dashed border-2' : 'border-border'}`}
                    >
                      <div className="flex justify-between items-start gap-2 z-10 w-full min-w-0">
                        <h3 className="font-extrabold text-[10px] sm:text-xs uppercase tracking-widest text-foreground truncate flex-1 leading-tight self-center" title={cat}>{cat}</h3>
                        <div className="flex gap-1 shrink-0 self-center">
                          <button
                            onClick={() => {
                              setEditingProdCat({ oldName: cat, newName: cat });
                            }}
                            className="p-1 sm:p-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 text-primary hover:text-green-700 transition-colors cursor-pointer"
                            title="Edit Category"
                          >
                            <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setProdCatToDelete(cat);
                            }}
                            className="p-1 sm:p-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                            title="Delete Category"
                          >
                            <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full overflow-hidden bg-white border border-border z-10 flex shrink-0">
                         <img src={currentImg || null} alt={cat} className="w-full h-full object-cover" />
                      </div>
                      <div className="z-10 mt-auto">
                        <div className="text-[8px] uppercase tracking-widest font-extrabold text-foreground flex justify-between mb-2">
                          <span>Image URL</span>
                          <label className="text-primary hover:underline cursor-pointer font-black text-[8px] tracking-wider uppercase">
                            [ Upload ]
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  processImageFile(file, (url) => {
                                    updateCategoryImage(cat, url);
                                  }, true);
                                }
                              }} 
                              className="hidden" 
                            />
                          </label>
                        </div>
                        <input 
                          type="url"
                          value={customImg}
                          onChange={(e) => updateCategoryImage(cat, e.target.value)}
                          placeholder="Paste image URL or leave blank for default..."
                          className="slice-input w-full text-[9px]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <hr className="border-border" />

            {/* JUICE BAR CATEGORIES SECTION */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase text-foreground">Juice Menu Board Sections</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                  Manage sections found in the customer-facing raw juice bar
                </p>
              </div>

              {/* Add Juice Category Form Card */}
              <div className="slice-card p-6 bg-secondary/80 border border-border rounded-w flex flex-col gap-4">
                <span className="text-[10px] uppercase tracking-widest font-extrabold text-orange-600">Add New Juice Subcategory / Section</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Section Name</label>
                    <input 
                      type="text"
                      id="new-juice-cat-name-input"
                      value={newJuiceCatName}
                      onChange={(e) => setNewJuiceCatName(e.target.value)}
                      placeholder="e.g. Wellness Shots, Special Lattes..."
                      className="slice-input w-full"
                    />
                  </div>
                  <div className="space-y-1.5 font-mono">
                    <label className="block text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Section Tagline</label>
                    <input 
                      type="text"
                      id="new-juice-cat-tagline-input"
                      value={newJuiceCatTagline}
                      onChange={(e) => setNewJuiceCatTagline(e.target.value)}
                      placeholder="e.g. Pure extract, zero raw sugar"
                      className="slice-input w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="block text-[8px] font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                      <span>Illustration Image (URL or Upload)</span>
                      <label className="text-primary hover:underline cursor-pointer font-black uppercase tracking-wider text-[8px]">
                        [ Direct Upload ]
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              processImageFile(file, (url) => setNewJuiceCatImg(url), true);
                            }
                          }} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                    <input 
                      type="url"
                      id="new-juice-cat-img-input"
                      value={newJuiceCatImg}
                      onChange={(e) => setNewJuiceCatImg(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="slice-input w-full"
                    />
                  </div>
                </div>
                <button
                  id="add-juice-cat-btn"
                  disabled={isAddingJuiceCat}
                  onClick={async () => {
                    if (!newJuiceCatName.trim()) {
                      toast.error('Please enter a section name');
                      return;
                    }
                    try {
                      setIsAddingJuiceCat(true);
                      await addJuiceCategory(newJuiceCatName.trim(), newJuiceCatTagline.trim(), newJuiceCatImg.trim() || undefined);
                      setNewJuiceCatName('');
                      setNewJuiceCatTagline('');
                      setNewJuiceCatImg('');
                    } catch (e: any) {
                      toast.error(e.message || 'Error occurred');
                    } finally {
                      setIsAddingJuiceCat(false);
                    }
                  }}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-extrabold uppercase tracking-widest text-[10px] px-6 py-3.5 rounded-xl transition-all self-end flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Juice Section
                </button>
              </div>

              {/* Grid of registered juice categories */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {juiceCategories.map((cat, index) => {
                  if (!cat || !cat.name) return null;
                  const currentImg = getCategoryImage(cat.name, categoryImages);
                  const normalizedKey = cat.name.toLowerCase().replace(/ font-bold/gi, '').trim();
                  const customImg = categoryImages[normalizedKey] || '';
                  return (
                    <div 
                      key={cat.id} 
                      draggable
                      onDragStart={(e) => {
                        setDraggedJuiceCat(index);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverJuiceCat(index);
                      }}
                      onDragLeave={() => setDragOverJuiceCat(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedJuiceCat !== null && draggedJuiceCat !== index) {
                          const newOrder = [...juiceCategories];
                          const [removed] = newOrder.splice(draggedJuiceCat, 1);
                          newOrder.splice(index, 0, removed);
                          reorderJuiceCategories(newOrder);
                        }
                        setDraggedJuiceCat(null);
                        setDragOverJuiceCat(null);
                      }}
                      className={`slice-card p-4 sm:p-6 bg-secondary border flex flex-col gap-3 sm:gap-4 relative overflow-hidden group cursor-move transition-all ${dragOverJuiceCat === index ? 'border-primary border-dashed border-2' : 'border-border'}`}
                    >
                      <div className="flex justify-between items-start gap-2 z-10 w-full min-w-0">
                        <div className="space-y-1 flex-1 min-w-0 self-center">
                          <h3 className="font-extrabold text-[10px] sm:text-xs uppercase tracking-widest text-foreground truncate" title={cat.name}>{cat.name}</h3>
                          <p className="text-[8px] font-mono text-muted-foreground line-clamp-1">{cat.tagline}</p>
                        </div>
                        <button
                          onClick={() => {
                            setJuiceCatToDelete({ id: cat.id, name: cat.name });
                          }}
                          className="p-1 sm:p-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-500 hover:text-red-700 transition-colors cursor-pointer shrink-0 self-center"
                          title="Delete Juice Section"
                        >
                          <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>
                      <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full overflow-hidden bg-white border border-border z-10 flex shrink-0">
                         <img src={currentImg || null} alt={cat.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="z-10 mt-auto">
                        <div className="text-[8px] uppercase tracking-widest font-extrabold text-foreground flex justify-between mb-2">
                          <span>Image URL</span>
                          <label className="text-primary hover:underline cursor-pointer font-black text-[8px] tracking-wider uppercase">
                            [ Upload ]
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  processImageFile(file, (url) => {
                                    updateCategoryImage(cat.name, url);
                                  }, true);
                                }
                              }} 
                              className="hidden" 
                            />
                          </label>
                        </div>
                        <input 
                          type="url"
                          value={customImg}
                          onChange={(e) => updateCategoryImage(cat.name, e.target.value)}
                          placeholder="Paste image URL or leave blank for default..."
                          className="slice-input w-full text-[9px]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        ) : activeTab === 'hero' ? (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase text-foreground flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-primary" /> Hero Banners
                </h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                  Manage the image slider shown at the top of the home page. Use 4:3 aspect ratio images for best results.
                </p>
              </div>
            </div>
            
            <div className="bg-secondary p-6 rounded-2xl border border-border">
              <label className="slice-btn-primary px-6 py-4 cursor-pointer inline-flex items-center justify-center font-black uppercase text-xs tracking-widest relative overflow-hidden transition-all group">
                <span className="relative z-10 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {isUploading ? 'Uploading...' : 'Upload New Hero Banner'}
                </span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleHeroBannerUpload}
                  disabled={isUploading}
                />
              </label>
            </div>

            {heroBanners.length === 0 ? (
              <div className="bg-secondary/50 border border-border rounded-2xl p-12 text-center">
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">No hero banners uploaded.</p>
                <p className="text-[10px] text-muted-foreground mt-2">Upload an image to replace the default text hero section.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {heroBanners.map((banner, index) => (
                  <div 
                    key={banner.id} 
                    className={`bg-white border border-border p-4 rounded-2xl flex flex-col gap-4 relative transition-all ${draggedBannerIndex === index ? 'opacity-50 scale-95 border-primary shadow-lg' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    <div className="absolute top-2 left-2 z-10 p-2 cursor-grab active:cursor-grabbing bg-white/80 hover:bg-white rounded-lg backdrop-blur-sm shadow-sm transition-colors" title="Drag to reorder">
                      <GripVertical className="w-4 h-4 text-foreground/50" />
                    </div>
                    <div className="w-full aspect-[4/3] bg-secondary rounded-xl overflow-hidden relative group">
                      <img src={banner.imageUrl} alt="Hero Banner" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <button
                        onClick={() => deleteHeroBanner(banner.id)}
                        className="absolute top-2 right-2 p-2 bg-white/80 hover:bg-red-500 hover:text-white rounded-lg backdrop-blur-sm text-red-500 shadow-sm transition-colors"
                        title="Delete Banner"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-auto">
                      <label className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">Banner Link (Optional)</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          defaultValue={banner.link || ''}
                          onBlur={(e) => {
                            if (e.target.value !== banner.link) {
                              updateHeroBannerLink(banner.id, e.target.value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          placeholder="e.g., /shop?category=exotic fruits or https://google.com"
                          className="slice-input w-full text-xs"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Press enter or click outside to save. Use a relative path like /shop or a full URL starting with http.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'reviews' ? (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-xl sm:text-2xl font-black uppercase text-foreground flex items-center gap-2">
                  <Star className="w-6 h-6 text-foreground fill-foreground" /> Reviews Manager
                </h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                  Read and manage customer reviews
                </p>
              </div>
            </div>

            {reviews.length === 0 ? (
              <div className="bg-secondary/50 border border-border rounded-2xl p-12 text-center">
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">No reviews found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map(review => (
                  <div key={review.id} className="bg-white border border-border p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start gap-4 hover:shadow-sm transition-shadow">
                    <div className="space-y-3 flex-1 w-full">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-extrabold text-xs uppercase text-foreground bg-secondary px-2.5 py-1 rounded-lg border border-border/50">{review.userName}</span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star 
                              key={star} 
                              className={`w-3.5 h-3.5 ${star <= review.rating ? 'fill-foreground text-foreground' : 'text-border fill-transparent'}`} 
                            />
                          ))}
                        </div>
                        <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest ml-auto">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">
                        Product: <span className="text-primary font-mono bg-primary/5 px-2 py-0.5 rounded border border-primary/10 truncate max-w-[200px]">{review.productId}</span>
                      </div>

                      <p className="text-xs text-foreground font-medium leading-relaxed bg-secondary/30 p-3.5 rounded-xl border border-border/50">
                        "{review.comment}"
                      </p>
                    </div>
                    
                    <button
                      onClick={() => deleteReview(review.id!)}
                      className="shrink-0 p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 rounded-xl border border-transparent hover:border-red-100 transition-colors"
                      title="Delete Review"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'branding' ? (
          <BrandingErrorBoundary>
            <BrandingSettings />
          </BrandingErrorBoundary>
        ) : null
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0" onClick={() => setSelectedOrder(null)}></div>
          <div className="bg-white border border-border rounded-[28px] max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col p-4 sm:p-8 relative z-10 animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-border pb-4 sm:pb-5 mb-5 sm:mb-6">
              <div>
                <span className="text-primary font-mono text-[9px] sm:text-[10px] font-black uppercase tracking-widest block mb-1">FreshNLocal.CO ORDER RECEIPT</span>
                <h2 className="text-lg sm:text-2xl font-black uppercase text-foreground shrink-0 leading-tight">
                  Invoice {selectedOrder.orderNumber || `#FNL-${selectedOrder.id.slice(0, 8).toUpperCase()}`}
                </h2>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 sm:p-2 bg-secondary hover:bg-neutral-200 border border-border rounded-xl transition-colors cursor-pointer text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status & Quick Action Summary */}
            <div className="bg-secondary border border-border rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#4a4a4a] block mb-1">Status desk</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    (selectedOrder.shippingDetails?.address?.includes('Store Pickup') ? PICKUP_STATUS_OPTIONS : STATUS_OPTIONS).find(o => o.value === selectedOrder.status)?.color || 'bg-neutral-400'
                  }`} />
                  <span className="font-extrabold uppercase text-[11px] sm:text-xs text-foreground tracking-wider">
                    {selectedOrder.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">Change Status:</span>
                <select 
                  value={selectedOrder.status}
                  onChange={(e) => {
                    handleUpdateOrderStatus(selectedOrder.id, e.target.value);
                    setSelectedOrder(prev => prev ? { ...prev, status: e.target.value } : null);
                  }}
                  className="appearance-none border border-border rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs bg-white font-extrabold uppercase tracking-widest text-foreground cursor-pointer shadow-sm focus:border-primary outline-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_10px_center] bg-no-repeat"
                >
                  {(selectedOrder.shippingDetails?.address?.includes('Store Pickup') ? PICKUP_STATUS_OPTIONS : STATUS_OPTIONS).map(opt => <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setOrderToDelete(selectedOrder.id)}
                  className="ml-2 bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 rounded-lg p-1.5 sm:p-2 cursor-pointer transition-colors"
                  title="Delete Order"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Customer Details info block */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-border pb-6 mb-6">
              <div className="space-y-2">
                <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">Deliver To Customer</h4>
                <div className="text-xs space-y-1">
                  <p className="font-extrabold uppercase text-foreground text-sm">{selectedOrder.shippingDetails?.name || 'Valued Customer'}</p>
                  <p className="font-bold text-primary font-mono text-xs">{selectedOrder.shippingDetails?.phone || 'No Phone provided'}</p>
                  <p className="text-muted-foreground leading-relaxed mt-1 text-[11px] whitespace-normal bg-secondary p-2.5 rounded-xl border border-border/40">
                    {selectedOrder.shippingDetails?.address?.includes('Store Pickup') ? 'STORE PICKUP' : (selectedOrder.shippingDetails?.address || 'No shipping address provided')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">Logistics & Timing</h4>
                <div className="text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-medium">Placed On</span>
                    <span className="font-bold text-foreground">{new Date(selectedOrder.createdAt).toLocaleDateString()} at {new Date(selectedOrder.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-medium">Method</span>
                    <span className="font-extrabold text-foreground uppercase tracking-wider">{selectedOrder.paymentMethod || 'COD (Cash on Delivery)'}</span>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-500/5 text-emerald-700 px-2.5 py-1.5 border border-emerald-500/10 rounded-lg text-[9px] font-black uppercase tracking-wider">
                    <span>Verified Fresh Produce</span>
                    <Check className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Items Breakdown list */}
            <div className="space-y-4 flex-1">
              <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">Shopping Cart Items</h4>
              <div className="border border-border rounded-2xl overflow-hidden bg-secondary/50 divide-y divide-border">
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item: any, idx: number) => {
                    const prod = item?.product || item;
                    if (!prod) return null;
                    const catImg = getCategoryImage(prod.category, categoryImages);
                    return (
                      <div key={idx} className="flex gap-4 p-3.5 items-center justify-between min-w-0 w-full">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-white border border-border p-1 overflow-hidden flex shrink-0">
                            <img src={prod.imageUrl || catImg || null} alt={prod.name} className="w-full h-full object-contain object-center" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-extrabold text-xs text-foreground uppercase truncate" title={prod.name}>{prod.name}</p>
                            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5 truncate">
                              {prod.category?.replace(/ font-bold/gi, '')} {prod.unit ? `• ${prod.unit}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-2 bg-secondary rounded-lg p-1 border border-border">
                            <button
                              type="button"
                              disabled={selectedOrder.status === 'cancelled' || selectedOrder.status === 'delivered' || (item.quantity || 1) <= 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleUpdateItemQuantityFromOrder(selectedOrder.id, idx, (item.quantity || 1) - 1);
                              }}
                              className="w-6 h-6 flex items-center justify-center rounded bg-background shadow-sm border border-border disabled:opacity-50 text-foreground hover:bg-muted transition-colors"
                            >
                              <span className="text-xs font-black">-</span>
                            </button>
                            <span className="text-[10px] font-black w-4 text-center">{item.quantity || 1}</span>
                            <button
                              type="button"
                              disabled={selectedOrder.status === 'cancelled' || selectedOrder.status === 'delivered'}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleUpdateItemQuantityFromOrder(selectedOrder.id, idx, (item.quantity || 1) + 1);
                              }}
                              className="w-6 h-6 flex items-center justify-center rounded bg-background shadow-sm border border-border disabled:opacity-50 text-foreground hover:bg-muted transition-colors"
                            >
                              <span className="text-xs font-black">+</span>
                            </button>
                          </div>
                          <div className="text-right whitespace-nowrap font-mono min-w-[60px]">
                            <p className="text-xs font-black text-foreground">₹{(prod.price || 0) * (item.quantity || 1)}</p>
                            <p className="text-[10px] text-muted-foreground font-bold mt-0.5">{item.quantity || 1} x ₹{prod.price || 0}</p>
                          </div>
                          {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleRemoveItemFromOrder(selectedOrder.id, idx);
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-red-500/20 shrink-0"
                              title="Remove item"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center italic text-muted-foreground text-xs font-mono">
                    Empty order manifest list.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom summary and totals */}
            <div className="border-t border-border mt-6 pt-5 space-y-3.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">Subtotal Value</span>
                <span className="font-mono font-bold text-foreground">₹{selectedOrder.totalAmount + (selectedOrder.discount || (selectedOrder.pointsRedeemed ? 100 : 0))}</span>
              </div>
              {(selectedOrder.discount > 0 || selectedOrder.pointsRedeemed > 0) && (
                <div className="flex justify-between items-center text-xs text-red-500 font-extrabold bg-red-50 px-3 py-2 rounded-xl border border-red-100/50">
                  <span className="uppercase tracking-wider flex items-center gap-1.5">
                    🪙 FNL Points Discount (100 PTS)
                  </span>
                  <span className="font-mono">-₹{selectedOrder.discount || 100}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-bold uppercase tracking-wider">Delivery Fee</span>
                <span className="font-mono font-extrabold text-[#10b981] uppercase tracking-widest text-[10px]">FREE SHIPPING</span>
              </div>
              <div className="flex justify-between items-center border-t border-dashed border-border pt-3.5 mt-2">
                <span className="text-foreground text-sm font-black uppercase tracking-wider">Total Value Payable</span>
                <span className="text-primary font-mono text-xl font-black">₹{selectedOrder.totalAmount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Deletion Confirmation Modal: Products */}
      {productToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setProductToDelete(null)} />
          <div className="bg-secondary border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black uppercase text-foreground">Confirm Deletion</h3>
            <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wide font-mono">
              Are you sure you want to delete this product catalog item? This action is irreversible.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteProduct}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Deletion Confirmation Modal: Orders */}
      {orderToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOrderToDelete(null)} />
          <div className="bg-secondary border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black uppercase text-foreground">Confirm Deletion</h3>
            <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wide font-mono">
              Are you sure you want to completely delete this order? This action is irreversible.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setOrderToDelete(null)}
                className="px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteOrder(orderToDelete)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Deletion Confirmation Modal: Produce Categories */}
      {prodCatToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setProdCatToDelete(null)} />
          <div className="bg-secondary border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-205">
            <h3 className="text-lg font-black uppercase text-foreground">Delete Produce Category</h3>
            <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wide">
              Are you sure you want to delete the category <span className="text-primary font-black">"{prodCatToDelete}"</span>?
            </p>
            <p className="text-[10px] text-red-500 font-mono mt-2">
              ⚠️ Warning: This removes the category listing and image mapping completely from the database.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setProdCatToDelete(null)}
                className="px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteProdCat}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Edit Category Modal */}
      {editingProdCat && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setEditingProdCat(null)} />
          <div className="bg-secondary border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-205">
            <h3 className="text-lg font-black uppercase text-foreground">Edit Category Name</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Category Name</label>
                <input 
                  autoFocus
                  type="text" 
                  value={editingProdCat.newName} 
                  onChange={e => setEditingProdCat({ ...editingProdCat, newName: e.target.value })}
                  className="slice-input w-full"
                  placeholder="New category name"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingProdCat(null)}
                className="px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEditProdCat}
                className="px-4 py-2 bg-primary hover:bg-green-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Deletion Confirmation Modal: Juice Categories */}
      {juiceCatToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setJuiceCatToDelete(null)} />
          <div className="bg-secondary border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black uppercase text-foreground">Delete Juice Section</h3>
            <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wide">
              Are you sure you want to delete <span className="text-orange-600 font-black">"{juiceCatToDelete.name}"</span>?
            </p>
            <p className="text-[10px] text-red-500 font-mono mt-2">
              ⚠️ Warning: This section and its metadata will be permanently deleted from the juice menu.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setJuiceCatToDelete(null)}
                className="px-4 py-2 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteJuiceCat}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
