import React, { useEffect, useState } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
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
  'Frozen Items'
];

export function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { addItem } = useCart();
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category');

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        const q = query(collection(db, 'products'));
         const querySnapshot = await getDocs(q);
        const fetchedProducts = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
        setProducts(fetchedProducts);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const filteredProducts = products.filter(p => {
    let productCategory = p.category.toLowerCase();
    productCategory = productCategory.replace(' font-bold', ''); // Normalize older data typos

    const matchesCategory = categoryFilter && categoryFilter.toLowerCase() !== 'all products'
      ? productCategory === categoryFilter.toLowerCase()
      : true;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAddToCart = (product: Product) => {
    addItem(product);
    toast.success(`${product.name} added to cart!`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 w-full bg-background text-foreground">
      <div className="mb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-[0.2em] font-extrabold border border-primary/20 backdrop-blur-md mb-4">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> The Harvest Desk
        </div>
        
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
                <div className="flex flex-col sm:flex-row items-start justify-between gap-1 sm:gap-2.5">
                  <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0 w-full">
                    <h3 className="text-[10px] sm:text-xs font-sans font-black uppercase tracking-wider text-foreground truncate">{product.name}</h3>
                    <div className="flex items-center justify-between w-full">
                      <p className="text-[8px] sm:text-[9px] text-primary font-bold uppercase tracking-wider flex items-center gap-1">
                        <Zap className="w-2 sm:w-2.5 h-2 sm:h-2.5 fill-primary" /> <span className="hidden sm:inline">Active & Traceable</span><span className="sm:hidden">Traceable</span>
                      </p>
                      <div className="font-semibold text-sm sm:text-lg text-primary shrink-0 font-sans tracking-tight">₹{product.price}</div>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => handleAddToCart(product)}
                  className="w-full py-2.5 sm:py-3 rounded-xl sm:rounded-[14px] bg-primary text-white font-sans text-[8px] sm:text-[9px] uppercase font-black tracking-widest transition-all duration-300 hover:bg-[#09120b] hover:text-white hover:scale-[1.02] transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
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
