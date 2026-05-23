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
    const matchesCategory = categoryFilter && categoryFilter.toLowerCase() !== 'all products'
      ? p.category.toLowerCase() === categoryFilter.toLowerCase()
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
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
          filteredProducts.map((product) => (
            <div key={product.id} className="slice-card h-[430px]">
              <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-1.5 leading-none">
                <span className="bg-[#09120b] text-primary text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-primary/20 backdrop-blur-md">
                  {product.category}
                </span>
              </div>
              
              <Link to={`/product/${product.id}`} className="flex-1 overflow-hidden relative bg-secondary border-b border-border">
                <img 
                  src={product.imageUrl || getCategoryImage(product.category)} 
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-[1500ms] group-hover:scale-110 filter brightness-[95%]"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-80 z-10"></div>
              </Link>
              
              <div className="p-6 bg-secondary space-y-4 h-[140px] z-20 flex flex-col justify-between">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex flex-col gap-1 min-w-0">
                    <h3 className="text-xs font-sans font-black uppercase tracking-wider text-foreground truncate">{product.name}</h3>
                    <p className="text-[9px] text-primary font-bold uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 fill-primary" /> Active & Traceable
                    </p>
                  </div>
                  <div className="font-semibold text-lg text-primary shrink-0 font-sans tracking-tight">₹{product.price}</div>
                </div>
                
                <button 
                  onClick={() => handleAddToCart(product)}
                  className="w-full py-3 rounded-[14px] bg-primary text-white font-sans text-[9px] uppercase font-black tracking-widest transition-all duration-300 hover:bg-[#09120b] hover:text-white hover:scale-[1.02] transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" /> + Add to Basket
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
