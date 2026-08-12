import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, auth, db, handleFirestoreError, OperationType, isQuotaError, storage, fallbackStorage, AppUser } from '../lib/firebase';
import { collection, query, getDocs, doc, updateDoc, addDoc, deleteDoc, writeBatch, setDoc, getDoc, limit, orderBy } from 'firebase/firestore';
import { ref, uploadString, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Package, Users, ShoppingBag, Plus, Trash2, Upload, Download, Sparkles, Sliders, Check, FileText, Edit2, ChevronDown, ChevronUp, Filter, Calendar, TrendingUp, X, Star, Globe, GripVertical, Search, Calculator, Mail } from 'lucide-react';
import { Product } from '../store/useCart';
import { saveCustomerHorecaPrice } from '../lib/horecaPrices';
import { useSettings } from '../store/useSettings';
import { BrandingSettings } from '../components/BrandingSettings';
import { AUTHENTIC_FNL_JUICES } from './FNLJuice';
import * as XLSX from 'xlsx';
import { getCategoryImage, CATEGORIES } from '../lib/constants';
import { SEO } from '../components/SEO';
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

const formatTotalQuantity = (qty: number, unitStr: string | undefined): string => {
  if (!unitStr) return `${qty}`;
  const match = unitStr.match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    const val = parseFloat(match[1]);
    const unit = match[2].trim();
    if (!isNaN(val)) {
      const totalVal = val * qty;
      const lowerUnit = unit.toLowerCase();
      if ((lowerUnit === 'g' || lowerUnit === 'gm' || lowerUnit === 'gram' || lowerUnit === 'grams') && totalVal >= 1000) {
        return `${(totalVal / 1000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} Kg`;
      }
      if (lowerUnit === 'ml' && totalVal >= 1000) {
        return `${(totalVal / 1000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} L`;
      }
      return `${totalVal.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} ${unit}`;
    }
  }
  const trimmed = unitStr.trim();
  const lowerUnit = trimmed.toLowerCase();
  if (lowerUnit === 'kg') {
    return `${qty} Kg`;
  } else if (lowerUnit === 'l') {
    return `${qty} L`;
  } else if (lowerUnit === 'g' || lowerUnit === 'gm') {
    const totalVal = qty;
    if (totalVal >= 1000) {
      return `${(totalVal / 1000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} Kg`;
    }
    return `${totalVal} ${trimmed}`;
  } else if (lowerUnit === 'ml') {
    const totalVal = qty;
    if (totalVal >= 1000) {
      return `${(totalVal / 1000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} L`;
    }
    return `${totalVal} ${trimmed}`;
  }
  return `${qty} ${trimmed}`;
};

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
    if (user?.role === 'horeca_admin') {
      if (location.pathname.includes('/admin/inventory') || location.pathname.includes('/admin/customers') || location.pathname.includes('/admin/branding')) {
        return 'orders';
      }
    }
    if (location.pathname.includes('/admin/inventory')) return 'products';
    if (location.pathname.includes('/admin/customers')) return 'customers';
    if (location.pathname.includes('/admin/spotlights')) return 'spotlights';
    if (location.pathname.includes('/admin/categories')) return 'categories';
    if (location.pathname.includes('/admin/reviews')) return 'reviews';
    if (location.pathname.includes('/admin/hero')) return 'hero';
    if (location.pathname.includes('/admin/branding')) return 'branding';
    return 'orders'; // corresponds to consignments
  }, [location.pathname, user?.role]);

  useEffect(() => {
    if (user?.role === 'horeca_admin') {
      const restrictedPaths = ['/admin/inventory', '/admin/customers', '/admin/branding'];
      if (restrictedPaths.some(path => location.pathname.includes(path))) {
        navigate('/admin/consignments', { replace: true });
        toast.error("Access restricted: This section is reserved for super administrators.");
      }
    }
  }, [location.pathname, user?.role, navigate]);
  
  const [diagError, setDiagError] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<AppUser[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    import('../store/useProducts').then(m => {
      // Immediate sync if available
      if (m.useProducts.getState().products.length > 0 && products.length === 0) {
        setProducts(m.useProducts.getState().products);
      }
      
      // Subscribe to future updates from the store
      unsubscribe = m.useProducts.subscribe((state) => {
        if (state.products.length > 0 && products.length === 0) {
          setProducts(state.products);
        }
      });

      // Trigger fetch if empty (will no-op if already loading)
      if (m.useProducts.getState().products.length === 0) {
        m.useProducts.getState().fetchProducts(false);
      }
    });
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [products.length]);

  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      import('../lib/cacheManager').then(m => m.trackFirestoreRead('users', snapshot.docs.length)).catch(() => {});
      const adminEmails = ['freshnlocalco@gmail.com', 'mohitswami855@gmail.com', 'freshnlocal2@gmail.com'];
      
      let usersData = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const email = (data.email || '').toLowerCase().trim();
        const isSuperAdmin = adminEmails.includes(email) || email.startsWith('admin@');
        const role = isSuperAdmin ? 'admin' : (data.role || 'customer');
        
        if (isSuperAdmin && data.role !== 'admin') {
          updateDoc(doc(db, 'users', docSnap.id), { role: 'admin' }).catch(() => {});
        }
        
        return { uid: docSnap.id, ...data, role } as AppUser;
      });
      
      const roleOrder = { admin: 0, horeca: 1, customer: 2 };
      usersData.sort((a, b) => {
        const roleA = roleOrder[a.role as keyof typeof roleOrder] ?? 2;
        const roleB = roleOrder[b.role as keyof typeof roleOrder] ?? 2;
        if (roleA !== roleB) return roleA - roleB;
        
        const timeA = a.createdAt || 0;
        const timeB = b.createdAt || 0;
        return timeB - timeA; // newest first
      });
      
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

  const handleSetRole = async (customerUser: AppUser, newRole: 'customer' | 'horeca' | 'admin') => {
    try {
      await updateDoc(doc(db, 'users', customerUser.uid), { role: newRole });
      setCustomers(customers.map(c => c.uid === customerUser.uid ? { ...c, role: newRole } : c));
      toast.success(`User role updated to ${newRole.toUpperCase()}`);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };

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
    categoryVisibility,
    productCategories, 
    horecaCategoryOrder,
    juiceCategories, 
    fetchCategoryImages, 
    updateCategoryImage, 
    updateCategoryVisibility,
    addProductCategory, 
    addJuiceCategory, 
    deleteProductCategory,
    deleteJuiceCategory,
    reorderProductCategories,
    reorderHorecaCategories,
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
  const [orderProductSearch, setOrderProductSearch] = useState('');

  // Filters for orders
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomerType, setFilterCustomerType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // States for exporting Horeca/B2B Orders
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportParty, setExportParty] = useState<string>('all');
  const [exportStatus, setExportStatus] = useState<string>('pending');
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'sheets' | 'single' | 'picking'>('sheets');

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

  const [aiGenerationStatus, setAiGenerationStatus] = useState<{
    generating: boolean;
    total: number;
    processed: number;
    generated: number;
    errors: number;
  }>({
    generating: false,
    total: 0,
    processed: 0,
    generated: 0,
    errors: 0
  });
  const [isGeneratingSingleDesc, setIsGeneratingSingleDesc] = useState(false);

  

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



  const runAIDescriptionGeneration = async () => {
    if (aiGenerationStatus.generating) return;

    setAiGenerationStatus({
      generating: true,
      total: 0,
      processed: 0,
      generated: 0,
      errors: 0
    });

    try {
      toast.loading('Scanning catalog for products needing descriptions...', { id: 'ai-desc-generation' });
      const productsSnap = await getDocs(collection(db, 'products'));
      const allDocs = productsSnap.docs;

      const targetCategories = [
        'in season fruuts',
        'exotic fruits',
        'indian fruits',
        'exotic vegetable',
        'imported vegetable',
        'mushrooms',
        'herbs & seasoning',
        'indian vegetable',
        'fresh & hygenic cut fruits and vegetables',
        'leafy greens',
        'frozen items'
      ];

      const docsToGenerate = allDocs.filter(d => {
        const data = d.data();
        const category = data.category || '';
        const catLower = category.toLowerCase().trim();
        const isTarget = targetCategories.some(t => {
          const tLower = t.toLowerCase().trim();
          return tLower === catLower || tLower + 's' === catLower || tLower === catLower + 's';
        });
        if (!isTarget) return false;

        const desc = (data.description || '').trim();
        const wordCount = desc.split(/\s+/).length;
        const needsDesc = !data.description || wordCount < 20 || desc.toLowerCase().startsWith('origin') || !data.metaDescription;
        return needsDesc;
      });

      const totalCount = docsToGenerate.length;
      if (totalCount === 0) {
        toast.success('All matching fresh produce products already have high-fidelity AI descriptions!', { id: 'ai-desc-generation' });
        setAiGenerationStatus(prev => ({ ...prev, generating: false }));
        return;
      }

      toast.loading(`Found ${totalCount} products to generate descriptions for. Processing in batches...`, { id: 'ai-desc-generation' });
      setAiGenerationStatus(prev => ({
        ...prev,
        total: totalCount,
        processed: 0,
        generated: 0,
        errors: 0
      }));

      let localProcessed = 0;
      let localGenerated = 0;
      let localErrors = 0;

      const BATCH_SIZE = 3;
      for (let i = 0; i < docsToGenerate.length; i += BATCH_SIZE) {
        const batch = docsToGenerate.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (docSnap) => {
          const data = docSnap.data();
          try {
            const res = await fetch("/api/gemini/generate-description", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: data.name,
                category: data.category,
                unit: data.unit || ""
              })
            });

            if (!res.ok) {
              throw new Error(`HTTP error ${res.status}`);
            }

            const result = await res.json();
            if (!result.description || !result.metaDescription) {
              throw new Error("Invalid output received from Gemini API.");
            }

            // Update in Firestore!
            await updateDoc(doc(db, 'products', docSnap.id), {
              description: result.description,
              metaDescription: result.metaDescription,
              updatedAt: Date.now()
            });

            localGenerated++;
          } catch (err: any) {
            console.error(`Failed generation for ${data.name}:`, err);
            localErrors++;
          } finally {
            localProcessed++;
            setAiGenerationStatus(prev => ({
              ...prev,
              processed: localProcessed,
              generated: localGenerated,
              errors: localErrors
            }));
          }
        }));

        // Delay between batches to respect rate limits nicely
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      toast.success(`AI generation complete! Successfully generated descriptions for ${localGenerated} products.`, { id: 'ai-desc-generation' });
      
      // Trigger local store update
      const mProductsStore = await import('../store/useProducts');
      mProductsStore.useProducts.getState().fetchProducts(true);

    } catch (err: any) {
      console.error("AI Description generation failed:", err);
      toast.error(`AI generation failed: ${err.message || 'Server error'}`, { id: 'ai-desc-generation' });
    } finally {
      setAiGenerationStatus(prev => ({ ...prev, generating: false }));
    }
  };



  const generateSingleAIDescription = async () => {
    if (!newProduct.name || !newProduct.category) {
      toast.error('Please enter a product name and category first.');
      return;
    }
    
    setIsGeneratingSingleDesc(true);
    toast.loading('Generating AI description...', { id: 'single-ai-desc' });
    
    try {
      const res = await fetch("/api/gemini/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProduct.name,
          category: newProduct.category,
          unit: `${newProduct.quantityValue} ${newProduct.quantityUnit}`.trim()
        })
      });
      
      if (!res.ok) {
        let errorMsg = 'Failed to generate';
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch (_) {
          try {
            const errText = await res.text();
            if (errText) errorMsg = errText.slice(0, 150);
          } catch (_) {}
        }
        throw new Error(errorMsg);
      }
      
      const responseData = await res.json();
      
      if (!responseData.description) {
        throw new Error('Received empty description from AI');
      }
      
      setNewProduct(prev => ({
        ...prev,
        description: responseData.description
      }));
      
      toast.success('Description generated successfully!', { id: 'single-ai-desc' });
    } catch (err: any) {
      console.error("Single AI Description generation failed:", err);
      toast.error(`Generation failed: ${err.message || 'Server error'}`, { id: 'single-ai-desc' });
    } finally {
      setIsGeneratingSingleDesc(false);
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
    const seen = new Set<string>();
    const list = filteredProducts.filter(p => {
      if (!p || !p.id) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
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
    // If user is HORECA admin, restrict orders to HORECA orders only
    if (user?.role === 'horeca_admin') {
      const isHorecaOrder = order.customerType === 'horeca' || order.customerType === 'horeca_admin';
      if (!isHorecaOrder) return false;
    }

    // filter by search query (order number)
    if (orderSearchQuery.trim()) {
      const query = orderSearchQuery.toLowerCase().trim();
      if (order.orderNumber?.toLowerCase().includes(query)) {
        return true; // Ignore other filters if search matches
      }
      return false; // If searching and it doesn't match, hide it
    }

    // filter by status
    if (filterStatus !== 'all' && order.status !== filterStatus) return false;

    // filter by customer type
    if (filterCustomerType !== 'all') {
      const isHorecaOrder = order.customerType === 'horeca' || order.customerType === 'horeca_admin';
      if (filterCustomerType === 'b2b' && !isHorecaOrder) return false;
      if (filterCustomerType === 'b2c' && isHorecaOrder) return false;
    }
    
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

  const uniqueB2BParties = React.useMemo(() => {
    return Array.from(new Set(
      orders
        .filter(o => o.customerType === 'horeca' || o.customerType === 'horeca_admin')
        .map(o => o.shippingDetails?.name || 'Unknown B2B Customer')
    )).filter(Boolean).sort();
  }, [orders]);

  const getExportPreviewStats = () => {
    let list = orders.filter(o => o.customerType === 'horeca' || o.customerType === 'horeca_admin');
    if (exportParty !== 'all') {
      list = list.filter(o => (o.shippingDetails?.name || 'Unknown B2B Customer') === exportParty);
    }
    if (exportStatus !== 'all') {
      list = list.filter(o => o.status === exportStatus);
    }
    if (exportStartDate) {
      const start = new Date(exportStartDate).getTime();
      list = list.filter(o => new Date(o.createdAt).getTime() >= start);
    }
    if (exportEndDate) {
      const end = new Date(exportEndDate).getTime() + (24 * 60 * 60 * 1000);
      list = list.filter(o => new Date(o.createdAt).getTime() <= end);
    }

    const totalQty = list.reduce((sum, o) => sum + (o.items?.reduce((s: number, i: any) => s + (i.quantity || 1), 0) || 0), 0);
    const totalAmt = list.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    return {
      orderCount: list.length,
      itemCount: totalQty,
      totalAmount: totalAmt
    };
  };

  const previewStats = getExportPreviewStats();

  // Spotlights state
  const [spotlightsConfig, setSpotlightsConfig] = useState<Record<string, {title: string, image: string}>>({});
  const [heroBanners, setHeroBanners] = useState<{id: string, imageUrl: string, link: string}[]>([]);
  const [draggedBannerIndex, setDraggedBannerIndex] = useState<number | null>(null);

  // New product form handling
  const [newProduct, setNewProduct] = useState<{ name: string; price: string; originalPrice: string; horecaPrice: string; horecaUnit: string; category: string; subCategory: string; description: string; imageUrl: string; unit: string; quantityValue: string; quantityUnit: string; packSize: string; horecaQuantityValue: string; horecaQuantityUnit: string; variants: { unit: string; quantityValue: string; quantityUnit: string; packSize?: string; horecaQuantityValue: string; horecaQuantityUnit: string; price: string; originalPrice: string; horecaPrice: string; horecaUnit: string }[]; useBasePricing?: boolean; basePrice?: string; baseUnit?: string; baseOriginalPrice?: string; baseHorecaPrice?: string }>({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: 'indian fruits', subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', quantityValue: '', quantityUnit: 'Kg', packSize: '', horecaQuantityValue: '', horecaQuantityUnit: 'Kg', variants: [], useBasePricing: false, basePrice: '', baseUnit: 'Kg', baseOriginalPrice: '', baseHorecaPrice: '' });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [seedingJuices, setSeedingJuices] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});

  // Bulk update states
  const [bulkUpdateModalOpen, setBulkUpdateModalOpen] = useState(false);
  const [bulkChangedProducts, setBulkChangedProducts] = useState<any[]>([]);

  const [draggedProductIdx, setDraggedProductIdx] = useState<number | null>(null);
  const [dragOverProductIdx, setDragOverProductIdx] = useState<number | null>(null);

  const [draggedProdCat, setDraggedProdCat] = useState<number | null>(null);
  const [dragOverProdCat, setDragOverProdCat] = useState<number | null>(null);
  const [categoryOrderMode, setCategoryOrderMode] = useState<'retail' | 'horeca'>('retail');
  
  const [draggedJuiceCat, setDraggedJuiceCat] = useState<number | null>(null);
  const [dragOverJuiceCat, setDragOverJuiceCat] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'horeca_admin') return;
    
    async function fetchData() {
      try {
        setLoading(true);
        if (activeTab === 'orders') {
          const ordersSnap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)));
          const mCache = await import('../lib/cacheManager');
          mCache.trackFirestoreRead('orders', ordersSnap.size);
          setOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          
          if (products.length === 0) {
            const m = await import('../store/useProducts');
            await m.useProducts.getState().fetchProducts(false);
            setProducts(m.useProducts.getState().products);
          }
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

  if (user?.role !== 'admin' && user?.role !== 'horeca_admin') {
    return (
      <div className="max-w-md mx-auto my-24 p-8 rounded-[28px] bg-secondary border border-red-500/20 text-center space-y-4">
        <span className="text-red-400 font-mono text-xs uppercase tracking-widest block">403 FORBIDDEN</span>
        <h2 className="text-xl font-black uppercase text-foreground">Access Denied</h2>
        <p className="text-xs text-muted-foreground">You do not possess administrative or HoReCa control desk credentials to view this desk.</p>
      </div>
    );
  }

  const handleExportCSV = () => {
    try {
      const headers = ["PRODUCT NAME", "CATEGORY", "UNIT", "MRP", "RATE PRICE", "HORECA PRICE", "HORECA UNIT", "DESCRIPTION", "IMAGE URL"];
      const csvRows = [];
      csvRows.push(headers.join(","));
      
      filteredProducts.forEach(product => {
        const row = [
          `"${(product.name || '').replace(/"/g, '""')}"`,
          `"${(product.category || '').replace(/"/g, '""')}"`,
          `"${(product.unit || '').replace(/"/g, '""')}"`,
          `"${product.originalPrice || product.price || ''}"`,
          `"${product.price || ''}"`,
          `"${product.horecaPrice !== undefined && product.horecaPrice !== null ? product.horecaPrice : ''}"`,
          `"${(product.horecaUnit || '').replace(/"/g, '""')}"`,
          `"${(product.description || '').replace(/"/g, '""')}"`,
          `"${(product.imageUrl || '').replace(/"/g, '""')}"`
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

  const handleExportHorecaCSV = () => {
    try {
      const headers = ["PRODUCT NAME", "CATEGORY", "HORECA PRICE", "HORECA UNIT", "DESCRIPTION", "IMAGE URL"];
      const csvRows = [];
      csvRows.push(headers.join(","));
      
      const horecaProducts = filteredProducts.filter(p => p.horecaPrice !== undefined && p.horecaPrice !== null);
      
      horecaProducts.forEach(product => {
        const row = [
          `"${(product.name || '').replace(/"/g, '""')}"`,
          `"${(product.category || '').replace(/"/g, '""')}"`,
          `"${product.horecaPrice !== undefined && product.horecaPrice !== null ? product.horecaPrice : ''}"`,
          `"${(product.horecaUnit || '').replace(/"/g, '""')}"`,
          `"${(product.description || '').replace(/"/g, '""')}"`,
          `"${(product.imageUrl || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(","));
      });
      
      const csvString = csvRows.join("\n");
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `horeca_products_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      if (horecaProducts.length === 0) {
        toast.error("No Horeca products found to export.");
      } else {
        toast.success(`Exported ${horecaProducts.length} Horeca products successfully.`);
      }
    } catch (err) {
      console.error("Horeca Export error:", err);
      toast.error("Failed to export Horeca products.");
    }
  };

  const handleExportHorecaOrders = () => {
    try {
      // 1. Get B2B orders
      let b2bOrders = orders.filter(o => o.customerType === 'horeca' || o.customerType === 'horeca_admin');

      // 2. Filter by selected Party
      if (exportParty !== 'all') {
        b2bOrders = b2bOrders.filter(o => (o.shippingDetails?.name || 'Unknown B2B Customer') === exportParty);
      }

      // 3. Filter by selected Status
      if (exportStatus !== 'all') {
        b2bOrders = b2bOrders.filter(o => o.status === exportStatus);
      }

      // 4. Filter by Date range
      if (exportStartDate) {
        const startDate = new Date(exportStartDate).getTime();
        b2bOrders = b2bOrders.filter(o => new Date(o.createdAt).getTime() >= startDate);
      }
      if (exportEndDate) {
        // add 24 hours to include the entire end date
        const endDate = new Date(exportEndDate).getTime() + (24 * 60 * 60 * 1000);
        b2bOrders = b2bOrders.filter(o => new Date(o.createdAt).getTime() <= endDate);
      }

      if (b2bOrders.length === 0) {
        toast.error("No Horeca orders found for the selected criteria.");
        return;
      }

      const workbook = XLSX.utils.book_new();

      if (exportFormat === 'sheets') {
        // Format A: Separate Sheets per Party
        const partiesMap = new Map<string, any[]>();
        b2bOrders.forEach(o => {
          const partyName = o.shippingDetails?.name || 'Unknown Party';
          if (!partiesMap.has(partyName)) {
            partiesMap.set(partyName, []);
          }
          partiesMap.get(partyName)!.push(o);
        });

        partiesMap.forEach((partyOrders, partyName) => {
          const sheetData: any[] = [];
          
          partyOrders.forEach(order => {
            const orderNo = order.orderNumber || `FNL-${order.id.slice(0, 8).toUpperCase()}`;
            const orderDate = new Date(order.createdAt).toLocaleString();
            
            order.items.forEach((item: any) => {
              const prod = item.product || item;
              if (!prod) return;
              sheetData.push({
                "Order Number": orderNo,
                "Order Date": orderDate,
                "Customer Name": partyName,
                "Phone": order.shippingDetails?.phone || '',
                "Address": order.shippingDetails?.address || '',
                "Product Name": prod.name || '',
                "Unit": prod.unit || '',
                "Quantity": item.quantity || 1,
                "Price (₹)": item.price !== undefined ? item.price : (prod.price || 0),
                "Total (₹)": (item.quantity || 1) * (item.price !== undefined ? item.price : (prod.price || 0)),
                "Payment Method": order.paymentMethod || 'COD',
                "Status": order.status || 'pending'
              });
            });
          });

          if (sheetData.length > 0) {
            const totalQty = sheetData.reduce((sum, r) => sum + r["Quantity"], 0);
            const totalAmt = sheetData.reduce((sum, r) => sum + r["Total (₹)"], 0);
            sheetData.push({
              "Order Number": "TOTAL",
              "Order Date": "",
              "Customer Name": "",
              "Phone": "",
              "Address": "",
              "Product Name": "",
              "Unit": "",
              "Quantity": totalQty,
              "Price (₹)": "",
              "Total (₹)": totalAmt,
              "Payment Method": "",
              "Status": ""
            });
          }

          const cleanedSheetName = partyName.replace(/[\\\/\?\*\[\]]/g, '').slice(0, 30) || 'Sheet';
          const worksheet = XLSX.utils.json_to_sheet(sheetData);
          XLSX.utils.book_append_sheet(workbook, worksheet, cleanedSheetName);
        });

      } else if (exportFormat === 'single') {
        // Format B: Single Sheet, sorted by party name
        const sheetData: any[] = [];
        
        const sortedOrders = [...b2bOrders].sort((a, b) => {
          const nameA = a.shippingDetails?.name || '';
          const nameB = b.shippingDetails?.name || '';
          return nameA.localeCompare(nameB);
        });

        sortedOrders.forEach(order => {
          const orderNo = order.orderNumber || `FNL-${order.id.slice(0, 8).toUpperCase()}`;
          const orderDate = new Date(order.createdAt).toLocaleString();
          const partyName = order.shippingDetails?.name || 'Unknown Party';
          
          order.items.forEach((item: any) => {
            const prod = item.product || item;
            if (!prod) return;
            sheetData.push({
              "Party/Customer Name": partyName,
              "Order Number": orderNo,
              "Order Date": orderDate,
              "Phone": order.shippingDetails?.phone || '',
              "Address": order.shippingDetails?.address || '',
              "Product Name": prod.name || '',
              "Unit": prod.unit || '',
              "Quantity": item.quantity || 1,
              "Price (₹)": item.price !== undefined ? item.price : (prod.price || 0),
              "Total (₹)": (item.quantity || 1) * (item.price !== undefined ? item.price : (prod.price || 0)),
              "Payment Method": order.paymentMethod || 'COD',
              "Status": order.status || 'pending'
            });
          });
        });

        if (sheetData.length > 0) {
          const totalQty = sheetData.reduce((sum, r) => sum + r["Quantity"], 0);
          const totalAmt = sheetData.reduce((sum, r) => sum + r["Total (₹)"], 0);
          sheetData.push({
            "Party/Customer Name": "TOTAL",
            "Order Number": "",
            "Order Date": "",
            "Phone": "",
            "Address": "",
            "Product Name": "",
            "Unit": "",
            "Quantity": totalQty,
            "Price (₹)": "",
            "Total (₹)": totalAmt,
            "Payment Method": "",
            "Status": ""
          });
        }

        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'All B2B Orders');

      } else if (exportFormat === 'picking') {
        // Format C: Picking Summary
        const productAggrMap = new Map<string, { name: string; unit: string; totalQty: number; totalAmt: number; parties: Set<string> }>();

        b2bOrders.forEach(order => {
          const partyName = order.shippingDetails?.name || 'Unknown Party';
          order.items.forEach((item: any) => {
            const prod = item.product || item;
            if (!prod) return;
            const pKey = `${prod.name}_${prod.unit || ''}`;
            const price = item.price !== undefined ? item.price : (prod.price || 0);
            const qty = item.quantity || 1;
            const amt = qty * price;

            if (!productAggrMap.has(pKey)) {
              productAggrMap.set(pKey, {
                name: prod.name,
                unit: prod.unit || '',
                totalQty: 0,
                totalAmt: 0,
                parties: new Set()
              });
            }

            const existing = productAggrMap.get(pKey)!;
            existing.totalQty += qty;
            existing.totalAmt += amt;
            existing.parties.add(partyName);
          });
        });

        const sheetData = Array.from(productAggrMap.values()).map(item => ({
          "Product Name": item.name,
          "Unit": item.unit,
          "Total Quantity": item.totalQty,
          "Fulfillment Unit Helper": formatTotalQuantity(item.totalQty, item.unit),
          "Estimated Total Value (₹)": item.totalAmt,
          "Ordered By Parties": Array.from(item.parties).join(", ")
        }));

        sheetData.sort((a, b) => a["Product Name"].localeCompare(b["Product Name"]));

        if (sheetData.length > 0) {
          const totalQty = sheetData.reduce((sum, r) => sum + r["Total Quantity"], 0);
          const totalAmt = sheetData.reduce((sum, r) => sum + r["Estimated Total Value (₹)"], 0);
          sheetData.push({
            "Product Name": "TOTAL SUMMARY",
            "Unit": "",
            "Total Quantity": totalQty,
            "Fulfillment Unit Helper": "",
            "Estimated Total Value (₹)": totalAmt,
            "Ordered By Parties": ""
          });
        }

        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Picking List Summary');
      }

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      
      const fileDateSuffix = new Date().toISOString().split('T')[0];
      const filename = `Horeca_B2B_Export_${exportFormat}_${exportStatus}_${fileDateSuffix}.xlsx`;
      
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Horeca orders exported successfully.");
      setIsExportModalOpen(false);
    } catch (err) {
      console.error("Horeca orders export error:", err);
      toast.error("Failed to export Horeca orders.");
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

  const handleUpdateItemPriceFromOrder = async (orderId: string, itemIndex: number, newPrice: number) => {
    if (newPrice < 0) return;
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.items) return;
      
      const newItems = [...order.items];
      const itemToUpdate = { ...newItems[itemIndex] };
      if (itemToUpdate.product) {
        itemToUpdate.product = { ...itemToUpdate.product, price: newPrice };
      } else {
        itemToUpdate.price = newPrice;
      }
      newItems[itemIndex] = itemToUpdate;
      
      const newTotal = newItems.reduce((sum, item) => {
        const p = item.product || item;
        return sum + (p.price || 0) * (item.quantity || 1);
      }, 0);

      const prod = itemToUpdate.product || itemToUpdate;

      await updateDoc(doc(db, 'orders', orderId), { 
        items: newItems, 
        totalAmount: newTotal,
        priceUpdatedEmailPending: true,
        shippingEmailStatus: null,
        updatedAt: Date.now() 
      });

      // Save remembered price for HoReCa customer
      const customerUserId = order.userId || '';
      const customerEmail = order.shippingDetails?.email || (order as any).customerEmail || '';
      if ((customerUserId || customerEmail) && prod) {
        const pId = prod.id || prod.productId || '';
        const pName = prod.name || prod.productName || '';
        await saveCustomerHorecaPrice(customerUserId, pId, newPrice, pName, customerEmail);
      }
      
      const updatedOrder = { 
        ...order, 
        items: newItems, 
        totalAmount: newTotal, 
        priceUpdatedEmailPending: true, 
        shippingEmailStatus: null 
      };
      setOrders(orders.map(o => o.id === orderId ? updatedOrder : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(updatedOrder);
      }
      toast.success('Item price updated & customer rate remembered!');
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
      toast.error(e?.message || 'Failed to update item price');
    }
  };

  const handleAddProductToOrder = async (orderId: string, productToAdd: Product) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.items) return;
      
      const newItems = [...order.items];
      const existingItemIndex = newItems.findIndex(i => (i.product?.id || i.id) === productToAdd.id);
      
      if (existingItemIndex >= 0) {
        newItems[existingItemIndex] = { ...newItems[existingItemIndex], quantity: (newItems[existingItemIndex].quantity || 1) + 1 };
      } else {
        const p: any = {
          id: productToAdd.id,
          name: productToAdd.name,
          price: productToAdd.price,
        };
        if (productToAdd.unit !== undefined) p.unit = productToAdd.unit;
        if (productToAdd.imageUrl !== undefined) p.imageUrl = productToAdd.imageUrl;
        if (productToAdd.category !== undefined) p.category = productToAdd.category;
        
        newItems.push({
          product: p,
          quantity: 1
        });
      }
      
      const newTotal = newItems.reduce((sum, item) => {
        const p = item.product || item;
        return sum + (p.price || 0) * (item.quantity || 1);
      }, 0);
      
      // JSON clone to strictly strip undefined nested fields
      const cleanItems = JSON.parse(JSON.stringify(newItems));

      await updateDoc(doc(db, 'orders', orderId), { 
        items: cleanItems, 
        totalAmount: newTotal,
        priceUpdatedEmailPending: true,
        shippingEmailStatus: null,
        updatedAt: Date.now() 
      });

      // Save remembered price if added
      const customerUserIdAdd = order.userId || '';
      const customerEmailAdd = order.shippingDetails?.email || (order as any).customerEmail || '';
      if ((customerUserIdAdd || customerEmailAdd) && productToAdd) {
        await saveCustomerHorecaPrice(customerUserIdAdd, productToAdd.id || '', productToAdd.price, productToAdd.name, customerEmailAdd);
      }
      
      const updatedOrder = { 
        ...order, 
        items: newItems, 
        totalAmount: newTotal, 
        priceUpdatedEmailPending: true, 
        shippingEmailStatus: null 
      };
      setOrders(orders.map(o => o.id === orderId ? updatedOrder : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(updatedOrder);
      }
      setOrderProductSearch('');
      toast.success('Product added & rate queued');
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
      toast.error(e?.message || 'Failed to add product');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { 
        status, 
        shippingEmailStatus: null,
        updatedAt: Date.now() 
      });
      setOrders(orders.map(o => o.id === orderId ? { ...o, status, shippingEmailStatus: null } : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status, shippingEmailStatus: null } : null);
      }
      toast.success(`Order ${orderId.slice(0, 6)} changed to ${status} & confirmation queued`);
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
      
      const orderToCancel = orders.find(o => o.id === orderId);
      if (orderToCancel && orderToCancel.shippingDetails?.email) {
        try {
          await fetch('/api/emails/cancel-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: orderToCancel, id: orderId }),
          });
        } catch (emailErr) {
          console.error("Failed to send cancellation email on delete:", emailErr);
        }
      }

      await deleteDoc(doc(db, 'orders', orderId));
      setOrders(orders.filter(o => o.id !== orderId));
      setOrderToDelete(null);
      toast.success('Order deleted and cancellation email sent successfully.');
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
        packSize: v.packSize || '',
        quantityValue: v.quantityValue ? Number(v.quantityValue) : null,
        quantityUnit: v.quantityUnit || 'Kg',
        price: Number(v.price),
        originalPrice: v.originalPrice ? Number(v.originalPrice) : null,
        horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : null,
        horecaUnit: v.horecaUnit || '',
      }));

      const useBasePricing = newProduct.useBasePricing ?? false;
      const basePrice = newProduct.basePrice ? Number(newProduct.basePrice) : null;
      const primaryUnitNorm = normalizeBaseUnit(newProduct.quantityUnit, 'Kg');
      let baseUnit = normalizeBaseUnit(newProduct.baseUnit, primaryUnitNorm);
      if (baseUnit === 'Kg' && primaryUnitNorm !== 'Kg') {
        baseUnit = primaryUnitNorm;
      }
      const baseOriginalPrice = newProduct.baseOriginalPrice ? Number(newProduct.baseOriginalPrice) : null;
      const baseHorecaPrice = newProduct.baseHorecaPrice ? Number(newProduct.baseHorecaPrice) : null;

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
          packSize: newProduct.packSize || '',
          variants: variantsToSave,
          useBasePricing,
          basePrice,
          baseUnit,
          baseOriginalPrice,
          baseHorecaPrice,
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
          packSize: newProduct.packSize || '',
          variants: variantsToSave,
          useBasePricing,
          basePrice,
          baseUnit,
          baseOriginalPrice,
          baseHorecaPrice,
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
        packSize: newProduct.packSize || '',
        variants: variantsToSave,
        useBasePricing,
        basePrice: basePrice !== null ? basePrice : undefined,
        baseUnit,
        baseOriginalPrice: baseOriginalPrice !== null ? baseOriginalPrice : undefined,
        baseHorecaPrice: baseHorecaPrice !== null ? baseHorecaPrice : undefined,
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

      setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', quantityValue: '', quantityUnit: 'Kg', packSize: '', horecaQuantityValue: '', horecaQuantityUnit: 'Kg', variants: [], useBasePricing: false, basePrice: '', baseUnit: 'Kg', baseOriginalPrice: '', baseHorecaPrice: '' });
    } catch (error) {
      console.error(`[Step 5: Firestore Save Error] Failed to save product catalog document:`, error);
      handleFirestoreError(error, editingProductId ? OperationType.UPDATE : OperationType.CREATE, 'products');
      toast.error('Could not save product catalog.');
    }
  };

  const normalizeUnit = (u: string) => {
    if (!u) return 'Kg';
    const low = u.trim().toLowerCase();
    if (['kg', 'kilogram', 'kilograms'].includes(low)) return 'Kg';
    if (['gm', 'g', 'gram', 'grams'].includes(low)) return 'g';
    if (['l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(low)) return 'Ltr';
    if (['ml', 'milliliter', 'milliliters'].includes(low)) return 'ml';
    if (['pc', 'pcs', 'piece', 'pieces', 'item', 'items'].includes(low)) return 'Pc';
    if (['pack', 'packs', 'pkt', 'packet', 'packets'].includes(low)) return 'Pack';
    if (['box', 'boxes'].includes(low)) return 'Box';
    if (['bottle', 'bottles', 'bottel', 'bot'].includes(low)) return 'Bottle';
    if (['can', 'cans'].includes(low)) return 'Can';
    if (['dozen', 'dozens', 'dz'].includes(low)) return 'Dozen';
    if (['bunch', 'bunches'].includes(low)) return 'Bunch';
    if (['tray', 'trays'].includes(low)) return 'Tray';
    if (['pouch', 'pouches'].includes(low)) return 'Pouch';
    if (['jar', 'jars'].includes(low)) return 'Jar';
    if (['carton', 'cartons'].includes(low)) return 'Carton';
    if (['crate', 'crates'].includes(low)) return 'Crate';
    return low.charAt(0).toUpperCase() + low.slice(1);
  };

  const parseQuantityAndUnit = (unitStr: string | undefined): { qVal: string, qUnit: string, packSize: string } => {
    if (!unitStr) return { qVal: '', qUnit: 'Kg', packSize: '' };
    const packMatch = unitStr.match(/^([\d.]+)\s*([a-zA-Z]+)\s*(?:\(([^)]+)\)|-\s*(.+))$/);
    if (packMatch) {
      const u = normalizeUnit(packMatch[2]);
      const pSize = (packMatch[3] || packMatch[4] || '').trim();
      return { qVal: packMatch[1], qUnit: u, packSize: pSize };
    }
    const match = unitStr.match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      const u = normalizeUnit(match[2]);
      return { qVal: match[1], qUnit: u, packSize: '' };
    }
    return { qVal: '', qUnit: 'Kg', packSize: '' };
  };

  const buildUnitString = (qVal: string, qUnit: string, packSize?: string) => {
    const val = qVal || '';
    const unitName = qUnit || 'Kg';
    if (packSize && packSize.trim()) {
      return `${val}${unitName === 'Pack' ? 'Pack' : ' ' + unitName} (${packSize.trim()})`;
    }
    return `${val}${unitName === 'Pack' ? 'Pack' : ' ' + unitName}`.trim();
  };

  const normalizeBaseUnit = (bu?: string | null, defaultUnit: string = 'Kg'): string => {
    if (!bu || !String(bu).trim()) return defaultUnit;
    const lower = String(bu).trim().toLowerCase();
    
    // Weight
    if (['g', 'gm', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(lower)) return 'Kg';
    
    // Volume
    if (['ml', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(lower)) return 'Ltr';
    
    // Pieces / Items
    if (['pc', 'pcs', 'piece', 'pieces', 'item', 'items'].includes(lower)) return 'Pc';
    
    // Packs / Packets
    if (['pack', 'packs', 'pkt', 'packet', 'packets'].includes(lower)) return 'Pack';
    
    // Boxes
    if (['box', 'boxes'].includes(lower)) return 'Box';
    
    // Bottles
    if (['bottle', 'bottles', 'bottel', 'bot'].includes(lower)) return 'Bottle';
    
    // Cans
    if (['can', 'cans'].includes(lower)) return 'Can';
    
    // Dozens
    if (['dozen', 'dozens', 'dz'].includes(lower)) return 'Dozen';
    
    // Bunches
    if (['bunch', 'bunches'].includes(lower)) return 'Bunch';
    
    // Trays
    if (['tray', 'trays'].includes(lower)) return 'Tray';

    // Pouches
    if (['pouch', 'pouches'].includes(lower)) return 'Pouch';

    // Jars
    if (['jar', 'jars'].includes(lower)) return 'Jar';

    // Cartons
    if (['carton', 'cartons'].includes(lower)) return 'Carton';

    // Crates
    if (['crate', 'crates'].includes(lower)) return 'Crate';

    const trimmed = String(bu).trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  const calculatePriceFromBase = (
    basePriceVal: string | number | undefined,
    baseUnit: string,
    targetValueStr: string | number | undefined,
    targetUnit: string
  ): string => {
    const basePrice = parseFloat(String(basePriceVal || ''));
    const targetValue = parseFloat(String(targetValueStr || ''));
    
    if (isNaN(basePrice) || isNaN(targetValue) || targetValue <= 0) {
      return '';
    }

    const normalizedBase = normalizeBaseUnit(baseUnit, 'Kg').toLowerCase();
    const normalizedTarget = (targetUnit || 'Kg').toLowerCase();

    let factor = 1;

    // Weight conversions (Base rate is ALWAYS per 1000g / 1 Kg)
    const isBaseWeight = ['kg', 'g', 'gm', 'gram', 'grams', 'kilogram', 'kilograms'].includes(normalizedBase);
    const isTargetWeight = ['kg', 'g', 'gm', 'gram', 'grams', 'kilogram', 'kilograms'].includes(normalizedTarget);

    // Volume conversions (Base rate is ALWAYS per 1000ml / 1 Ltr)
    const isBaseVolume = ['l', 'ml', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(normalizedBase);
    const isTargetVolume = ['l', 'ml', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(normalizedTarget);

    if (isBaseWeight && isTargetWeight) {
      const baseInGrams = 1000;
      const targetInGrams = ['kg', 'kilogram', 'kilograms'].includes(normalizedTarget) ? 1000 : 1;
      factor = (targetValue * targetInGrams) / baseInGrams;
    } else if (isBaseVolume && isTargetVolume) {
      const baseInMl = 1000;
      const targetInMl = ['l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(normalizedTarget) ? 1000 : 1;
      factor = (targetValue * targetInMl) / baseInMl;
    } else {
      // Discrete or unmatched units
      const getMultiplier = (unit: string) => {
        if (unit === 'dozen') return 12;
        return 1;
      };
      const baseMult = getMultiplier(normalizedBase);
      const targetMult = getMultiplier(normalizedTarget);
      
      if (normalizedBase === normalizedTarget) {
        factor = targetValue;
      } else {
        factor = (targetValue * targetMult) / baseMult;
      }
    }

    const finalPrice = basePrice * factor;
    if (finalPrice % 1 === 0) {
      return finalPrice.toString();
    }
    return Number(finalPrice.toFixed(2)).toString();
  };

  const inferBasePricing = (
    product: any,
    mainQuantityValue: string,
    mainQuantityUnit: string
  ) => {
    const priceNum = parseFloat(product.price);
    const qtyVal = parseFloat(mainQuantityValue);
    const primaryUnitNorm = normalizeBaseUnit(mainQuantityUnit, 'Kg');
    const qUnit = primaryUnitNorm || 'Kg';
    
    if (isNaN(priceNum) || isNaN(qtyVal) || qtyVal <= 0) {
      return {
        useBasePricing: false,
        basePrice: '',
        baseUnit: qUnit,
        baseOriginalPrice: '',
        baseHorecaPrice: ''
      };
    }

    if (product.useBasePricing !== undefined && product.useBasePricing !== null) {
      let existingBaseU = product.baseUnit ? normalizeBaseUnit(product.baseUnit, qUnit) : qUnit;
      if (existingBaseU === 'Kg' && qUnit !== 'Kg') {
        existingBaseU = qUnit;
      }

      return {
        useBasePricing: !!product.useBasePricing,
        basePrice: product.basePrice ? product.basePrice.toString() : '',
        baseUnit: existingBaseU,
        baseOriginalPrice: product.baseOriginalPrice ? product.baseOriginalPrice.toString() : '',
        baseHorecaPrice: product.baseHorecaPrice ? product.baseHorecaPrice.toString() : ''
      };
    }

    let baseUnit = 'Kg';
    let basePrice = '';
    let baseOriginalPrice = '';
    let baseHorecaPrice = '';

    const qUnitLower = qUnit.toLowerCase();
    if (['kg', 'g', 'gm', 'gram', 'grams', 'kilogram', 'kilograms'].includes(qUnitLower)) {
      baseUnit = 'Kg';
      const mainInKg = ['kg', 'kilogram', 'kilograms'].includes(qUnitLower) ? qtyVal : qtyVal / 1000;
      basePrice = Math.round(priceNum / mainInKg).toString();
      if (product.originalPrice) {
        baseOriginalPrice = Math.round(parseFloat(product.originalPrice) / mainInKg).toString();
      }
      if (product.horecaPrice) {
        baseHorecaPrice = Math.round(parseFloat(product.horecaPrice) / mainInKg).toString();
      }
    } else if (['l', 'ml', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(qUnitLower)) {
      baseUnit = 'Ltr';
      const mainInL = ['l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(qUnitLower) ? qtyVal : qtyVal / 1000;
      basePrice = Math.round(priceNum / mainInL).toString();
      if (product.originalPrice) {
        baseOriginalPrice = Math.round(parseFloat(product.originalPrice) / mainInL).toString();
      }
      if (product.horecaPrice) {
        baseHorecaPrice = Math.round(parseFloat(product.horecaPrice) / mainInL).toString();
      }
    } else {
      baseUnit = normalizeBaseUnit(qUnit, 'Kg');
      basePrice = Math.round(priceNum / qtyVal).toString();
      if (product.originalPrice) {
        baseOriginalPrice = Math.round(parseFloat(product.originalPrice) / qtyVal).toString();
      }
      if (product.horecaPrice) {
        baseHorecaPrice = Math.round(parseFloat(product.horecaPrice) / qtyVal).toString();
      }
    }

    return {
      useBasePricing: true,
      basePrice,
      baseUnit,
      baseOriginalPrice,
      baseHorecaPrice
    };
  };

  const recalculatePrices = (
    baseP: string,
    baseU: string,
    baseOrig: string,
    baseHoreca: string,
    currentProd: any
  ) => {
    const mainPrice = calculatePriceFromBase(baseP, baseU, currentProd.quantityValue, currentProd.quantityUnit);
    const mainOriginalPrice = calculatePriceFromBase(baseOrig, baseU, currentProd.quantityValue, currentProd.quantityUnit);
    const mainHorecaPrice = calculatePriceFromBase(baseHoreca, baseU, currentProd.quantityValue, currentProd.quantityUnit);

    const updatedVariants = (currentProd.variants || []).map((v: any) => {
      return {
        ...v,
        price: calculatePriceFromBase(baseP, baseU, v.quantityValue, v.quantityUnit),
        originalPrice: calculatePriceFromBase(baseOrig, baseU, v.quantityValue, v.quantityUnit),
        horecaPrice: calculatePriceFromBase(baseHoreca, baseU, v.quantityValue, v.quantityUnit)
      };
    });

    return {
      ...currentProd,
      price: mainPrice || currentProd.price,
      originalPrice: mainOriginalPrice || currentProd.originalPrice,
      horecaPrice: mainHorecaPrice || currentProd.horecaPrice,
      variants: updatedVariants,
      basePrice: baseP,
      baseUnit: baseU,
      baseOriginalPrice: baseOrig,
      baseHorecaPrice: baseHoreca
    };
  };

  const handleBasePriceChange = (field: 'basePrice' | 'baseOriginalPrice' | 'baseHorecaPrice' | 'baseUnit', val: string) => {
    let nextBasePrice = newProduct.basePrice || '';
    let nextBaseOriginalPrice = newProduct.baseOriginalPrice || '';
    let nextBaseHorecaPrice = newProduct.baseHorecaPrice || '';
    let nextBaseUnit = newProduct.baseUnit || 'Kg';

    if (field === 'basePrice') nextBasePrice = val;
    else if (field === 'baseOriginalPrice') nextBaseOriginalPrice = val;
    else if (field === 'baseHorecaPrice') nextBaseHorecaPrice = val;
    else if (field === 'baseUnit') nextBaseUnit = val;

    const mainPrice = calculatePriceFromBase(nextBasePrice, nextBaseUnit, newProduct.quantityValue, newProduct.quantityUnit || 'Kg');
    const mainOriginalPrice = calculatePriceFromBase(nextBaseOriginalPrice, nextBaseUnit, newProduct.quantityValue, newProduct.quantityUnit || 'Kg');
    const mainHorecaPrice = calculatePriceFromBase(nextBaseHorecaPrice, nextBaseUnit, newProduct.quantityValue, newProduct.quantityUnit || 'Kg');

    const updatedVariants = (newProduct.variants || []).map((v) => {
      return {
        ...v,
        price: calculatePriceFromBase(nextBasePrice, nextBaseUnit, v.quantityValue, v.quantityUnit),
        originalPrice: calculatePriceFromBase(nextBaseOriginalPrice, nextBaseUnit, v.quantityValue, v.quantityUnit),
        horecaPrice: calculatePriceFromBase(nextBaseHorecaPrice, nextBaseUnit, v.quantityValue, v.quantityUnit)
      };
    });

    setNewProduct({
      ...newProduct,
      basePrice: nextBasePrice,
      baseOriginalPrice: nextBaseOriginalPrice,
      baseHorecaPrice: nextBaseHorecaPrice,
      baseUnit: nextBaseUnit,
      price: mainPrice || newProduct.price,
      originalPrice: mainOriginalPrice || newProduct.originalPrice,
      horecaPrice: mainHorecaPrice || newProduct.horecaPrice,
      variants: updatedVariants
    });
  };

  const updateProductWithBaseRecalc = (updatedFields: Partial<typeof newProduct>) => {
    const merged = { ...newProduct, ...updatedFields };

    if (updatedFields.quantityUnit || updatedFields.unit) {
      const { qUnit } = parseQuantityAndUnit(merged.unit);
      const primaryU = normalizeBaseUnit(updatedFields.quantityUnit || qUnit || merged.quantityUnit, 'Kg');
      const oldBaseU = normalizeBaseUnit(newProduct.baseUnit, 'Kg');
      const oldQUnit = normalizeBaseUnit(newProduct.quantityUnit, 'Kg');

      if (!newProduct.baseUnit || oldBaseU === 'Kg' || oldBaseU === oldQUnit) {
        merged.baseUnit = primaryU;
      }
    }

    if (merged.useBasePricing && merged.basePrice) {
      const activeBaseUnit = merged.baseUnit || normalizeBaseUnit(merged.quantityUnit, 'Kg');
      const mainPrice = calculatePriceFromBase(merged.basePrice, activeBaseUnit, merged.quantityValue, merged.quantityUnit || 'Kg');
      const mainOriginalPrice = calculatePriceFromBase(merged.baseOriginalPrice, activeBaseUnit, merged.quantityValue, merged.quantityUnit || 'Kg');
      const mainHorecaPrice = calculatePriceFromBase(merged.baseHorecaPrice, activeBaseUnit, merged.quantityValue, merged.quantityUnit || 'Kg');

      merged.price = mainPrice || merged.price;
      merged.originalPrice = mainOriginalPrice || merged.originalPrice;
      merged.horecaPrice = mainHorecaPrice || merged.horecaPrice;

      if (merged.variants && merged.variants.length > 0) {
        merged.variants = merged.variants.map(v => ({
          ...v,
          price: calculatePriceFromBase(merged.basePrice, activeBaseUnit, v.quantityValue, v.quantityUnit),
          originalPrice: calculatePriceFromBase(merged.baseOriginalPrice, activeBaseUnit, v.quantityValue, v.quantityUnit),
          horecaPrice: calculatePriceFromBase(merged.baseHorecaPrice, activeBaseUnit, v.quantityValue, v.quantityUnit)
        }));
      }
    }
    setNewProduct(merged);
  };

  const handleEditSetup = (product: Product) => {
    setEditingProductId(product.id);
    const isJuice = product.category === 'fnl juices' || product.category === 'fnl juice';
    
    const parsedMain = parseQuantityAndUnit(product.unit);
    const mainQuantityValue = product.quantityValue ? product.quantityValue.toString() : parsedMain.qVal;
    const mainQuantityUnit = product.quantityUnit || parsedMain.qUnit;
    const mainPackSize = product.packSize || parsedMain.packSize;
    
    const parsedHoreca = parseQuantityAndUnit(product.horecaUnit || '');

    const inferred = inferBasePricing(product, mainQuantityValue, mainQuantityUnit);

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
      packSize: mainPackSize,
      horecaQuantityValue: parsedHoreca.qVal,
      horecaQuantityUnit: parsedHoreca.qUnit,
      variants: ((product as any).variants || []).map((v: any) => {
        const parsedV = parseQuantityAndUnit(v.unit);
        const parsedVHoreca = parseQuantityAndUnit(v.horecaUnit || '');
        return {
          unit: v.unit,
          quantityValue: v.quantityValue ? v.quantityValue.toString() : parsedV.qVal,
          quantityUnit: v.quantityUnit || parsedV.qUnit,
          packSize: v.packSize || parsedV.packSize,
          price: v.price ? v.price.toString() : '',
          originalPrice: v.originalPrice ? v.originalPrice.toString() : '',
          horecaPrice: v.horecaPrice ? v.horecaPrice.toString() : '',
          horecaUnit: v.horecaUnit || '',
          horecaQuantityValue: parsedVHoreca.qVal,
          horecaQuantityUnit: parsedVHoreca.qUnit
        };
      }),
      useBasePricing: inferred.useBasePricing,
      basePrice: inferred.basePrice,
      baseUnit: inferred.baseUnit,
      baseOriginalPrice: inferred.baseOriginalPrice,
      baseHorecaPrice: inferred.baseHorecaPrice
    });
    setProductSection(isJuice ? 'juices' : 'veg-fruits');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setNewProduct({ name: '', price: '', originalPrice: '', horecaPrice: '', horecaUnit: '', category: productSection === 'juices' ? 'fnl juices' : (productCategories[0]?.toLowerCase() || 'indian fruits'), subCategory: 'cold-pressed', description: '', imageUrl: '', unit: '', quantityValue: '', quantityUnit: 'Kg', packSize: '', horecaQuantityValue: '', horecaQuantityUnit: 'Kg', variants: [], useBasePricing: false, basePrice: '', baseUnit: 'Kg', baseOriginalPrice: '', baseHorecaPrice: '' });
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

  const recalculateProductPriceInline = (product: Product, newBasePrice: number) => {
    let qtyValue = product.quantityValue !== undefined && product.quantityValue !== null ? String(product.quantityValue) : '';
    let qtyUnit = product.quantityUnit || 'Kg';
    if (!qtyValue) {
      const parsed = parseQuantityAndUnit(product.unit);
      qtyValue = parsed.qVal || '1';
      qtyUnit = parsed.qUnit || 'Kg';
    }

    const baseUnit = product.baseUnit || 'Kg';
    const baseOrig = product.baseOriginalPrice ? String(product.baseOriginalPrice) : '';
    const baseHoreca = product.baseHorecaPrice ? String(product.baseHorecaPrice) : '';

    const calculatedPrice = calculatePriceFromBase(newBasePrice, baseUnit, qtyValue, qtyUnit);
    const calculatedOriginal = baseOrig ? calculatePriceFromBase(baseOrig, baseUnit, qtyValue, qtyUnit) : '';
    const calculatedHoreca = baseHoreca ? calculatePriceFromBase(baseHoreca, baseUnit, qtyValue, qtyUnit) : '';

    const updatedVariants = (product.variants || []).map((v: any) => {
      let vQtyValue = v.quantityValue !== undefined && v.quantityValue !== null ? String(v.quantityValue) : '';
      let vQtyUnit = v.quantityUnit || 'Kg';
      if (!vQtyValue) {
        const parsedV = parseQuantityAndUnit(v.unit);
        vQtyValue = parsedV.qVal || '1';
        vQtyUnit = parsedV.qUnit || 'Kg';
      }
      return {
        ...v,
        price: calculatePriceFromBase(newBasePrice, baseUnit, vQtyValue, vQtyUnit),
        originalPrice: baseOrig ? calculatePriceFromBase(baseOrig, baseUnit, vQtyValue, vQtyUnit) : (v.originalPrice || ''),
        horecaPrice: baseHoreca ? calculatePriceFromBase(baseHoreca, baseUnit, vQtyValue, vQtyUnit) : (v.horecaPrice || '')
      };
    });

    return {
      ...product,
      price: calculatedPrice ? Number(calculatedPrice) : product.price,
      originalPrice: calculatedOriginal ? Number(calculatedOriginal) : product.originalPrice,
      horecaPrice: calculatedHoreca ? Number(calculatedHoreca) : product.horecaPrice,
      variants: updatedVariants,
      basePrice: newBasePrice
    };
  };

  const handleSavePrice = async (product: Product) => {
    const newPriceValue = editingPrices[product.id];
    if (!newPriceValue || isNaN(Number(newPriceValue))) {
      toast.error('Invalid price');
      return;
    }
    const parsedPrice = Number(newPriceValue);
    try {
      if (product.useBasePricing) {
        const updatedProduct = recalculateProductPriceInline(product, parsedPrice);
        const updateData: any = {
          price: updatedProduct.price,
          basePrice: parsedPrice,
          variants: updatedProduct.variants,
          updatedAt: Date.now()
        };
        if (updatedProduct.originalPrice) updateData.originalPrice = updatedProduct.originalPrice;
        if (updatedProduct.horecaPrice) updateData.horecaPrice = updatedProduct.horecaPrice;

        await updateDoc(doc(db, 'products', product.id), updateData);
        setProducts(products.map(p => p.id === product.id ? updatedProduct : p));
        toast.success(`Base price updated to ₹${parsedPrice}/${product.baseUnit || 'Kg'}. Recalculated main price to ₹${updatedProduct.price}`);
      } else {
        await updateDoc(doc(db, 'products', product.id), { price: parsedPrice, updatedAt: Date.now() });
        setProducts(products.map(p => p.id === product.id ? { ...p, price: parsedPrice } : p));
        toast.success(`Price updated to ₹${parsedPrice}`);
      }
      
      const newEditingPrices = { ...editingPrices };
      delete newEditingPrices[product.id];
      setEditingPrices(newEditingPrices);
    } catch (error) {
      toast.error('Failed to update price.');
    }
  };

  const handleExportCatalogForBulkEdit = () => {
    try {
      const data = products
        .filter(p => p.category !== 'fnl juices' && p.category !== 'fnl juice')
        .map(p => {
          const { qUnit } = parseQuantityAndUnit(p.unit);
          const primaryUnitNorm = normalizeBaseUnit(p.quantityUnit || qUnit, 'Kg');
          let effectiveBaseUnit = p.baseUnit ? normalizeBaseUnit(p.baseUnit, primaryUnitNorm) : primaryUnitNorm;
          if (effectiveBaseUnit === 'Kg' && primaryUnitNorm !== 'Kg') {
            effectiveBaseUnit = primaryUnitNorm;
          }

          return {
            'ID (Do not edit)': p.id,
            'Product Name': p.name || '',
            'Category': p.category || '',
            'Base Unit': effectiveBaseUnit,
            'Base Price': p.basePrice !== undefined && p.basePrice !== null && String(p.basePrice) !== '' ? p.basePrice : (p.price || ''),
            'Base MRP': p.baseOriginalPrice !== undefined && p.baseOriginalPrice !== null && String(p.baseOriginalPrice) !== '' ? p.baseOriginalPrice : (p.originalPrice || ''),
            'Base HoReCa Price': p.baseHorecaPrice !== undefined && p.baseHorecaPrice !== null && String(p.baseHorecaPrice) !== '' ? p.baseHorecaPrice : (p.horecaPrice || ''),
            'Stock': p.stock !== undefined && p.stock !== null ? p.stock : '',
            'In Stock': p.inStock ? 'TRUE' : 'FALSE'
          };
        });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Catalog Bulk Edit');
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `FreshNLocal_Catalog_Bulk_Edit_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Current product catalog downloaded for bulk editing (Base Unit pricing).");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to export catalog for bulk editing.");
    }
  };

  const commitBulkUpdates = async () => {
    try {
      setLoading(true);
      const chunks = [];
      for (let i = 0; i < bulkChangedProducts.length; i += 100) {
        chunks.push(bulkChangedProducts.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const docRef = doc(db, 'products', item.id);
          const nextData: any = {
            name: item.updated.name,
            category: item.updated.category,
            unit: item.updated.unit,
            price: Number(item.updated.price) || 0,
            stock: Number(item.updated.stock) || 0,
            inStock: item.updated.inStock,
            updatedAt: Date.now()
          };

          if (item.updated.description !== undefined) nextData.description = item.updated.description;
          if (item.updated.imageUrl !== undefined) nextData.imageUrl = item.updated.imageUrl;
          
          if (item.updated.originalPrice !== undefined && item.updated.originalPrice !== null && item.updated.originalPrice !== '') {
            nextData.originalPrice = Number(item.updated.originalPrice);
          } else {
            nextData.originalPrice = null;
          }
          
          if (item.updated.horecaPrice !== undefined && item.updated.horecaPrice !== null && item.updated.horecaPrice !== '') {
            nextData.horecaPrice = Number(item.updated.horecaPrice);
          } else {
            nextData.horecaPrice = null;
          }
          
          if (item.updated.horecaUnit !== undefined) nextData.horecaUnit = item.updated.horecaUnit;
          if (item.updated.quantityValue !== undefined && item.updated.quantityValue !== null && item.updated.quantityValue !== '') {
            nextData.quantityValue = Number(item.updated.quantityValue);
          } else {
            nextData.quantityValue = null;
          }
          if (item.updated.quantityUnit !== undefined) nextData.quantityUnit = item.updated.quantityUnit;
          if (item.updated.packSize !== undefined) nextData.packSize = item.updated.packSize;
          if (item.updated.useBasePricing !== undefined) nextData.useBasePricing = item.updated.useBasePricing;
          
          if (item.updated.basePrice !== undefined && item.updated.basePrice !== null && item.updated.basePrice !== '') {
            nextData.basePrice = Number(item.updated.basePrice);
          } else {
            nextData.basePrice = null;
          }
          if (item.updated.baseUnit !== undefined) nextData.baseUnit = item.updated.baseUnit;
          if (item.updated.baseOriginalPrice !== undefined && item.updated.baseOriginalPrice !== null && item.updated.baseOriginalPrice !== '') {
            nextData.baseOriginalPrice = Number(item.updated.baseOriginalPrice);
          } else {
            nextData.baseOriginalPrice = null;
          }
          if (item.updated.baseHorecaPrice !== undefined && item.updated.baseHorecaPrice !== null && item.updated.baseHorecaPrice !== '') {
            nextData.baseHorecaPrice = Number(item.updated.baseHorecaPrice);
          } else {
            nextData.baseHorecaPrice = null;
          }
          if (item.updated.variants !== undefined) nextData.variants = item.updated.variants;

          if (item.isNew) {
            nextData.createdAt = Date.now();
            batch.set(docRef, nextData);
          } else {
            batch.update(docRef, nextData);
          }
        });
        await batch.commit();
      }

      const m = await import('../store/useProducts');
      await m.useProducts.getState().fetchProducts(true);
      setProducts(m.useProducts.getState().products);

      const addedCount = bulkChangedProducts.filter(p => p.isNew).length;
      const updatedCount = bulkChangedProducts.filter(p => !p.isNew).length;
      toast.success(`Bulk updates applied successfully! Added ${addedCount} and updated ${updatedCount} items.`);
      setBulkUpdateModalOpen(false);
      setBulkChangedProducts([]);
    } catch (err: any) {
      console.error("Bulk commit error:", err);
      toast.error(`Bulk update failed: ${err.message || 'Server error'}`);
    } finally {
      setLoading(false);
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

      if (rawJson.length === 0) {
        toast.error('No suitable data identified inside the uploaded file.');
        setLoading(false);
        if (e.target) e.target.value = '';
        return;
      }

      const parseBoolean = (val: any): boolean => {
        if (val === undefined || val === null) return false;
        const s = String(val).trim().toLowerCase();
        return s === 'true' || s === 'yes' || s === '1' || s === 'y' || s === 'active';
      };

      const cleanAndParseRow = (rawRow: any) => {
        const row: Record<string, any> = {};
        for (const key in rawRow) {
          const cleanKey = key.replace(/^\ufeff/, '').replace(/^["']|["']$/g, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
          row[cleanKey] = rawRow[key];
        }

        const id = String(row.id || row.iddonotedit || row.productid || '').trim();
        const name = String(row.productname || row.name || row.title || '').trim();
        const category = String(row.category || 'indian fruits').toLowerCase().trim();
        
        const rowUnitStr = row.baseunit || row.quantityunit;
        const { qUnit: extractedUnit } = parseQuantityAndUnit(row.unit);
        const baseUnit = normalizeBaseUnit(rowUnitStr || extractedUnit, 'Kg');
        
        const parseNum = (val: any) => {
          if (val === undefined || val === null || val === '') return undefined;
          const num = Number(val);
          return isNaN(num) ? undefined : num;
        };

        const basePrice = parseNum(row.baseprice) ?? parseNum(row.basepriceperbaseunit) ?? parseNum(row.rateprice) ?? parseNum(row.price) ?? parseNum(row.rate);
        const baseOriginalPrice = parseNum(row.basemrp) ?? parseNum(row.mrp) ?? parseNum(row.baseoriginalprice) ?? parseNum(row.originalprice);
        const baseHorecaPrice = parseNum(row.basehorecaprice) ?? parseNum(row.horecaprice) ?? parseNum(row.basehorecarate);
        
        const stock = parseNum(row.stock) ?? 100;
        const inStock = row.instock !== undefined ? parseBoolean(row.instock) : true;

        return {
          id,
          name,
          category,
          baseUnit,
          basePrice,
          baseOriginalPrice,
          baseHorecaPrice,
          stock,
          inStock
        };
      };

      const changesList: any[] = [];

      for (const rawRow of rawJson) {
        const parsed = cleanAndParseRow(rawRow);
        if (!parsed.name) continue;

        // Find match by ID or Name
        const match = products.find(p => {
          if (parsed.id && p.id === parsed.id) return true;
          if (!parsed.id && p.name.toLowerCase().trim() === parsed.name.toLowerCase().trim()) return true;
          return false;
        });

        // Skip FNL Juice House products from bulk import
        if (parsed.category === 'fnl juices' || parsed.category === 'fnl juice' || (match && (match.category === 'fnl juices' || match.category === 'fnl juice'))) {
          continue;
        }

        const updated: any = match ? { ...match } : {
          id: doc(collection(db, 'products')).id,
          name: parsed.name,
          category: parsed.category,
          description: '',
          imageUrl: '',
          variants: [],
          quantityValue: 1,
          quantityUnit: parsed.baseUnit || 'Kg',
          unit: `1 ${parsed.baseUnit || 'Kg'}`
        };

        updated.useBasePricing = true;
        if (parsed.name) updated.name = parsed.name;
        if (parsed.category) updated.category = parsed.category;
        const matchUnit = match ? (match.baseUnit || match.quantityUnit || parseQuantityAndUnit(match.unit).qUnit) : undefined;
        updated.baseUnit = normalizeBaseUnit(parsed.baseUnit || matchUnit, 'Kg');
        if (parsed.basePrice !== undefined) updated.basePrice = parsed.basePrice;
        if (parsed.baseOriginalPrice !== undefined) updated.baseOriginalPrice = parsed.baseOriginalPrice;
        if (parsed.baseHorecaPrice !== undefined) updated.baseHorecaPrice = parsed.baseHorecaPrice;
        if (parsed.stock !== undefined) updated.stock = parsed.stock;
        if (parsed.inStock !== undefined) updated.inStock = parsed.inStock;

        // Calculate main selling price from base unit
        const qVal = updated.quantityValue !== undefined && updated.quantityValue !== null ? updated.quantityValue : 1;
        const qUnit = updated.quantityUnit || updated.baseUnit || 'Kg';

        const calcP = calculatePriceFromBase(updated.basePrice, updated.baseUnit, qVal, qUnit);
        if (calcP) {
          updated.price = Number(calcP);
        } else if (updated.basePrice !== undefined) {
          updated.price = Number(updated.basePrice);
        }

        if (updated.baseOriginalPrice !== undefined) {
          const calcMRP = calculatePriceFromBase(updated.baseOriginalPrice, updated.baseUnit, qVal, qUnit);
          if (calcMRP) updated.originalPrice = Number(calcMRP);
        }

        if (updated.baseHorecaPrice !== undefined) {
          const calcHoreca = calculatePriceFromBase(updated.baseHorecaPrice, updated.baseUnit, qVal, qUnit);
          if (calcHoreca) updated.horecaPrice = Number(calcHoreca);
        }

        // Recalculate variants based on updated base prices
        if (match && match.variants && match.variants.length > 0) {
          updated.variants = match.variants.map((v: any) => {
            let vQtyValue = v.quantityValue !== undefined && v.quantityValue !== null ? String(v.quantityValue) : '';
            let vQtyUnit = v.quantityUnit || 'Kg';
            if (!vQtyValue) {
              const parsedV = parseQuantityAndUnit(v.unit);
              vQtyValue = parsedV.qVal || '1';
              vQtyUnit = parsedV.qUnit || 'Kg';
            }
            
            return {
              ...v,
              price: Number(calculatePriceFromBase(updated.basePrice, updated.baseUnit, vQtyValue, vQtyUnit) || v.price),
              originalPrice: updated.baseOriginalPrice ? Number(calculatePriceFromBase(updated.baseOriginalPrice, updated.baseUnit, vQtyValue, vQtyUnit) || v.originalPrice) : v.originalPrice,
              horecaPrice: updated.baseHorecaPrice ? Number(calculatePriceFromBase(updated.baseHorecaPrice, updated.baseUnit, vQtyValue, vQtyUnit) || v.horecaPrice) : v.horecaPrice
            };
          });
        }

        if (match) {
          // Check for differences
          const diffs: string[] = [];
          if (updated.name !== match.name) diffs.push(`Name: "${match.name}" ➜ "${updated.name}"`);
          if (updated.category !== match.category) diffs.push(`Category: "${match.category}" ➜ "${updated.category}"`);
          if (updated.baseUnit !== (match.baseUnit || 'Kg')) diffs.push(`Base Unit: "${match.baseUnit || 'Kg'}" ➜ "${updated.baseUnit}"`);
          if (updated.basePrice !== match.basePrice) diffs.push(`Base Price: ₹${match.basePrice || 'None'} ➜ ₹${updated.basePrice || 'None'}`);
          if (updated.baseOriginalPrice !== match.baseOriginalPrice) diffs.push(`Base MRP: ₹${match.baseOriginalPrice || 'None'} ➜ ₹${updated.baseOriginalPrice || 'None'}`);
          if (updated.baseHorecaPrice !== match.baseHorecaPrice) diffs.push(`Base HoReCa Price: ₹${match.baseHorecaPrice || 'None'} ➜ ₹${updated.baseHorecaPrice || 'None'}`);
          if (Number(updated.price) !== Number(match.price)) diffs.push(`Calculated Price: ₹${match.price} ➜ ₹${updated.price}`);
          if (Number(updated.stock) !== Number(match.stock)) diffs.push(`Stock: ${match.stock} ➜ ${updated.stock}`);
          if (updated.inStock !== match.inStock) diffs.push(`In Stock: ${match.inStock ? 'Yes' : 'No'} ➜ ${updated.inStock ? 'Yes' : 'No'}`);

          if (diffs.length > 0) {
            changesList.push({
              id: match.id,
              name: match.name,
              original: match,
              updated,
              changes: diffs,
              isNew: false
            });
          }
        } else {
          // Brand new product
          changesList.push({
            id: updated.id,
            name: updated.name,
            original: null,
            updated,
            changes: ['New Product Added with Base Unit pricing'],
            isNew: true
          });
        }
      }

      if (changesList.length === 0) {
        toast.success("Spreadsheet uploaded, but no changed values were detected compared to your live catalog!");
        setLoading(false);
        if (e.target) e.target.value = '';
        return;
      }

      setBulkChangedProducts(changesList);
      setBulkUpdateModalOpen(true);
    } catch (error: any) {
      console.error(error);
      toast.error(`Import failed: ${error.message || 'Server error'}`);
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const downloadCsvTemplate = () => {
    const headers = ['Product Name', 'Category', 'Base Unit', 'Base Price', 'Base MRP', 'Base HoReCa Price', 'Stock', 'In Stock'];
    const sampleData = [
      ['Gourmet Red Apples', 'Exotic Fruits', 'Kg', '180', '250', '150', '100', 'TRUE'],
      ['Fresh Broccoli Crown', 'Exotic Vegetables', 'Kg', '95', '120', '80', '80', 'TRUE']
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
          'Product Name': 'Premium Devgad Alphonso Mangoes',
          'Category': 'indian fruits',
          'Base Unit': 'Kg',
          'Base Price': 250,
          'Base MRP': 350,
          'Base HoReCa Price': 220,
          'Stock': 150,
          'In Stock': 'TRUE'
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
      <SEO 
        title="Admin Control Center" 
        description="Access secure administrative logistics tools, product inventories, pricing controls, order logs, and branding configurations."
      />
      
      {/* Admin Sidebar Navigation */}
      <div className="w-full md:w-64 lg:w-72 border-b md:border-b-0 md:border-r border-border bg-secondary shrink-0 flex flex-col p-4 sm:p-6 sticky top-0 md:top-20 z-10 md:h-[calc(100vh-80px)] overflow-y-auto">
        <div className="space-y-1.5 bg-transparent mb-6 sm:mb-8 mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="glass-pill text-[8px] sm:text-[10px]">Command Station</span>
            {user?.role === 'horeca_admin' && (
              <span className="bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 font-black text-[8px] sm:text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider">
                🏢 HoReCa Admin
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-sans font-black uppercase text-foreground tracking-tight mt-2.5">
            {user?.role === 'horeca_admin' ? 'HoReCa Logistics' : 'Logistics'}
          </h1>
          {user?.role === 'horeca_admin' && (
            <p className="text-[9px] text-muted-foreground font-semibold">
              Signed in as <span className="font-mono text-primary font-bold">{user.email}</span>
            </p>
          )}
        </div>
        
        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 no-scrollbar">
          <button 
            onClick={() => navigate('/admin/consignments')}
            className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'orders' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
          >
            <ShoppingBag className="w-4 h-4" /> Consignments
          </button>
          {user?.role !== 'horeca_admin' && (
            <button 
              onClick={() => navigate('/admin/inventory')}
              className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'products' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
            >
              <Package className="w-4 h-4" /> Order Inventory
            </button>
          )}
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
          {user?.role !== 'horeca_admin' && (
            <button 
              onClick={() => navigate('/admin/customers')}
              className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'customers' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
            >
              <Users className="w-4 h-4" /> Customers
            </button>
          )}
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
          {user?.role !== 'horeca_admin' && (
            <button 
              onClick={() => navigate('/admin/branding')}
              className={`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'branding' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}`}
            >
              <Globe className="w-4 h-4" /> Branding Settings
            </button>
          )}
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
            <div className="flex flex-col gap-4 bg-secondary p-4 sm:p-5 rounded-2xl border border-border/70 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
              <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                <div className="flex flex-col gap-1.5 w-full md:flex-1">
                  <label className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Search className="w-3 h-3" /> Search Order</label>
                  <input
                    type="text"
                    placeholder="e.g., FNL-123456"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    className="border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full uppercase font-black tracking-wider text-foreground placeholder:text-muted-foreground/50 shadow-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExportStatus(filterStatus === 'all' ? 'pending' : filterStatus);
                    setExportStartDate(dateRange.start);
                    setExportEndDate(dateRange.end);
                    setExportParty('all');
                    setIsExportModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 transition-all text-[10px] uppercase font-black tracking-widest cursor-pointer w-full md:w-auto shrink-0 shadow-xs h-[40px]"
                >
                  <FileText className="w-4 h-4" /> Export B2B/HoReCa Orders
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-end justify-between">
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

                  <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                    <label className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5"><Users className="w-3 h-3" /> Customer Type</label>
                    <select 
                      value={user?.role === 'horeca_admin' ? 'b2b' : filterCustomerType}
                      onChange={(e) => setFilterCustomerType(e.target.value)}
                      disabled={user?.role === 'horeca_admin'}
                      className="appearance-none border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full sm:w-[160px] uppercase font-black tracking-wider text-foreground cursor-pointer shadow-sm pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="all">ALL ORDERS</option>
                      <option value="b2b">B2B (HORECA)</option>
                      <option value="b2c">B2C (RETAIL)</option>
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
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 mt-0.5 rounded text-[8px] font-black uppercase tracking-wider ${order.customerType === 'horeca' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-blue-500/10 text-blue-600'}`}>
                            {order.customerType === 'horeca' ? '🏢 HoReCa B2B' : (order.customerType || 'retail')}
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

                    {/* Base Pricing Toggle & Inputs */}
                    <div className="p-3.5 bg-background border border-border rounded-2xl space-y-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Calculator className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-foreground">Base Unit Price Engine</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={!!newProduct.useBasePricing}
                            onChange={e => {
                              const active = e.target.checked;
                              if (active) {
                                // Infer base pricing from current prices
                                const inferred = inferBasePricing(
                                  {
                                    price: newProduct.price,
                                    originalPrice: newProduct.originalPrice,
                                    horecaPrice: newProduct.horecaPrice
                                  },
                                  newProduct.quantityValue || '1',
                                  newProduct.quantityUnit || 'Kg'
                                );
                                setNewProduct({
                                  ...newProduct,
                                  useBasePricing: true,
                                  basePrice: inferred.basePrice,
                                  baseUnit: inferred.baseUnit,
                                  baseOriginalPrice: inferred.baseOriginalPrice,
                                  baseHorecaPrice: inferred.baseHorecaPrice
                                });
                              } else {
                                setNewProduct({
                                  ...newProduct,
                                  useBasePricing: false
                                });
                              }
                            }}
                          />
                          <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>

                      {newProduct.useBasePricing && (
                        <div className="space-y-3 pt-1 border-t border-border/60">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="block text-[8px] font-black uppercase tracking-wider text-muted-foreground">Base Price (₹ / unit)</label>
                              <input 
                                required
                                type="number" 
                                placeholder="e.g. 240" 
                                className="w-full border border-border rounded-xl px-2.5 py-2 bg-white outline-none focus:border-primary text-foreground text-[10px] sm:text-xs font-mono" 
                                value={newProduct.basePrice || ''} 
                                onChange={e => handleBasePriceChange('basePrice', e.target.value)} 
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-[8px] font-black uppercase tracking-wider text-muted-foreground">Base Unit</label>
                              <select
                                className="w-full appearance-none border border-border rounded-xl px-2.5 py-2 pr-8 bg-white outline-none focus:border-primary text-foreground text-[10px] sm:text-xs font-bold bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_8px_center] bg-no-repeat"
                                value={normalizeBaseUnit(newProduct.baseUnit, 'Kg')}
                                onChange={e => handleBasePriceChange('baseUnit', e.target.value)}
                              >
                                {['Kg', 'Ltr', 'Pc', 'Pack', 'Box', 'Bottle', 'Can', 'Dozen', 'Bunch', 'Tray', 'Pouch', 'Jar', 'Carton', 'Crate'].map(u => (
                                  <option key={u} value={u}>Per {u}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="block text-[8px] font-black uppercase tracking-wider text-muted-foreground">Base MRP (Optional ₹)</label>
                              <input 
                                type="number" 
                                placeholder="e.g. 300" 
                                className="w-full border border-border rounded-xl px-2.5 py-2 bg-white outline-none focus:border-primary text-foreground text-[10px] sm:text-xs font-mono" 
                                value={newProduct.baseOriginalPrice || ''} 
                                onChange={e => handleBasePriceChange('baseOriginalPrice', e.target.value)} 
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-[8px] font-black uppercase tracking-wider text-muted-foreground">Base HoReCa (Optional ₹)</label>
                              <input 
                                type="number" 
                                placeholder="e.g. 200" 
                                className="w-full border border-border rounded-xl px-2.5 py-2 bg-white outline-none focus:border-primary text-foreground text-[10px] sm:text-xs font-mono" 
                                value={newProduct.baseHorecaPrice || ''} 
                                onChange={e => handleBasePriceChange('baseHorecaPrice', e.target.value)} 
                              />
                            </div>
                          </div>

                          {newProduct.basePrice && newProduct.quantityValue && (
                            <div className="p-2 bg-neutral-50/50 rounded-xl text-[9px] text-[#4a4a4a] leading-tight font-semibold flex flex-col gap-0.5 border border-border/40">
                              <span className="text-emerald-700 font-black uppercase tracking-wider text-[8px]">Auto-Calculation Active:</span>
                              <span>• Main Item ({buildUnitString(newProduct.quantityValue, newProduct.quantityUnit || 'Kg', newProduct.packSize)}): ₹{newProduct.price}</span>
                              {newProduct.variants && newProduct.variants.length > 0 && (
                                <span className="text-emerald-800 font-bold">• Recalculating {newProduct.variants.length} custom variant sizes instantly.</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                          Rate Price (₹) {newProduct.useBasePricing && <span className="text-emerald-600 font-bold">(Calculated)</span>}
                        </label>
                        <input 
                          required 
                          type="number" 
                          placeholder="180" 
                          readOnly={!!newProduct.useBasePricing}
                          className={`w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono ${newProduct.useBasePricing ? 'bg-neutral-100 cursor-not-allowed opacity-85 font-semibold' : ''}`} 
                          value={newProduct.price} 
                          onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
                        />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                          MRP (Optional ₹) {newProduct.useBasePricing && <span className="text-emerald-600 font-bold">(Calculated)</span>}
                        </label>
                        <input 
                          type="number" 
                          placeholder="250" 
                          readOnly={!!newProduct.useBasePricing}
                          className={`w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono ${newProduct.useBasePricing ? 'bg-neutral-100 cursor-not-allowed opacity-85 font-semibold' : ''}`} 
                          value={newProduct.originalPrice} 
                          onChange={e => setNewProduct({...newProduct, originalPrice: e.target.value})} 
                        />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                          HoReCa Price (Optional ₹) {newProduct.useBasePricing && <span className="text-emerald-600 font-bold">(Calculated)</span>}
                        </label>
                        <input 
                          type="number" 
                          placeholder="150" 
                          readOnly={!!newProduct.useBasePricing}
                          className={`w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono ${newProduct.useBasePricing ? 'bg-neutral-100 cursor-not-allowed opacity-85 font-semibold' : ''}`} 
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
                            placeholder="Qty (e.g. 1)" 
                            className="flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                            value={newProduct.quantityValue || ''} 
                            onChange={e => {
                              const val = e.target.value;
                              const uStr = buildUnitString(val, newProduct.quantityUnit || 'Kg', newProduct.packSize);
                              updateProductWithBaseRecalc({ quantityValue: val, unit: uStr });
                            }} 
                          />
                          <select
                            className="w-24 sm:w-28 flex-shrink-0 appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 pr-8 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-bold bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] sm:bg-[length:12px_12px] bg-[right_8px_center] sm:bg-[right_10px_center] bg-no-repeat"
                            value={newProduct.quantityUnit || 'Kg'}
                            onChange={e => {
                              const qUnit = e.target.value;
                              const uStr = buildUnitString(newProduct.quantityValue || '', qUnit, newProduct.packSize);
                              updateProductWithBaseRecalc({ quantityUnit: qUnit, unit: uStr });
                            }}
                          >
                            {['Kg', 'g', 'L', 'ml', 'Pc', 'Pack', 'Box', 'Bottle', 'Can', 'Dozen', 'Bunch', 'Tray'].map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {(['Pack', 'Box', 'Tray', 'Dozen', 'Pc', 'Bottle', 'Can'].includes(newProduct.quantityUnit || '') || Boolean(newProduct.packSize)) && (
                        <div className="space-y-1.5 sm:space-y-2">
                           <div className="flex items-center justify-between">
                            <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                              Pack Weight / Net Qty
                            </label>
                            {newProduct.packSize && (
                              <span className="text-[8px] text-muted-foreground font-semibold">1 {newProduct.quantityUnit || 'Pack'} = {newProduct.packSize}</span>
                            )}
                          </div>
                          <input 
                            type="text"
                            placeholder="e.g. 125g, 250g, 500g" 
                            className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                            value={newProduct.packSize || ''} 
                            onChange={e => {
                              const pSize = e.target.value;
                              const uStr = buildUnitString(newProduct.quantityValue || '', newProduct.quantityUnit || 'Pack', pSize);
                              updateProductWithBaseRecalc({ packSize: pSize, unit: uStr });
                            }} 
                          />
                        </div>
                      )}
                      
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
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                    Rate Price (₹) {newProduct.useBasePricing && <span className="text-emerald-600 font-bold">(Calculated)</span>}
                                  </label>
                                  <input 
                                    placeholder="180" 
                                    type="number"
                                    value={variant.price}
                                    readOnly={!!newProduct.useBasePricing}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].price = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className={`w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono ${newProduct.useBasePricing ? 'bg-neutral-100 cursor-not-allowed opacity-85 font-semibold' : ''}`}
                                  />
                                </div>
                                
                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                    MRP (Optional ₹) {newProduct.useBasePricing && <span className="text-emerald-600 font-bold">(Calculated)</span>}
                                  </label>
                                  <input 
                                    placeholder="250" 
                                    type="number"
                                    value={variant.originalPrice}
                                    readOnly={!!newProduct.useBasePricing}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].originalPrice = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className={`w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono ${newProduct.useBasePricing ? 'bg-neutral-100 cursor-not-allowed opacity-85 font-semibold' : ''}`}
                                  />
                                </div>

                                <div className="space-y-1.5 sm:space-y-2">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                    HoReCa Price (Optional ₹) {newProduct.useBasePricing && <span className="text-emerald-600 font-bold">(Calculated)</span>}
                                  </label>
                                  <input 
                                    placeholder="150" 
                                    type="number"
                                    value={variant.horecaPrice}
                                    readOnly={!!newProduct.useBasePricing}
                                    onChange={(e) => {
                                      const newVariants = [...newProduct.variants];
                                      newVariants[vIdx].horecaPrice = e.target.value;
                                      setNewProduct({...newProduct, variants: newVariants});
                                    }}
                                    className={`w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono ${newProduct.useBasePricing ? 'bg-neutral-100 cursor-not-allowed opacity-85 font-semibold' : ''}`}
                                  />
                                </div>

                                <div className="space-y-1.5 sm:space-y-2 col-span-2 sm:col-span-1">
                                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Quantity & Unit</label>
                                  <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                                    <input 
                                      required
                                      type="number"
                                      step="any"
                                      placeholder="Qty" 
                                      value={variant.quantityValue || ''}
                                      onChange={(e) => {
                                        const newVariants = [...newProduct.variants];
                                        const val = e.target.value;
                                        newVariants[vIdx].quantityValue = val;
                                        newVariants[vIdx].unit = buildUnitString(val, newVariants[vIdx].quantityUnit || 'Kg', newVariants[vIdx].packSize);
                                        updateProductWithBaseRecalc({ variants: newVariants });
                                      }}
                                      className="flex-1 min-w-[60px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs"
                                    />
                                    <select
                                      className="w-20 sm:w-24 flex-shrink-0 appearance-none border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 pr-8 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-bold bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] sm:bg-[length:12px_12px] bg-[right_8px_center] sm:bg-[right_10px_center] bg-no-repeat"
                                      value={variant.quantityUnit || 'Kg'}
                                      onChange={(e) => {
                                        const newVariants = [...newProduct.variants];
                                        const qUnit = e.target.value;
                                        newVariants[vIdx].quantityUnit = qUnit;
                                        newVariants[vIdx].unit = buildUnitString(newVariants[vIdx].quantityValue || '', qUnit, newVariants[vIdx].packSize);
                                        updateProductWithBaseRecalc({ variants: newVariants });
                                      }}
                                    >
                                      {['Kg', 'g', 'L', 'ml', 'Pc', 'Pack', 'Box', 'Bottle', 'Can', 'Dozen', 'Bunch', 'Tray'].map(u => (
                                        <option key={u} value={u}>{u}</option>
                                      ))}
                                    </select>
                                    {(variant.quantityUnit === 'Pack' || variant.quantityUnit === 'Box' || variant.quantityUnit === 'Tray' || variant.quantityUnit === 'Dozen' || variant.quantityUnit === 'Pc') && (
                                      <input 
                                        type="text"
                                        placeholder="Pack weight (e.g. 125g, 250g)" 
                                        value={variant.packSize || ''}
                                        onChange={(e) => {
                                          const newVariants = [...newProduct.variants];
                                          const pSize = e.target.value;
                                          newVariants[vIdx].packSize = pSize;
                                          newVariants[vIdx].unit = buildUnitString(newVariants[vIdx].quantityValue || '', newVariants[vIdx].quantityUnit || 'Pack', pSize);
                                          updateProductWithBaseRecalc({ variants: newVariants });
                                        }}
                                        className="w-28 sm:w-36 flex-shrink-0 border border-primary/40 bg-primary/5 rounded-xl sm:rounded-2xl px-2.5 sm:px-3 py-2.5 sm:py-3.5 outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-semibold"
                                      />
                                    )}
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
                    <div className="flex items-center justify-between">
                      <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Order Description</label>
                      <button
                        type="button"
                        onClick={generateSingleAIDescription}
                        disabled={isGeneratingSingleDesc}
                        className="text-[9px] font-black uppercase tracking-wider text-amber-500 hover:text-amber-600 flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className={`w-3 h-3 ${isGeneratingSingleDesc ? 'animate-ping' : 'animate-pulse'}`} />
                        {isGeneratingSingleDesc ? 'Generating...' : 'Auto-Generate'}
                      </button>
                    </div>
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

                <div className="p-4 sm:p-5 bg-white border border-dashed border-border rounded-xl sm:rounded-2xl space-y-2.5">
                  <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" /> Bulk Edit Existing Catalog
                  </h4>
                  <p className="text-[8px] sm:text-[9px] text-muted-foreground leading-normal font-semibold">
                    Download your current catalog with system IDs, update rates/stocks in Excel, and upload below to auto-detect changes.
                  </p>
                  <button 
                    type="button" 
                    onClick={handleExportCatalogForBulkEdit} 
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[8px] sm:text-[9px] font-black uppercase tracking-widest rounded-lg sm:rounded-xl transition-colors cursor-pointer shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 text-white" /> Download Live Catalog (.xlsx)
                  </button>
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

              {/* AI Description & SEO Generator Section */}
              <div className="pt-6 sm:pt-8 border-t border-border space-y-4 sm:space-y-6">
                <div className="space-y-1 sm:space-y-2">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 animate-pulse" /> AI Description & SEO Generator
                  </h3>
                  <p className="text-muted-foreground text-[9px] sm:text-xxs font-semibold leading-relaxed">
                    Generate unique, high-fidelity SEO descriptions and meta tags for your fresh produce categories using Gemini. Complies with local Surat content guidelines (60–90 words, Indian household culinary uses, vitamin/mineral references, select/store tip, no medical claims).
                  </p>
                </div>

                <div className="p-4 sm:p-5 bg-white border border-border rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4 shadow-sm">
                  {aiGenerationStatus.generating ? (
                    <div className="space-y-3.5">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        <span>Generating descriptions...</span>
                        <span className="text-amber-500 font-mono">{aiGenerationStatus.processed} / {aiGenerationStatus.total}</span>
                      </div>
                      <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-amber-500 h-full transition-all duration-300"
                          style={{ width: `${aiGenerationStatus.total ? (aiGenerationStatus.processed / aiGenerationStatus.total) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[9px] font-black tracking-widest uppercase text-muted-foreground">
                        <div>Succeeded: <span className="text-emerald-500">{aiGenerationStatus.generated}</span></div>
                        <div>Errors: <span className="text-red-500">{aiGenerationStatus.errors}</span></div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={runAIDescriptionGeneration}
                      className="w-full py-3 sm:py-4 bg-[#d97706] hover:bg-amber-700 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-white animate-bounce" /> Generate AI Descriptions
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
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleExportCSV}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-neutral-900 hover:bg-black text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
                    title="Download All Products"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button
                    onClick={handleExportHorecaCSV}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
                    title="Download Horeca Pricing"
                  >
                    <Download className="w-3.5 h-3.5" /> HORECA
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
                              <div className="flex flex-col gap-1">
                                {product.useBasePricing && (
                                  <span className="text-[7.5px] text-emerald-600 font-black uppercase tracking-wider">Base Price / {normalizeBaseUnit(product.baseUnit, 'Kg')}</span>
                                )}
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
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                {product.useBasePricing ? (
                                  <div className="flex flex-col leading-tight">
                                    <span className="text-foreground">₹{product.price}</span>
                                    <span className="text-[8.5px] text-emerald-600 font-black uppercase tracking-wide">₹{product.basePrice}/{normalizeBaseUnit(product.baseUnit, 'Kg')}</span>
                                  </div>
                                ) : (
                                  <span>₹{product.price}</span>
                                )}
                                <button 
                                  onClick={() => handlePriceChange(product.id, String(product.useBasePricing ? (product.basePrice || '') : product.price))} 
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary p-1 bg-white border border-border rounded cursor-pointer"
                                >
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
                            <div className="text-xs sm:text-sm font-bold text-foreground">{customer.email || customer.displayName || 'Unknown'}</div>
                            {customer.displayName && customer.displayName !== customer.email && (
                              <div className="text-[10px] sm:text-xs text-muted-foreground">{customer.displayName}</div>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="text-[10px] sm:text-xs text-muted-foreground">{customer.phone || 'No phone'}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${customer.role === 'admin' ? 'bg-red-500/10 text-red-600 border border-red-500/20' : customer.role === 'horeca' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'}`}>
                              {customer.role === 'horeca' ? '🏢 HoReCa B2B' : (customer.role || 'customer')}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {customer.role !== 'admin' && (
                                <button 
                                  onClick={() => handleSetRole(customer, 'admin')}
                                  className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                                >
                                  Make Admin
                                </button>
                              )}
                              <button 
                                onClick={() => handleSetRole(customer, customer.role === 'horeca' ? 'customer' : 'horeca')}
                                className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-colors ${customer.role === 'horeca' ? 'bg-muted text-foreground hover:bg-muted/80' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                              >
                                {customer.role === 'horeca' ? 'Revoke HoReCa' : 'Make HoReCa'}
                              </button>
                            </div>
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

              {/* Channel Order Selector bar */}
              {(() => {
                const displayedCategories = categoryOrderMode === 'retail'
                  ? productCategories
                  : (horecaCategoryOrder && horecaCategoryOrder.length > 0
                      ? (() => {
                          const list = [...horecaCategoryOrder];
                          productCategories.forEach(cat => {
                            if (!list.some(c => c.toLowerCase().trim() === cat.toLowerCase().trim())) {
                              list.push(cat);
                            }
                          });
                          return list;
                        })()
                      : productCategories);

                return (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-secondary/60 p-4 rounded-2xl border border-border/80">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-xs uppercase tracking-wider text-foreground">Category Arrangement Mode</h3>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                            categoryOrderMode === 'retail' 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'
                          }`}>
                            Active: {categoryOrderMode === 'retail' ? 'Retail View' : 'HoReCa View'}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                          Drag and drop category cards below to set custom sequence for <strong className="text-foreground">{categoryOrderMode === 'retail' ? 'Retail Customers' : 'HoReCa Partners'}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 bg-background p-1.5 rounded-xl border border-border self-start sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => setCategoryOrderMode('retail')}
                          className={`px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                            categoryOrderMode === 'retail'
                              ? 'bg-primary text-primary-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                          }`}
                        >
                          <span>🛒</span>
                          <span>Retail Order</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryOrderMode('horeca')}
                          className={`px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                            categoryOrderMode === 'horeca'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                          }`}
                        >
                          <span>🏢</span>
                          <span>HoReCa Order</span>
                        </button>
                      </div>
                    </div>

                    {/* Grid of registered produce categories */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                      {displayedCategories.map((cat, index) => {
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
                                const newOrder = [...displayedCategories];
                                const [removed] = newOrder.splice(draggedProdCat, 1);
                                newOrder.splice(index, 0, removed);
                                if (categoryOrderMode === 'retail') {
                                  reorderProductCategories(newOrder);
                                } else {
                                  reorderHorecaCategories(newOrder);
                                }
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

                      {/* Showcase Channel Visibility Controls */}
                      {(() => {
                        const vis = categoryVisibility[cat] || categoryVisibility[normalizedKey] || {};
                        const isRetailVisible = vis.retail !== false;
                        const isHorecaVisible = vis.horeca !== false;
                        return (
                          <div className="z-10 mt-3 pt-3 border-t border-border/50 space-y-1.5">
                            <div className="text-[8px] uppercase tracking-widest font-extrabold text-foreground/70 flex items-center justify-between">
                              <span>Channel Visibility</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[8.5px] font-extrabold uppercase tracking-widest">
                              <button
                                type="button"
                                onClick={() => updateCategoryVisibility(cat, 'retail', !isRetailVisible)}
                                className={`py-1.5 px-2.5 rounded-lg border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                  isRetailVisible 
                                    ? 'bg-primary/10 text-primary border-primary/20 shadow-xs font-black' 
                                    : 'bg-secondary/60 text-muted-foreground/50 border-border/40 opacity-60'
                                }`}
                                title={isRetailVisible ? 'Enabled for Retail Catalog' : 'Hidden in Retail Catalog'}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isRetailVisible ? 'bg-primary animate-pulse' : 'bg-neutral-300'}`} />
                                <span>Retail</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => updateCategoryVisibility(cat, 'horeca', !isHorecaVisible)}
                                className={`py-1.5 px-2.5 rounded-lg border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                  isHorecaVisible 
                                    ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 shadow-xs font-black' 
                                    : 'bg-secondary/60 text-muted-foreground/50 border-border/40 opacity-60'
                                }`}
                                title={isHorecaVisible ? 'Enabled for HoReCa Catalog' : 'Hidden in HoReCa Catalog'}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isHorecaVisible ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-300/40'}`} />
                                <span>HoReCa</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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

      {bulkUpdateModalOpen && bulkChangedProducts.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setBulkUpdateModalOpen(false)}></div>
          <div className="bg-white border border-border rounded-[28px] max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="px-5 py-4 sm:px-8 sm:py-6 border-b border-border flex justify-between items-center bg-neutral-50 shrink-0">
              <div>
                <span className="text-emerald-600 font-mono text-[9px] sm:text-[10px] font-black uppercase tracking-widest block mb-1">Spreadsheet Injector Review</span>
                <h2 className="text-lg sm:text-2xl font-black uppercase text-foreground shrink-0 leading-tight">
                  Verify Bulk Updates ({bulkChangedProducts.length} Changes)
                </h2>
                <p className="text-muted-foreground text-[10px] sm:text-xs font-semibold mt-0.5">
                  Review calculated price adjustments and edits before committing to live database.
                </p>
              </div>
              <button 
                onClick={() => setBulkUpdateModalOpen(false)}
                className="p-1.5 sm:p-2 hover:bg-neutral-200 text-muted-foreground hover:text-foreground rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="p-4 sm:p-8 overflow-y-auto space-y-4 flex-1 bg-white">
              <div className="space-y-3.5">
                {bulkChangedProducts.map((item, idx) => (
                  <div 
                    key={`${item.id || 'new'}-${idx}`} 
                    className={`p-4 rounded-xl border transition-all ${
                      item.isNew 
                        ? 'bg-emerald-50/40 border-emerald-100 hover:border-emerald-200' 
                        : 'bg-neutral-50/50 border-neutral-100 hover:border-neutral-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-neutral-100/70">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-black text-foreground uppercase tracking-tight">{item.name}</h4>
                        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-neutral-100 text-muted-foreground rounded-md">
                          {item.updated.category}
                        </span>
                      </div>
                      <div>
                        {item.isNew ? (
                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-emerald-500 text-white rounded-full">
                            New Product
                          </span>
                        ) : (
                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-blue-500 text-white rounded-full">
                            Update
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {item.changes.map((change: string, cIdx: number) => (
                        <div key={cIdx} className="flex items-center gap-2 text-[10px] sm:text-xs font-semibold text-neutral-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                          <span className="font-mono">{change}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 sm:px-8 sm:py-6 border-t border-border flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 sm:gap-4 bg-neutral-50 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setBulkUpdateModalOpen(false);
                  setBulkChangedProducts([]);
                }}
                className="w-full sm:w-auto px-5 py-3 border border-border hover:bg-neutral-100 text-[10px] sm:text-xs font-black uppercase tracking-widest text-foreground rounded-xl transition-colors cursor-pointer text-center"
              >
                Cancel & Discard
              </button>
              <button
                type="button"
                onClick={commitBulkUpdates}
                disabled={loading}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                {loading ? 'Applying Updates...' : 'Apply Bulk Updates'}
              </button>
            </div>
          </div>
        </div>
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
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'orders', selectedOrder.id), {
                        priceUpdatedEmailPending: true,
                        shippingEmailStatus: null,
                        updatedAt: Date.now()
                      });
                      toast.success('Updated rates email queued for customer!');
                    } catch (e: any) {
                      toast.error('Failed to queue rate email');
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] sm:text-xs px-2.5 py-1.5 rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Send email notification with updated item rates to customer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send Rates Email</span>
                  <span className="sm:hidden">Send Email</span>
                </button>
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
                  {selectedOrder.shippingDetails?.email && (
                    <p className="font-bold text-foreground text-xs break-all">{selectedOrder.shippingDetails?.email}</p>
                  )}
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
                      <div key={idx} className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 sm:p-3.5 items-start sm:items-center justify-between min-w-0 w-full">
                        {/* Left/Top Part: Image, Name, Category/Unit and Mobile Total Qty */}
                        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto sm:flex-1">
                          <div className="w-10 h-10 rounded-lg bg-white border border-border p-1 overflow-hidden flex shrink-0">
                            <img src={prod.imageUrl || catImg || null} alt={prod.name} className="w-full h-full object-contain object-center" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-extrabold text-xs text-foreground uppercase truncate" title={prod.name}>{prod.name}</p>
                            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5 truncate">
                              {prod.category?.replace(/ font-bold/gi, '')} {prod.unit ? `• ${prod.unit}` : ''}
                            </p>
                          </div>

                          {/* Mobile-only Total Qty badge */}
                          <div className="sm:hidden flex flex-col items-center justify-center px-2 py-0.5 bg-primary/5 border border-primary/10 rounded-lg shrink-0 text-center">
                            <span className="text-[7px] uppercase font-black tracking-widest text-primary/60 leading-none">Total Qty</span>
                            <span className="text-[9px] font-black text-primary uppercase whitespace-nowrap mt-0.5 leading-none">{formatTotalQuantity(item.quantity || 1, prod.unit)}</span>
                          </div>
                        </div>

                        {/* Right/Bottom Part: Total Qty (Desktop), Controls, Price, Remove Button */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 border-t border-dashed border-border/60 pt-2.5 sm:pt-0 sm:border-t-0">
                          {/* Desktop-only Total Qty badge */}
                          <div className="hidden sm:flex flex-col items-center justify-center px-2.5 py-1 bg-primary/5 border border-primary/10 rounded-xl min-w-[75px] shrink-0 text-center mx-1 sm:mx-2">
                            <span className="text-[8px] uppercase font-black tracking-widest text-primary/60">Total Qty</span>
                            <span className="text-[10px] sm:text-xs font-black text-primary uppercase whitespace-nowrap">{formatTotalQuantity(item.quantity || 1, prod.unit)}</span>
                          </div>

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
                          {selectedOrder.customerType === 'horeca' || selectedOrder.customerType === 'horeca_admin' ? (
                            <div className="flex flex-col items-end gap-1 font-mono min-w-[100px] sm:min-w-[110px]">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider">Price: ₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  key={`${selectedOrder.id}-${idx}-${prod.price}`}
                                  defaultValue={prod.price || 0}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val >= 0 && val !== (prod.price || 0)) {
                                      handleUpdateItemPriceFromOrder(selectedOrder.id, idx, val);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const val = parseFloat((e.target as HTMLInputElement).value);
                                      if (!isNaN(val) && val >= 0 && val !== (prod.price || 0)) {
                                        handleUpdateItemPriceFromOrder(selectedOrder.id, idx, val);
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }
                                  }}
                                  className="w-16 sm:w-20 px-2 py-1 text-xs font-black text-right border border-border rounded-xl focus:border-primary outline-none focus:ring-2 focus:ring-primary/10 bg-white shadow-xs"
                                />
                              </div>
                              <div className="text-right text-[10px] text-muted-foreground font-extrabold whitespace-nowrap">
                                Total: <span className="font-black text-primary text-xs">₹{((prod.price || 0) * (item.quantity || 1)).toFixed(2).replace(/\.00$/, '')}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-right whitespace-nowrap font-mono min-w-[55px] sm:min-w-[60px]">
                              <p className="text-xs font-black text-foreground">₹{((prod.price || 0) * (item.quantity || 1)).toFixed(2).replace(/\.00$/, '')}</p>
                              <p className="text-[10px] text-muted-foreground font-bold mt-0.5">{item.quantity || 1} x ₹{prod.price || 0}</p>
                            </div>
                          )}
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
              
              {/* Add Product to Order */}
              {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                <div className="mt-4 p-4 border border-border rounded-2xl bg-white shadow-sm space-y-3">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground">Add Item to Order</h5>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Search for a product..."
                      value={orderProductSearch}
                      onChange={(e) => setOrderProductSearch(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-border bg-muted/20 outline-none focus:border-primary transition-colors"
                    />
                    {orderProductSearch.length > 1 && (
                      <div className="bg-white border border-border rounded-xl shadow-inner max-h-48 overflow-y-auto divide-y divide-border">
                        {products
                          .filter(p => p.name.toLowerCase().includes(orderProductSearch.toLowerCase()))
                          .slice(0, 10)
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddProductToOrder(selectedOrder.id, p);
                              }}
                              className="w-full text-left p-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black uppercase truncate">{p.name}</p>
                                <p className="text-[9px] text-muted-foreground uppercase tracking-widest truncate">{p.category} • ₹{p.price}/{p.unit}</p>
                              </div>
                              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">ADD</span>
                            </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
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

      {/* Export HoReCa B2B Orders Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsExportModalOpen(false)} />
          <div className="bg-secondary border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-border pb-3.5 mb-4">
              <div>
                <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2 tracking-wider">
                  <FileText className="w-5 h-5 text-primary" /> Export HoReCa (B2B) Orders
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-1">
                  Generate customized spreadsheets according to party, status, and date range
                </p>
              </div>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 1. Horeca Party Selector */}
              <div>
                <label className="block text-[9px] uppercase font-black tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Select Horeca Party / Party Customer
                </label>
                <select
                  value={exportParty}
                  onChange={(e) => setExportParty(e.target.value)}
                  className="appearance-none border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full uppercase font-black tracking-wider text-foreground cursor-pointer shadow-sm pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat"
                >
                  <option value="all">ALL HORECA PARTIES</option>
                  {uniqueB2BParties.map((party, idx) => (
                    <option key={idx} value={party}>{party.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {/* 2. Status Selector */}
              <div>
                <label className="block text-[9px] uppercase font-black tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5" /> Order Status Filter
                </label>
                <select
                  value={exportStatus}
                  onChange={(e) => setExportStatus(e.target.value)}
                  className="appearance-none border border-border/80 rounded-xl px-3 py-2.5 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full uppercase font-black tracking-wider text-foreground cursor-pointer shadow-sm pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2300b853%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat"
                >
                  <option value="all">ANY STATUS</option>
                  <option value="pending">PENDING ONLY</option>
                  <option value="confirmed">CONFIRMED ONLY</option>
                  <option value="processing">PROCESSING ONLY</option>
                  <option value="delivered">DELIVERED ONLY</option>
                  <option value="cancelled">CANCELLED ONLY</option>
                </select>
              </div>

              {/* 3. Date Range Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase font-black tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Start Date
                  </label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="border border-border/80 rounded-xl px-3 py-2 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full font-mono font-bold tracking-wider text-foreground shadow-sm uppercase min-h-[38px]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-black tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> End Date
                  </label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    min={exportStartDate}
                    className="border border-border/80 rounded-xl px-3 py-2 text-[10px] sm:text-xs bg-white focus:border-primary outline-none transition-colors w-full font-mono font-bold tracking-wider text-foreground shadow-sm uppercase min-h-[38px]"
                  />
                </div>
              </div>

              {/* 4. Format Selector */}
              <div>
                <label className="block text-[9px] uppercase font-black tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" /> Export Spreadsheet Format
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${exportFormat === 'sheets' ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-neutral-50'}`}>
                    <input
                      type="radio"
                      name="exportFormat"
                      checked={exportFormat === 'sheets'}
                      onChange={() => setExportFormat('sheets')}
                      className="mt-1 accent-primary"
                    />
                    <div>
                      <p className="text-[10px] sm:text-xs font-black text-foreground uppercase tracking-wide">Separate sheets per party</p>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Creates separate tabs in the Excel file for each B2B customer</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${exportFormat === 'single' ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-neutral-50'}`}>
                    <input
                      type="radio"
                      name="exportFormat"
                      checked={exportFormat === 'single'}
                      onChange={() => setExportFormat('single')}
                      className="mt-1 accent-primary"
                    />
                    <div>
                      <p className="text-[10px] sm:text-xs font-black text-foreground uppercase tracking-wide">Single consolidated sheet</p>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Combines all selected party orders into a single list sorted by customer</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${exportFormat === 'picking' ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-neutral-50'}`}>
                    <input
                      type="radio"
                      name="exportFormat"
                      checked={exportFormat === 'picking'}
                      onChange={() => setExportFormat('picking')}
                      className="mt-1 accent-primary"
                    />
                    <div>
                      <p className="text-[10px] sm:text-xs font-black text-foreground uppercase tracking-wide">Procurement / Picking List Summary</p>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Sums item quantities across all selected orders (perfect for packing/sourcing)</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* 5. Live Preview Stats Box */}
              <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-widest text-primary/80">MATCHING STATS:</span>
                <div className="flex gap-4 text-right">
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-muted-foreground font-extrabold">Orders</span>
                    <span className="text-xs font-black text-foreground">{previewStats.orderCount}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-muted-foreground font-extrabold">Total Items</span>
                    <span className="text-xs font-black text-foreground">{previewStats.itemCount}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase tracking-wider text-muted-foreground font-extrabold">Estimated Value</span>
                    <span className="text-xs font-black text-primary font-mono">₹{previewStats.totalAmount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t border-border pt-3.5">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2.5 border border-border rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground hover:bg-muted/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExportHorecaOrders}
                disabled={previewStats.orderCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer shadow-md"
              >
                <Download className="w-3.5 h-3.5" /> Download Excel file
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
