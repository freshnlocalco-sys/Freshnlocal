import React, { useEffect, useState } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { Search, ShoppingBag, ArrowRight, Zap, Sparkles } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { getCategoryImage } from '../lib/constants';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'All Products',
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

export function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { addItem } = useCart();
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category');
  const [isOffline, setIsOffline] = useState(false);
  const [offlineError, setOfflineError] = useState('');

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        setIsOffline(false);
        const q = query(collection(db, 'products'));
         const querySnapshot = await getDocs(q);
        const fetchedProducts = querySnapshot.docs.map(doc => {
          const data = doc.data();
          const pPrice = Number(data.price) || 0;
          const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
          return {
            id: doc.id,
            ...data,
            price: pPrice,
            originalPrice: pMrp > pPrice ? pMrp : undefined
          };
        }) as Product[];
        setProducts(fetchedProducts);
      } catch (error: any) {
        if (isQuotaError(error)) {
          setIsOffline(true);
          setOfflineError(error?.message || String(error));
          toast.error(`Database error: ${error?.message || String(error)}`, { duration: 8000 });
        } else {
          handleFirestoreError(error, OperationType.LIST, 'products');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const filteredProducts = products.filter(p => {
    let productCategory = p.category ? p.category.toLowerCase() : '';
    productCategory = productCategory.replace(' font-bold', ''); // Normalize older data typos

    // Explicitly hide juices from the Shop page, as they belong on the dedicated FNL Juice page
    if (productCategory === 'fnl juices' || productCategory === 'fnl juice' || productCategory === 'cold-pressed juices') {
      return false;
    }

    const matchesCategory = categoryFilter && categoryFilter.toLowerCase() !== 'all products'
      ? productCategory === categoryFilter.toLowerCase()
      : true;
    const matchesSearch = p.name ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    return matchesCategory && matchesSearch;
  });

  const handleAddToCart = (product: Product) => {
    addItem(product);
    toast.success(`${product.name} added to cart!`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 w-full bg-background text-foreground">
      <div className="mb-14">
        {/* Removed The Harvest Desk badge */}
        
        <h1 className="text-4xl md:text-7xl font-sans font-black uppercase tracking-tight text-foreground mb-4">
          {categoryFilter && categoryFilter.toLowerCase() !== 'all products' ? `${categoryFilter}` : 'Gourmet Inventories'}
        </h1>
        <p className="text-muted-foreground text-xs font-semibold max-w-xl leading-relaxed">
          Carefully vetted crops, hand-harvested and packed with medical-grade food safety standards. No middleman markup or delay.
        </p>
        
        <div className="flex flex-col xl:flex-row gap-6 mt-12 items-start xl:items-center justify-between border-b border-border pb-8">
          {/* Category Navigation with futuristic high-contrast pills */}
          <div className="flex flex-wrap gap-2.5 flex-1">
            {CATEGORIES.map((cat) => (
              <Link 
                key={cat} 
                to={cat === 'All Products' ? '/shop' : `/shop?category=${encodeURIComponent(cat)}`}
                className={`px-5 py-3 text-[9px] uppercase tracking-[0.2em] font-extrabold rounded-full border transition-all duration-300 ${
                  (cat === 'All Products' && !categoryFilter) || (categoryFilter?.toLowerCase() === cat.toLowerCase())
                    ? 'bg-primary text-white border-primary shadow-[0_4px_15px_rgba(0,184,83,0.15)]'
                    : 'bg-secondary text-foreground border-border hover:border-primary/50 hover:text-primary hover:bg-primary/5'
                }`}
              >
                {cat}
              </Link>
            ))}
          </div>

          <div className="relative w-full md:w-80 shrink-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search active crop rosters..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-4 rounded-full border border-border text-xs text-foreground focus:outline-none focus:border-primary bg-secondary placeholder-muted-foreground transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 md:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
        {loading ? (
          <div className="col-span-full py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4">
            <span className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin"></span>
             RETRIEVING LIVE INVENTORIES SENSORS...
          </div>
        ) : isOffline ? (
          <div className="col-span-full py-36 text-center text-muted-foreground font-sans text-sm uppercase tracking-widest border border-dashed border-border rounded-3xl p-8 bg-secondary flex flex-col items-center gap-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-2">
              <Zap className="w-6 h-6" />
            </div>
            Store is temporarily offline due to database limits.
            <span className="text-[10px] text-muted-foreground max-w-sm normal-case mt-2">
              Our database is blocking access right now.
              <br/><br/>
              <b>Error:</b> {offlineError}
            </span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="col-span-full py-36 text-center text-muted-foreground font-sans text-xs uppercase tracking-widest border border-dashed border-border rounded-3xl p-8">
            This crop tier is currently resting or sold out. Select an active harvest catalog above.
          </div>
        ) : (
          filteredProducts.map((product) => {
            const displayCategory = product.category.replace(/ font-bold/gi, '');
            return (
            <div key={product.id} className="slice-card h-full">
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex flex-wrap gap-1.5 leading-none">
                <span className="bg-white/40 backdrop-blur-md text-black text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-white/40 shadow-sm">
                  {displayCategory}
                </span>
              </div>
              
              <Link to={`/product/${product.id}`} className="w-full aspect-[4/3] overflow-hidden relative bg-secondary border-b border-border block shrink-0">
                <img 
                  src={product.imageUrl || getCategoryImage(displayCategory)} 
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-[1500ms] group-hover:scale-110 filter brightness-[95%]"
                  referrerPolicy="no-referrer"
                />
              </Link>
              
              <div className="p-3 sm:p-5 md:p-6 bg-secondary space-y-3 sm:space-y-4 flex-1 flex flex-col justify-between min-h-[140px] sm:min-h-[160px]">
                <div className="flex flex-col gap-1.5 w-full">
                  <h3 className="text-xs sm:text-sm font-sans font-black uppercase tracking-wider text-foreground line-clamp-2 leading-tight">{product.name}</h3>
                  
                  <div className="flex items-end justify-between w-full mt-1 sm:mt-2">
                    <div className="flex flex-col gap-1.5">
                      {product.originalPrice && product.originalPrice > product.price && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] sm:text-xs text-muted-foreground line-through font-medium uppercase tracking-wider">MRP ₹{product.originalPrice}</span>
                          <span className="text-[9px] sm:text-[10px] font-extrabold text-white bg-red-500 px-1.5 py-0.5 rounded-md leading-none tracking-widest">
                            {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                          </span>
                        </div>
                      )}
                      <div className="font-sans text-lg sm:text-xl font-black text-foreground tracking-tighter leading-none flex items-center gap-1">
                        <span className="text-sm font-bold text-muted-foreground">₹</span>{product.price}
                      </div>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => handleAddToCart(product)}
                  className="w-full py-2.5 sm:py-3 rounded-xl sm:rounded-[14px] bg-primary text-white font-sans text-[8px] sm:text-[9px] uppercase font-black tracking-widest transition-all duration-300 hover:bg-[#09120b] hover:text-white hover:scale-[1.02] transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer mt-auto"
                >
                  <ShoppingBag className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> <span className="hidden xs:inline">+ Add to Basket</span><span className="xs:hidden">Add</span>
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
