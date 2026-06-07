import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { Product } from '../store/useCart';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';

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
  const displayCategory = displayCategoryOverride || product.category.replace(/ font-bold/gi, '');

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

  const catImage = getCategoryImage(displayCategory, categoryImages) || '';
  const productImgSrc = product.thumbnailUrl || product.imageUrl || catImage;

  if (!isVisible) {
    // Return a lightweight loading skeletal wireframe placeholder for off-screen items, virtualizing DOM elements
    return (
      <div 
        ref={cardRef} 
        className="w-full bg-secondary border border-border rounded-2xl h-[340px] animate-pulse"
      />
    );
  }

  return (
    <div ref={cardRef} className="slice-card h-full flex flex-col justify-between group">
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex flex-wrap gap-1.5 leading-none">
        <span className="bg-white/40 backdrop-blur-md text-black text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-white/40 shadow-sm select-none">
          {displayCategory}
        </span>
      </div>
      
      <Link to={`/product/${product.id}`} className="w-full aspect-[4/3] overflow-hidden relative bg-secondary border-b border-border block shrink-0">
        {/* Category image shown stably as background layer until actual product image finishes loading (Prevents Flickering) */}
        {catImage && (
          <img 
            src={catImage} 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover filter brightness-[95%] opacity-25"
            aria-hidden="true"
          />
        )}
        
        {/* Actual product thumbnail image fades gracefully on top once loaded */}
        <img 
          src={productImgSrc} 
          alt={product.name}
          loading="lazy"
          onLoad={() => {
            const duration = performance.now() - startTimeRef.current;
            console.log(
              `%c[PERF METRIC] Image load time for "${product.name}": ${duration.toFixed(2)}ms`, 
              "color: #f59e0b; font-weight: bold; font-family: monospace; border: 1px solid #f59e0b; padding: 2px 4px; border-radius: 4px;"
            );
            setImageLoaded(true);
          }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 group-hover:scale-110 filter brightness-[95%] ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          referrerPolicy="no-referrer"
        />
      </Link>
      
      <div className="p-3 sm:p-5 md:p-6 bg-secondary space-y-3 sm:space-y-4 flex-1 flex flex-col justify-between min-h-[140px] sm:min-h-[160px]">
        <div className="flex flex-col gap-1.5 w-full">
          <h3 className="text-xs sm:text-sm font-sans font-black uppercase tracking-wider text-foreground line-clamp-2 leading-tight">{product.name}</h3>
          
          {product.unit && (
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">{product.unit}</span>
          )}

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
          onClick={() => onAddToCart(product)}
          className="w-full py-2.5 sm:py-3 rounded-xl sm:rounded-[14px] bg-primary text-white font-sans text-[8px] sm:text-[9px] uppercase font-black tracking-widest transition-all duration-300 hover:bg-[#09120b] hover:text-white hover:scale-[1.02] transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer mt-auto"
        >
          <ShoppingBag className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> <span className="hidden xs:inline">+ Add to Basket</span><span className="xs:hidden">Add</span>
        </button>
      </div>
    </div>
  );
});
