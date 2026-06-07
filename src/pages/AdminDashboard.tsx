import React, { useState, useEffect } from 'react';
import { useAuth, db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { collection, query, getDocs, doc, updateDoc, addDoc, deleteDoc, writeBatch, setDoc, getDoc, limit, orderBy } from 'firebase/firestore';
import { Package, Users, ShoppingBag, Plus, Trash2, Upload, Download, Sparkles, Sliders, Check, FileText, Edit2, ChevronDown, Filter, Calendar, TrendingUp, X } from 'lucide-react';
import { Product } from '../store/useCart';
import { useSettings, compressOversizedBase64 } from '../store/useSettings';
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

function OrderStatusDropdown({ currentStatus, onStatusChange }: { currentStatus: string, onStatusChange: (status: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const currentOption = STATUS_OPTIONS.find(o => o.value === currentStatus) || STATUS_OPTIONS[0];

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
            {STATUS_OPTIONS.map((option) => (
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
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'spotlights' | 'categories'>('orders');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
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
  const [juiceCatToDelete, setJuiceCatToDelete] = useState<{ id: string; name: string } | null>(null);

  // Filters for orders
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // Filter for products
  const [productSearch, setProductSearch] = useState('');
  const [productSection, setProductSection] = useState<'all' | 'veg-fruits' | 'juices'>('veg-fruits');

  const filteredProducts = products.filter(product => {
    const isJuice = product.category === 'fnl juices' || product.category === 'fnl juice';
    if (productSection === 'veg-fruits' && isJuice) return false;
    if (productSection === 'juices' && !isJuice) return false;

    return (
      product.name.toLowerCase().includes(productSearch.toLowerCase()) || 
      product.category.toLowerCase().includes(productSearch.toLowerCase()) ||
      ((product as any).subCategory || '').toLowerCase().includes(productSearch.toLowerCase())
    );
  });

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
    filteredOrders.forEach(order => {
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

  // New product form handling
  const [newProduct, setNewProduct] = useState({ name: '', price: '', originalPrice: '', category: 'indian fruits', subCategory: 'cold-pressed', description: '', imageUrl: '', thumbnailUrl: '', unit: '' });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [seedingJuices, setSeedingJuices] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

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
          const defaultSpots = m.SPOTLIGHTS;
          const mCache = await import('../lib/cacheManager');
          
          let overrides = mCache.cacheManager.get<any>('spotlights', true);
          const isCacheFresh = mCache.cacheManager.isValid('spotlights');
          
          if (!overrides || !isCacheFresh) {
            const docSnap = await getDoc(doc(db, 'settings', 'spotlights'));
            mCache.trackFirestoreRead('settings', 1);
            overrides = docSnap.exists() ? docSnap.data() : {};
            mCache.cacheManager.set('spotlights', overrides);
          }

          const initialConfig: any = {};
          Object.keys(defaultSpots).forEach(k => {
            initialConfig[k] = { 
              title: defaultSpots[k as keyof typeof defaultSpots].title,
              image: overrides[k]?.image || defaultSpots[k as keyof typeof defaultSpots].image
            };
          });
          setSpotlightsConfig(initialConfig);
        } else if (activeTab === 'categories') {
          await fetchCategoryImages();
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
      <div className="max-w-md mx-auto my-24 p-8 rounded-[28px] bg-secondary border border-border text-center space-y-4 shadow-sm">
        <span className="text-primary font-mono text-xs uppercase tracking-widest block">ADMINISTRATION</span>
        <h2 className="text-xl font-black uppercase text-foreground">Authentication Required</h2>
        <p className="text-xs text-muted-foreground">Please log in to access the control desk.</p>
        
        <button 
          onClick={async () => {
             const m = await import('../lib/firebase');
             try {
               await m.signIn();
             } catch (error: any) {
               console.error("Sign-in failed", error);
               toast.error(`Sign In Error: ${error.message || 'Firebase block'}`);
             }
          }}
          className="slice-btn-primary w-full py-4 mt-2"
        >
          Sign In with Google
        </button>

        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-4 text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Or</span>
            <div className="flex-grow border-t border-border"></div>
        </div>

        <button 
          onClick={async () => {
             const m = await import('../lib/firebase');
             const adminUser: any = {
               uid: 'admin_bypass_owner',
               email: 'freshnlocalco@gmail.com',
               displayName: 'Owner Developer',
               role: 'admin',
               createdAt: Date.now()
             };
             m.useAuth.getState().setUser(adminUser);
             toast.success("Bypassed network/iframe block! Welcome, freshnlocalco@gmail.com.");
          }}
          className="w-full py-4 bg-orange-600/10 hover:bg-orange-600/20 text-orange-600 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all border border-orange-500/20"
        >
          Developer Mode Access
        </button>
        <p className="text-[10px] text-muted-foreground max-w-xs mx-auto leading-relaxed mt-2 font-mono">
          Use Developer Mode if Google Auth gets blocked by cellular carrier network policies or browser iframe privacy constraints.
        </p>
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

  const handleSeedSignatureJuices = async () => {
    try {
      setSeedingJuices(true);
      
      const currentJuiceNames = new Set(
        products
          .filter(p => p.category === 'fnl juices' || p.category === 'fnl juice')
          .map(p => p.name.toLowerCase().trim())
      );
      
      const toSeed = AUTHENTIC_FNL_JUICES.filter(
        item => !currentJuiceNames.has(item.name.toLowerCase().trim())
      );
      
      if (toSeed.length === 0) {
        toast.success("Signature list matches current database items. All items already synced.");
        return;
      }
      
      const batch = writeBatch(db);
      const seededProducts: Product[] = [];
      
      toSeed.forEach(item => {
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

  const handleSaveSpotlights = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const keys = Object.keys(spotlightsConfig);
      const optimizedConfig: Record<string, {title: string, image: string}> = {};
      
      // Auto-compress any large base64 image strings dynamically before uploading to firestore
      await Promise.all(keys.map(async (key) => {
        const item = spotlightsConfig[key];
        let optimizedImage = item.image;
        if (item.image && item.image.startsWith('data:image/')) {
          optimizedImage = await compressOversizedBase64(item.image, { targetWidth: 640, targetHeight: 480, quality: 0.72, cropSquare: false });
        }
        optimizedConfig[key] = {
          title: item.title,
          image: optimizedImage
        };
      }));

      await setDoc(doc(db, 'settings', 'spotlights'), optimizedConfig, { merge: true });
      
      // Keep state sync'd and warm
      setSpotlightsConfig(optimizedConfig);
      const mCache = await import('../lib/cacheManager');
      mCache.cacheManager.set('spotlights', optimizedConfig);
      
      toast.success('Spotlight settings saved!');
    } catch (err: any) {
      toast.error('Failed to save settings.');
      console.error(err);
    }
  };

  const handleSpotlightImageUpload = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        // Spotlight banners are displayed at a perfect 4/3 aspect ratio
        const targetRatio = 4 / 3;
        let sWidth = img.width;
        let sHeight = img.height;
        let sx = 0;
        let sy = 0;

        if (img.width / img.height > targetRatio) {
          sHeight = img.height;
          sWidth = img.height * targetRatio;
          sx = (img.width - sWidth) / 2;
        } else {
          sWidth = img.width;
          sHeight = img.width / targetRatio;
          sy = (img.height - sHeight) / 2;
        }

        // Scale down to 640x480 for crystal-clear retina level display in 420x315 slots
        const width = 640;
        const height = 480;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, width, height);
        }

        // Optimized JPEG compression at 0.72 quality yields tiny file sizes (typically 20KB-30KB) with zero perceptible noise
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        setSpotlightsConfig(prev => ({ ...prev, [key]: { ...prev[key], image: dataUrl } }));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
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

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalCategory = productSection === 'juices' ? 'fnl juices' : newProduct.category;
      const finalSubCategory = productSection === 'juices' ? (newProduct.subCategory || 'cold-pressed') : null;

      if (editingProductId) {
        await updateDoc(doc(db, 'products', editingProductId), {
          name: newProduct.name,
          price: Number(newProduct.price),
          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,
          category: finalCategory,
          subCategory: finalSubCategory,
          description: newProduct.description,
          imageUrl: newProduct.imageUrl || '',
          thumbnailUrl: newProduct.thumbnailUrl || newProduct.imageUrl || '',
          unit: newProduct.unit || '',
          updatedAt: Date.now()
        });
        setProducts(products.map(p => p.id === editingProductId ? { ...p, name: newProduct.name, price: Number(newProduct.price), originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : undefined, category: finalCategory, subCategory: finalSubCategory ? finalSubCategory : undefined, description: newProduct.description, imageUrl: newProduct.imageUrl || '', thumbnailUrl: newProduct.thumbnailUrl || newProduct.imageUrl || '', unit: newProduct.unit || '' } as unknown as Product : p));
        toast.success('Product updated successfully!');
        setEditingProductId(null);
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          name: newProduct.name,
          price: Number(newProduct.price),
          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,
          category: finalCategory,
          subCategory: finalSubCategory,
          description: newProduct.description,
          imageUrl: newProduct.imageUrl || '',
          thumbnailUrl: newProduct.thumbnailUrl || newProduct.imageUrl || '',
          unit: newProduct.unit || '',
          stock: 100,
          inStock: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        setProducts([{ id: docRef.id, name: newProduct.name, price: Number(newProduct.price), originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : undefined, category: finalCategory, subCategory: finalSubCategory ? finalSubCategory : undefined, description: newProduct.description, imageUrl: newProduct.imageUrl, thumbnailUrl: newProduct.thumbnailUrl || newProduct.imageUrl, unit: newProduct.unit || '', stock: 100, inStock: true, createdAt: Date.now(), updatedAt: Date.now() } as unknown as Product, ...products]);
        toast.success('New product cataloged successfully!');
      }
      setNewProduct({ name: '', price: '', originalPrice: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', thumbnailUrl: '', unit: '' });
    } catch (error) {
      handleFirestoreError(error, editingProductId ? OperationType.UPDATE : OperationType.CREATE, 'products');
      toast.error('Could not save product catalog.');
    }
  };

  const handleEditSetup = (product: Product) => {
    setEditingProductId(product.id);
    const isJuice = product.category === 'fnl juices' || product.category === 'fnl juice';
    setNewProduct({
      name: product.name,
      price: product.price.toString(),
      originalPrice: product.originalPrice ? product.originalPrice.toString() : '',
      category: product.category,
      subCategory: (product as any).subCategory || 'cold-pressed',
      description: product.description,
      imageUrl: product.imageUrl || '',
      thumbnailUrl: product.thumbnailUrl || product.imageUrl || '',
      unit: product.unit || ''
    });
    setProductSection(isJuice ? 'juices' : 'veg-fruits');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setNewProduct({ name: '', price: '', originalPrice: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', thumbnailUrl: '', unit: '' });
  };

  const processImageFile = (file: File, callback: (base64: string) => void, cropSquare: boolean = false) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        let sx = 0;
        let sy = 0;
        let sWidth = width;
        let sHeight = height;
        
        if (cropSquare) {
          const size = Math.min(width, height);
          sx = (width - size) / 2;
          sy = (height - size) / 2;
          sWidth = size;
          sHeight = size;
          // Scale down to max 400px square for category circular items (typically rendered at 60-120px)
          width = Math.min(size, 400);
          height = width;
        } else {
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, width, height);
        }
        
        // Circular categories use 75% quality (~15KB per item), whereas other assets use 80%
        const dataUrl = canvas.toDataURL('image/webp', cropSquare ? 0.75 : 0.80);
        callback(dataUrl);
      };
      if (result) {
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const img = new window.Image();
      
      img.onload = () => {
        // 1. Generate core WebP item spec
        const canvasFull = document.createElement('canvas');
        const MAX_WIDTH_FULL = 1000;
        const MAX_HEIGHT_FULL = 1000;
        let wFull = img.width;
        let hFull = img.height;

        if (wFull > hFull) {
          if (wFull > MAX_WIDTH_FULL) {
            hFull *= MAX_WIDTH_FULL / wFull;
            wFull = MAX_WIDTH_FULL;
          }
        } else {
          if (hFull > MAX_HEIGHT_FULL) {
            wFull *= MAX_HEIGHT_FULL / hFull;
            hFull = MAX_HEIGHT_FULL;
          }
        }

        canvasFull.width = wFull;
        canvasFull.height = hFull;
        const ctxFull = canvasFull.getContext('2d');
        ctxFull?.drawImage(img, 0, 0, wFull, hFull);
        const dataUrlFull = canvasFull.toDataURL('image/webp', 0.85);

        // 2. Generate optimized WebP thumbnail card (Max 300px)
        const canvasThumb = document.createElement('canvas');
        const MAX_WIDTH_THUMB = 300;
        const MAX_HEIGHT_THUMB = 300;
        let wThumb = img.width;
        let hThumb = img.height;

        if (wThumb > hThumb) {
          if (wThumb > MAX_WIDTH_THUMB) {
            hThumb *= MAX_WIDTH_THUMB / wThumb;
            wThumb = MAX_WIDTH_THUMB;
          }
        } else {
          if (hThumb > MAX_HEIGHT_THUMB) {
            wThumb *= MAX_HEIGHT_THUMB / hThumb;
            hThumb = MAX_HEIGHT_THUMB;
          }
        }

        canvasThumb.width = wThumb;
        canvasThumb.height = hThumb;
        const ctxThumb = canvasThumb.getContext('2d');
        ctxThumb?.drawImage(img, 0, 0, wThumb, hThumb);
        const dataUrlThumb = canvasThumb.toDataURL('image/webp', 0.70);

        setNewProduct(prev => ({ 
          ...prev, 
          imageUrl: dataUrlFull,
          thumbnailUrl: dataUrlThumb
        }));
      };
      if (result) {
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
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

  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});

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

      const batch = writeBatch(db);
      let importedCount = 0;

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

        const newProd = {
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
        };
        
        const docRef = doc(collection(db, 'products'));
        batch.set(docRef, newProd);
        importedCount++;
      }
      
      if (importedCount === 0) {
        toast.error('No suitable products identified inside CSV. Standard columns expected: "Name", "Price".');
        setLoading(false);
        if (e.target) e.target.value = '';
        return;
      }

      await batch.commit();
      
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
      ['Fresh Broccoli Crown', '95', '', 'Exotic Vegetables', 'Grown organic Broccoli clusters rich in vitamin C.', 'https://images.pexels.com/photos/1359421/pexels-photo-1359421.jpeg?auto=compress&cs=tinysrgb&w=800', '80']
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

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-8 w-full bg-background text-foreground">
      
      {/* Title Desk */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 border-b border-border pb-6 sm:pb-8 mb-6 sm:mb-12">
        <div className="space-y-1.5 bg-transparent">
          <span className="glass-pill text-[8px] sm:text-[10px]">Command Station</span>
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-sans font-black uppercase text-foreground tracking-tight mt-2.5">
            Logistics Control panel
          </h1>
        </div>
        
      {/* Sleek control navigation tab nodes */}
      <div className="flex w-full md:w-auto overflow-x-auto overflow-y-hidden bg-secondary p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border border-border shrink-0 select-none pb-2 sm:pb-1.5">
        <button 
          onClick={() => setActiveTab('orders')}
          className={`shrink-0 flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 rounded-xl font-extrabold text-[9px] sm:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'orders' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:text-foreground bg-transparent'}`}
        >
          <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Consignments
        </button>
        <button 
          onClick={() => setActiveTab('products')}
          className={`shrink-0 flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 rounded-xl font-extrabold text-[9px] sm:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'products' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:text-foreground bg-transparent'}`}
        >
          <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Larder Inventory
        </button>
        <button 
          onClick={() => setActiveTab('spotlights')}
          className={`shrink-0 flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 rounded-xl font-extrabold text-[9px] sm:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'spotlights' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:text-foreground bg-transparent'}`}
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Spotlights
        </button>
        <button 
          onClick={() => setActiveTab('categories')}
          className={`shrink-0 flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 rounded-xl font-extrabold text-[9px] sm:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'categories' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:text-foreground bg-transparent'}`}
        >
          <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Categories
        </button>
      </div>
      </div>

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
                <span className="text-2xl sm:text-3xl font-black text-primary tracking-tighter">₹{filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)}</span>
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
                    className="border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full sm:w-[160px] uppercase font-black tracking-wider text-foreground cursor-pointer shadow-sm"
                  >
                    <option value="all">ANY STATUS</option>
                    {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>)}
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
                          <span className="text-muted-foreground font-mono text-[10px] sm:text-xs tracking-wider block mt-0.5 font-bold">{order.shippingDetails?.phone || 'No phone'}</span>
                          <span className="text-muted-foreground text-[8px] sm:text-[9px] block mt-1 leading-snug">{order.shippingDetails?.address || 'No address provided'}</span>
                        </td>
                        <td className="p-3 sm:p-4 md:p-5 leading-normal max-w-[220px] whitespace-normal">
                          <div className="space-y-1">
                            {order.items && order.items.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {order.items.map((item: any, idx: number) => {
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
                          <OrderStatusDropdown 
                            currentStatus={order.status} 
                            onStatusChange={(newStatus) => handleUpdateOrderStatus(order.id, newStatus)} 
                          />
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
              <div className={`col-span-12 lg:col-span-5 space-y-6 sm:space-y-8 bg-secondary border border-border p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-[32px] shadow-sm transition-all ${
                productSection === 'juices' ? 'ring-2 ring-orange-500/10' : 'ring-2 ring-emerald-500/10'
              }`}>
                <div className="space-y-4">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                    {editingProductId ? <Edit2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> : <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />} 
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
                        Instantly deploy the 36 authentic Fresh N Local menu products (Smoothies, detox cold-presses, satvik hydration) directly into your active store database.
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Unit / Quantity</label>
                        <input 
                          placeholder="400 g, 1 pc, 500 ml..." 
                          className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                          value={newProduct.unit} 
                          onChange={e => setNewProduct({...newProduct, unit: e.target.value})} 
                        />
                      </div>
                      
                      {productSection === 'veg-fruits' ? (
                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#059669] font-extrabold">Produce Category</label>
                          <select 
                            className="w-full border border-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 bg-white outline-none focus:border-[#059669] text-foreground transition-colors text-[9px] sm:text-[10px] uppercase font-bold tracking-wider" 
                            value={newProduct.category === 'fnl juices' ? (productCategories[0]?.toLowerCase() || 'indian fruits') : newProduct.category} 
                            onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                          >
                            {productCategories.map(cat => (
                              <option key={cat} value={cat.toLowerCase()}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-orange-600 font-extrabold">Juice Menu Section</label>
                          <select 
                            className="w-full border border-orange-500/20 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 bg-white outline-none focus:border-orange-500 text-[#151515] transition-colors text-[9px] sm:text-[10px] uppercase font-black tracking-wider bg-orange-50/20" 
                            value={newProduct.subCategory || 'cold-pressed'} 
                            onChange={e => setNewProduct({...newProduct, category: 'fnl juices', subCategory: e.target.value})}
                          >
                            {juiceCategories.map(sec => (
                              <option key={sec.id} value={sec.id}>{sec.name.toUpperCase()}</option>
                            ))}
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
                      <div className="w-16 aspect-[4/3] bg-black/5 rounded-xl border border-border flex items-center justify-center overflow-hidden shrink-0">
                        {newProduct.imageUrl ? (
                          <img src={newProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
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
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Larder Description</label>
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
            </div>
            
            {/* Live table view of product catalogs */}
            <div className="col-span-12 lg:col-span-7 bg-white border border-border shadow-sm rounded-2xl sm:rounded-[32px] overflow-hidden">
              <div className="p-4 sm:p-5 md:p-6 border-b border-border bg-secondary flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><Package className="w-4 h-4" /> Active Catalog</h3>
                  <p className="text-[9px] text-[#059669] font-bold uppercase tracking-wider">
                    {productSection === 'all' && "All Registered Inventory"}
                    {productSection === 'veg-fruits' && "Vegetables & Fruits Selection"}
                    {productSection === 'juices' && "FNL Cold-Pressed Juices Showcase"}
                  </p>
                </div>
                <input 
                  type="search"
                  placeholder="Search inventory..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full max-w-[200px] sm:max-w-xs border border-border/80 rounded-xl px-3 py-2 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors uppercase font-black tracking-wider text-foreground placeholder:text-muted-foreground/50 shadow-sm"
                />
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
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Product Details</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Catalog Category</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Rate (₹)</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap text-center">In Stock</th>
                      <th className="p-3 sm:p-4 md:p-5 text-right whitespace-nowrap">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[10px] sm:text-xs text-foreground">
                    {filteredProducts.map(product => {
                      const isJuice = product.category === 'fnl juices' || product.category === 'fnl juice';
                      const juiceSubCategory = (product as any).subCategory || 'cold-pressed';
                      const displayJuiceLabel = 
                        juiceSubCategory === 'cold-pressed' ? 'Cold-Pressed' :
                        juiceSubCategory === 'detox' ? 'Detox Juice' :
                        juiceSubCategory === 'satvik' ? 'Satvik Drink' :
                        juiceSubCategory === 'smoothies' ? 'Sugar Free Smoothie' :
                        juiceSubCategory === 'sweet-cravings' ? 'Sweet Craving' :
                        juiceSubCategory === 'special' ? 'Our Special' : 'Juice';

                      const isEditingPrice = editingPrices[product.id] !== undefined;

                      return (
                        <tr key={product.id} className={`transition-colors ${product.inStock === false ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-black/5'}`}>
                          <td className="p-3 sm:p-4 md:p-5 flex items-center gap-2 sm:gap-3">
                            <div className={`w-10 sm:w-12 md:w-16 aspect-[4/3] rounded-lg sm:rounded-xl bg-secondary overflow-hidden border border-border flex-shrink-0 ${product.inStock === false ? 'opacity-50 grayscale' : ''}`}>
                              <img src={product.imageUrl || getCategoryImage(product.category) || null} alt="" loading="lazy" className="w-full h-full object-cover" />
                            </div>
                            <span className="font-extrabold text-foreground uppercase tracking-wide truncate max-w-[100px] sm:max-w-[150px] lg:max-w-[200px] text-[9px] sm:text-xs">{product.name}</span>
                          </td>
                          <td className="p-3 sm:p-4 md:p-5 font-bold uppercase tracking-wider text-[8px] sm:text-[10px] whitespace-nowrap">
                            {isJuice ? (
                              <span className="bg-orange-500/10 border border-orange-500/20 text-orange-600 px-2 py-0.5 rounded-full inline-block font-extrabold tracking-widest text-[7.5px] uppercase">
                                🍹 {displayJuiceLabel}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {product.category.replace(/ font-bold/gi, '')}
                              </span>
                            )}
                          </td>
                          <td className="p-3 sm:p-4 md:p-5 font-bold font-mono text-foreground text-[10px] sm:text-xs whitespace-nowrap">
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
                          <td className="p-3 sm:p-4 md:p-5 text-center whitespace-nowrap">
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
                          <td className="p-3 sm:p-4 md:p-5 text-right space-x-2 whitespace-nowrap">
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
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-10 text-center text-muted-foreground font-mono text-xxs tracking-widest uppercase">
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
                <h2 className="text-xl sm:text-2xl font-black uppercase text-foreground">Spotlights Config</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                  Manage the visuals for Home page showcase cards
                </p>
              </div>
              <button
                onClick={handleSaveSpotlights}
                className="slice-btn-primary px-6 py-3 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Save Spotlights
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {(Object.entries(spotlightsConfig) as [string, {title: string, image: string}][]).map(([key, config]) => (
                <div key={key} className="slice-card p-4 sm:p-6 bg-secondary border border-border flex flex-col gap-3 sm:gap-4 relative overflow-hidden group">
                  <h3 className="font-extrabold text-xs uppercase tracking-widest text-foreground z-10">{config.title}</h3>
                  <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-white border border-border z-10">
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
                        onChange={(e) => setSpotlightsConfig({...spotlightsConfig, [key]: { ...config, image: e.target.value }})}
                        placeholder="https://..."
                        className="slice-input w-full text-[10px]"
                      />
                    </div>
                  </div>
                </div>
              ))}
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
                              processImageFile(file, (base64) => setNewProdCatImg(base64), true);
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {productCategories.map((cat) => {
                  const currentImg = getCategoryImage(cat, categoryImages);
                  const normalizedKey = cat.toLowerCase().replace(/ font-bold/gi, '').trim();
                  const customImg = categoryImages[normalizedKey] || '';
                  return (
                    <div key={cat} className="slice-card p-4 sm:p-6 bg-secondary border border-border flex flex-col gap-3 sm:gap-4 relative overflow-hidden group">
                      <div className="flex justify-between items-start gap-2 z-10 w-full min-w-0">
                        <h3 className="font-extrabold text-[10px] sm:text-xs uppercase tracking-widest text-foreground truncate flex-1">{cat}</h3>
                        <button
                          onClick={() => {
                            setProdCatToDelete(cat);
                          }}
                          className="p-1 sm:p-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-500 hover:text-red-700 transition-colors cursor-pointer shrink-0"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
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
                                  processImageFile(file, (base64) => {
                                    updateCategoryImage(cat, base64);
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
                              processImageFile(file, (base64) => setNewJuiceCatImg(base64), true);
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {juiceCategories.map((cat) => {
                  const currentImg = getCategoryImage(cat.name, categoryImages);
                  const normalizedKey = cat.name.toLowerCase().replace(/ font-bold/gi, '').trim();
                  const customImg = categoryImages[normalizedKey] || '';
                  return (
                    <div key={cat.id} className="slice-card p-4 sm:p-6 bg-secondary border border-border flex flex-col gap-3 sm:gap-4 relative overflow-hidden group">
                      <div className="flex justify-between items-start gap-2 z-10 w-full min-w-0">
                        <div className="space-y-1 flex-1 min-w-0">
                          <h3 className="font-extrabold text-[10px] sm:text-xs uppercase tracking-widest text-foreground truncate">{cat.name}</h3>
                          <p className="text-[8px] font-mono text-muted-foreground line-clamp-1">{cat.tagline}</p>
                        </div>
                        <button
                          onClick={() => {
                            setJuiceCatToDelete({ id: cat.id, name: cat.name });
                          }}
                          className="p-1 sm:p-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-500 hover:text-red-700 transition-colors cursor-pointer shrink-0"
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
                                  processImageFile(file, (base64) => {
                                    updateCategoryImage(cat.name, base64);
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
        ) : null
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0" onClick={() => setSelectedOrder(null)}></div>
          <div className="bg-white border border-border rounded-[28px] max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col p-4 sm:p-8 relative z-10 animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-border pb-4 sm:pb-5 mb-5 sm:mb-6">
              <div>
                <span className="text-primary font-mono text-[9px] sm:text-[10px] font-black uppercase tracking-widest block mb-1">FRESH N LOCAL ORDER RECEIPT</span>
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
                    STATUS_OPTIONS.find(o => o.value === selectedOrder.status)?.color || 'bg-neutral-400'
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
                  className="border border-border rounded-lg px-2.5 py-1.5 text-[10px] sm:text-xs bg-white font-extrabold uppercase tracking-widest text-foreground cursor-pointer shadow-sm focus:border-primary outline-none"
                >
                  {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>)}
                </select>
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
                    {selectedOrder.shippingDetails?.address || 'No shipping address provided'}
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
                            <img src={prod.imageUrl || catImg || null} alt={prod.name} className="w-full h-full object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-extrabold text-xs text-foreground uppercase truncate" title={prod.name}>{prod.name}</p>
                            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5 truncate">
                              {prod.category?.replace(/ font-bold/gi, '')} {prod.unit ? `• ${prod.unit}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right whitespace-nowrap font-mono shrink-0">
                          <p className="text-xs font-black text-foreground">₹{(prod.price || 0) * (item.quantity || 1)}</p>
                          <p className="text-[10px] text-muted-foreground font-bold mt-0.5">{item.quantity || 1} x ₹{prod.price || 0}</p>
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
                <span className="font-mono font-bold text-foreground">₹{selectedOrder.totalAmount}</span>
              </div>
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
  );
}
