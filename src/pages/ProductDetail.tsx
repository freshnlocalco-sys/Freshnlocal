import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { ArrowLeft, Plus, Minus, ShoppingBag, Sparkles, ShieldCheck, Truck, RotateCcw, Zap } from 'lucide-react';
import { getCategoryImage } from '../lib/constants';
import toast from 'react-hot-toast';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  useEffect(() => {
    async function fetchProduct() {
      if (!id) return;
      try {
        setIsOffline(false);
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
         if (docSnap.exists()) {
          const data = docSnap.data();
          setProduct({ id: docSnap.id, ...data, originalPrice: data.originalPrice || data.mrp } as Product);
        } else {
          setProduct(null);
        }
      } catch (error: any) {
        if (isQuotaError(error)) {
          setIsOffline(true);
          toast.error("Database limit reached. Could not load this specific product.");
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
    if (product) {
      for (let i = 0; i < quantity; i++) {
        addItem(product);
      }
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
        <h2 className="text-3xl font-black uppercase tracking-tight text-foreground mb-2">Database Limits Reached</h2>
        <p className="text-muted-foreground text-sm max-w-md">Our free database quota has been reached for the day. Please check back tomorrow when limits reset.</p>
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

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 w-full bg-background text-foreground">
      <Link to="/shop" className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-secondary border border-border text-[10px] uppercase tracking-widest font-black text-foreground hover:text-primary hover:border-primary transition-colors mb-8">
        <ArrowLeft className="w-4.5 h-4.5" /> Back to store catalog
      </Link>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        {/* Product Image Panel */}
        <div className="lg:col-span-7 rounded-[32px] overflow-hidden bg-secondary border border-border relative aspect-[4/3] w-full">
          <div className="absolute top-5 left-5 z-20 flex flex-wrap gap-2 leading-none">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-black bg-white/40 backdrop-blur-md px-5 py-2.5 rounded-full select-none border border-white/40 shadow-sm">
              {product.category.replace(/ font-bold/gi, '')}
            </span>
            {product.originalPrice && product.originalPrice > product.price && (
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-white bg-red-500/90 backdrop-blur-md px-5 py-2.5 rounded-full select-none shadow-sm">
                {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
              </span>
            )}
          </div>
          <img 
            src={product.imageUrl || getCategoryImage(product.category)} 
            alt={product.name}
            className="w-full h-full object-cover filter brightness-[95%]"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Product Configurations Panel */}
        <div className="lg:col-span-5 space-y-8 bg-secondary border border-border p-8 rounded-[32px] shadow-sm">
          <div className="space-y-4">
            <h1 className="text-3xl lg:text-5xl font-sans font-black tracking-tight uppercase text-foreground leading-tight">
              {product.name}
            </h1>
            
            <div className="flex items-end gap-3 tracking-tighter">
              <div className="text-4xl font-black text-primary">₹{product.price}</div>
              {product.originalPrice && product.originalPrice > product.price && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-lg font-medium text-muted-foreground line-through decoration-red-500/50">
                    ₹{product.originalPrice}
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
              className="w-full py-4.5 rounded-[18px] bg-primary text-white font-sans text-[10px] uppercase font-black tracking-widest transition-all duration-300 hover:bg-[#09120b] hover:text-white hover:scale-[1.02] transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-md disabled:shadow-none"
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
    </div>
  );
}
