import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { ArrowLeft, Plus, Minus, ShoppingBag, Sparkles, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { getCategoryImage } from '../lib/constants';
import toast from 'react-hot-toast';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  useEffect(() => {
    async function fetchProduct() {
      if (!id) return;
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
         if (docSnap.exists()) {
          setProduct({ id: docSnap.id, ...docSnap.data() } as Product);
        } else {
          setProduct(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'products');
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
        <div className="lg:col-span-7 rounded-[32px] overflow-hidden bg-secondary border border-border relative h-[450px] lg:h-[580px]">
          <span className="absolute top-5 left-5 text-[10px] uppercase tracking-wider font-extrabold text-[#09120b] bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full select-none z-10 border border-white/50 shadow-sm">{product.category.replace(/ font-bold/gi, '')}</span>
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
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[9px] uppercase tracking-widest font-black border border-primary/25">
              <Sparkles className="w-3.5 h-3.5 fill-current" /> Sourced from Gujarat
            </div>
            
            <h1 className="text-3xl lg:text-5xl font-sans font-black tracking-tight uppercase text-foreground leading-tight">
              {product.name}
            </h1>
            
            <div className="text-4xl font-black text-primary tracking-tighter">
              ₹{product.price}
            </div>
          </div>
          
          <div className="prose prose-sm font-sans text-xs text-muted-foreground leading-relaxed font-semibold border-t border-b border-border py-6">
            <p>{product.description || 'Grown locally in certified sustainable soil, hand-scouted by our agronomist panel, and packed inside temperature-balanced cold packs. Freshness guaranteed or unconditional credit replacement.'}</p>
          </div>

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
