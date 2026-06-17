import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Heart } from 'lucide-react';
import { Product } from '../store/useCart';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { useWishlist } from '../store/useWishlist';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  displayCategoryOverride?: string;
  key?: React.Key | string | number;
}

export const ProductCard = React.memo(function ProductCard({ product, onAddToCart, displayCategoryOverride }: ProductCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { categoryImages } = useSettings();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const displayCategory = displayCategoryOverride || product.category.replace(/ font-bold/gi, '');
  const inWishlist = isInWishlist(product.id!);

  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    startTimeRef.current = performance.now();
  }, [product.imageUrl, product.thumbnailUrl]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(el); // Keep rendered once loaded to optimize DOM operations
      }
    }, {
      rootMargin: '200px', // Preload before it enters viewport
      threshold: 0.01
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const catImage = getCategoryImage(displayCategory, categoryImages) || undefined;
  const productImgSrc = product.thumbnailUrl || product.imageUrl || catImage || undefined;

  if (!isVisible) {
    return (
      <div 
        ref={cardRef} 
        className="w-full bg-secondary border border-border rounded-xl h-[210px] sm:h-[235px] md:h-[260px] lg:h-[280px] animate-pulse"
      />
    );
  }

  return (
    <div ref={cardRef} className="slice-card h-full flex flex-col justify-between group overflow-hidden bg-background rounded-xl border border-border">
      
      <div className="w-full aspect-[4/3] overflow-hidden relative bg-secondary border-b border-border block shrink-0">
        <Link to={`/product/${product.id}`} className="block w-full h-full">
          <img 
            src={productImgSrc} 
            alt={product.name}
            loading="lazy"
            decoding="async"
            onLoad={() => {
              const duration = performance.now() - startTimeRef.current;
              console.log(
                `%c[PERF METRIC] Image load time for "${product.name}": ${duration.toFixed(2)}ms`, 
                "color: #f59e0b; font-weight: bold; font-family: monospace; border: 1px solid #f59e0b;"
              );
              setImageLoaded(true);
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            referrerPolicy="no-referrer"
          />
        </Link>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inWishlist) {
              removeFromWishlist(product.id!);
            } else {
              addToWishlist(product);
            }
          }}
          className="absolute top-2 right-2 p-1.5 z-10 transition-transform active:scale-90"
        >
          <Heart 
            className={`w-5 h-5 sm:w-6 sm:h-6 transition-all ${
              inWishlist 
                ? 'fill-red-500 text-red-500 drop-shadow-md' 
                : 'fill-white/30 text-white hover:fill-white/50 drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] lg:drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]'
            }`} 
          />
        </button>
      </div>
      
      <div className="p-2.5 sm:p-3 bg-background flex-1 flex flex-col justify-between">
        <div className="flex flex-col gap-1 w-full">
          <h3 className="text-[10px] sm:text-xs font-sans font-bold text-foreground line-clamp-2 leading-tight">{product.name}</h3>
          
          {product.unit && (
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">{product.unit}</span>
          )}

          <div className="flex items-end justify-between w-full mt-1">
            <div className="flex flex-col gap-0.5">
              {product.originalPrice && product.originalPrice > product.price && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] sm:text-[10px] text-muted-foreground line-through font-medium">₹{product.originalPrice}</span>
                  <span className="text-[8px] font-bold text-red-500 bg-red-50 px-1 py-0.5 rounded leading-none">
                    {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                  </span>
                </div>
              )}
              <div className="text-xs sm:text-sm font-bold text-foreground leading-none flex items-center gap-0.5">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground">₹</span>{product.price}
              </div>
            </div>
          </div>
        </div>
        
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (product.inStock) {
              onAddToCart(product);
            }
          }}
          disabled={!product.inStock}
          className={`w-full py-1.5 sm:py-2.5 rounded-lg font-sans text-[10px] sm:text-xs font-bold transition-colors flex items-center justify-center gap-1.5 mt-1.5 sm:mt-2.5 ${product.inStock ? 'bg-primary text-white hover:bg-primary/90 cursor-pointer' : 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-75'}`}
        >
          {product.inStock ? (
             <>
               <ShoppingBag className="w-3.5 h-3.5" /> 
               <span>Add</span>
             </>
          ) : (
             <span>Out of Stock</span>
          )}
        </button>
      </div>
    </div>
  );
});
