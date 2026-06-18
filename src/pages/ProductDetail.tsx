import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { ArrowLeft, Plus, Minus, ShoppingBag, Sparkles, ShieldCheck, Truck, RotateCcw, Zap, Heart } from 'lucide-react';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { useProducts } from '../store/useProducts';
import { useWishlist } from '../store/useWishlist';
import { cacheManager, trackFirestoreRead } from '../lib/cacheManager';
import { ProductCard } from '../components/ProductCard';
import { ProductReviews } from '../components/ProductReviews';
import toast from 'react-hot-toast';

export function ProductDetail() {
  const { categoryImages } = useSettings();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineError, setOfflineError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const allProducts = useProducts(state => state.products);

  const inWishlist = product ? isInWishlist(product.id!) : false;

  const relatedProducts = useMemo(() => {
    if (!product || allProducts.length === 0) return [];
    return allProducts
      .filter(p => p.category === product.category && p.id !== product.id && p.inStock)
      .slice(0, 4);
  }, [product, allProducts]);

  useEffect(() => {
    async function fetchProduct() {
      if (!id) return;
      try {
        setIsOffline(false);

        // 1. Check Zustand store first
        const storeProducts = useProducts.getState().products;
        let found = storeProducts.find(p => p.id === id);

        // 2. Check localStorage cached products
        if (!found) {
          const cachedProducts = cacheManager.get<Product[]>('products_v3', true);
          if (cachedProducts) {
            found = cachedProducts.find(p => p.id === id);
          }
        }

        // 3. Check localStorage cached single product detail
        if (!found) {
          found = cacheManager.get<Product>(`product_detail_${id}`);
        }

        if (found) {
          setProduct(found);
          setLoading(false);
          return;
        }

        // 4. Fetch from Firestore if not found anywhere else
        await cacheManager.fetchDeduplicated(`product_detail_fetch_${id}`, async () => {
          const docRef = doc(db, 'products', id);
          const docSnap = await getDoc(docRef);
          
          trackFirestoreRead('products', 1);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const pPrice = Number(data.price) || 0;
            const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
            const fetchedProduct = { 
              id: docSnap.id, 
              ...data, 
              price: pPrice,
              originalPrice: pMrp > pPrice ? pMrp : undefined 
            } as Product;

            // Cache single product details
            cacheManager.set(`product_detail_${id}`, fetchedProduct);
            setProduct(fetchedProduct);
          } else {
            setProduct(null);
          }
        });
      } catch (error: any) {
        if (isQuotaError(error)) {
          setIsOffline(true);
          setOfflineError(error?.message || String(error));
          toast.error(`Database error: ${error?.message || String(error)}`, { duration: 8000 });
        } else {
          handleFirestoreError(error, OperationType.GET, 'products');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [id]);

  const handleAddToCart = () => {
    if (product && product.inStock) {
      addItem(product, quantity);
      toast.success(`${quantity} ${product.name} added to cart!`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4">
        <span className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin"></span>
        LOADING SPECIFICATIONS AND HARVEST DATA...
      </div>
    );
  }

  if (isOffline) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-36 text-center flex flex-col items-center gap-6 bg-background">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-2">
          <Zap className="w-8 h-8" />
        </div>
        <span className="text-red-500 text-xs font-mono uppercase tracking-widest leading-loose">Store Offline</span>
        <h2 className="text-3xl font-black uppercase tracking-tight text-foreground mb-2">Database Access Blocked</h2>
        <p className="text-[11px] text-muted-foreground p-4 bg-secondary border border-border rounded-lg max-w-lg mt-2 font-mono text-left w-full overflow-x-auto whitespace-pre-wrap">
          Error: {offlineError}
        </p>
        <Link to="/shop" className="slice-btn-secondary px-6 py-4 text-[10px] text-foreground flex items-center gap-2 mt-4">
          <ArrowLeft className="w-4 h-4" /> Return to Catalog
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-36 text-center flex flex-col items-center gap-6 bg-background">
        <span className="text-red-400 text-xs font-mono uppercase tracking-widest">PRODUCT ID EXPIRED OR OFFLINE</span>
        <h2 className="text-3xl font-black uppercase tracking-tight text-foreground mb-2">Sought crop not found</h2>
        <Link to="/shop" className="slice-btn-secondary px-6 py-4 text-[10px] text-foreground flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Return to Catalog
        </Link>
      </div>
    );
  }

  const isJuice = (product.category || '').toLowerCase().includes('juice');
  const backLink = isJuice ? "/juice" : "/shop";
  const backText = isJuice ? "Back to FNL Juices" : "Back to store catalog";

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 w-full bg-background text-foreground">
      <Link to={backLink} className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-secondary border border-border text-[10px] uppercase tracking-widest font-black text-foreground hover:text-primary hover:border-primary transition-colors mb-8">
        <ArrowLeft className="w-4.5 h-4.5" /> {backText}
      </Link>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        {/* Product Image Panel */}
        <div className="lg:col-span-7 rounded-xl overflow-hidden bg-secondary border border-border relative aspect-[4/3] w-full items-center justify-center flex">
          <div className="absolute top-5 left-5 z-20 flex flex-wrap gap-2 leading-none">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-black bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full select-none border border-border shadow-sm">
              {(product.category || '').replace(/ font-bold/gi, '')}
            </span>
          </div>
          <button
            onClick={() => {
              if (inWishlist) {
                removeFromWishlist(product.id!);
                toast.success('Removed from wishlist');
              } else {
                addToWishlist(product);
                toast.success('Added to wishlist');
              }
            }}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 z-20 p-2 transition-transform active:scale-90"
          >
            <Heart 
              className={`w-7 h-7 sm:w-8 sm:h-8 transition-all ${
                inWishlist 
                  ? 'fill-red-500 text-red-500 drop-shadow-md' 
                  : 'fill-white/30 text-white hover:fill-white/50 drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] lg:drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]'
              }`} 
            />
          </button>
          <img 
            src={product.imageUrl || getCategoryImage(product.category, categoryImages) || null} 
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-contain object-center"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Product Configurations Panel */}
        <div className="lg:col-span-5 space-y-8 bg-secondary border border-border p-8 rounded-xl shadow-sm">
          <div className="space-y-4">
            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-sans font-black tracking-tight uppercase text-foreground leading-tight">
              {product.name}
            </h1>

            {product.unit && (
              <div className="text-xs uppercase tracking-wider font-extrabold text-muted-foreground bg-white border border-border/80 px-4 py-2 rounded-xl inline-block shadow-xs">
                Pack / Unit Size: <span className="text-primary font-black ml-1 font-sans">{product.unit}</span>
              </div>
            )}
            
            <div className="flex items-end gap-3 tracking-tighter">
              <div className="text-4xl font-black text-primary">₹{product.price}</div>
              {product.originalPrice && product.originalPrice > product.price && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-lg font-medium text-muted-foreground line-through decoration-red-500/50">
                    MRP ₹{product.originalPrice}
                  </div>
                  <span className="text-sm font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded">
                    {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {product.description && (
            <div className="prose prose-sm font-sans text-xs text-muted-foreground leading-relaxed font-semibold border-t border-b border-border py-6">
              <p>{product.description}</p>
            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Order Quantity</span>
              <div className="flex items-center border border-border bg-background rounded-2xl overflow-hidden p-1.5">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-xl hover:bg-[#09120b] hover:text-white flex items-center justify-center cursor-pointer text-foreground transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="w-12 text-center text-xs font-black text-foreground">{quantity}</div>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-xl hover:bg-[#09120b] hover:text-white flex items-center justify-center cursor-pointer text-foreground transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Total Settlement</span>
              <div className="font-sans font-black text-2xl text-foreground">₹{(product.price * quantity).toFixed(2)}</div>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <button 
              onClick={handleAddToCart}
              className="w-full py-4.5 rounded-xl bg-primary text-white font-sans text-[10px] uppercase font-black tracking-widest transition-colors hover:bg-[#09120b] hover:text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-md disabled:shadow-none"
              disabled={!product.inStock}
            >
              <ShoppingBag className="w-4.5 h-4.5" />
              {product.inStock ? 'Checkout to Basket' : 'Out of Stock'}
            </button>

            {/* Quick trust metrics */}
            <div className="grid grid-cols-3 gap-2 text-[8px] uppercase tracking-widest font-extrabold text-muted-foreground pt-4 text-center">
              <div className="p-3 bg-background border border-border rounded-2xl flex flex-col items-center gap-1.5">
                <Truck className="w-4.5 h-4.5 text-primary" />
                <span>6hr Delivery</span>
              </div>
              <div className="p-3 bg-background border border-border rounded-2xl flex flex-col items-center gap-1.5">
                <ShieldCheck className="w-4.5 h-4.5 text-primary" />
                <span>Double Audited</span>
              </div>
              <div className="p-3 bg-background border border-border rounded-2xl flex flex-col items-center gap-1.5">
                <RotateCcw className="w-4.5 h-4.5 text-primary" />
                <span>No-Ask Refund</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ProductReviews productId={product.id!} />

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="mt-20 border-t border-border pt-12">
          <div className="flex flex-col gap-2 mb-8">
            <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">
              Related Items
            </h2>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-extrabold">
              You might also like
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {relatedProducts.map(rp => (
              <ProductCard 
                key={rp.id} 
                product={rp} 
                onAddToCart={(p) => {
                  if (p.inStock) {
                    addItem(p, 1);
                    toast.success(`1 ${p.name} added to cart!`);
                  }
                }} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
