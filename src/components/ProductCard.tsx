import React, { useState } from 'react';
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

export function ProductCard({ product, onAddToCart, displayCategoryOverride }: ProductCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const { categoryImages } = useSettings();
  const displayCategory = displayCategoryOverride || product.category.replace(/ font-bold/gi, '');

  return (
    <div className="slice-card h-full">
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex flex-wrap gap-1.5 leading-none">
        <span className="bg-white/40 backdrop-blur-md text-black text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-white/40 shadow-sm">
          {displayCategory}
        </span>
      </div>
      
      <Link to={`/product/${product.id}`} className="w-full aspect-[4/3] overflow-hidden relative bg-secondary border-b border-border block shrink-0">
        {/* Skeleton shown while image is loading */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-muted animate-pulse z-10" />
        )}
        <img 
          src={product.imageUrl || getCategoryImage(displayCategory, categoryImages) || null} 
          alt={product.name}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-[1500ms] group-hover:scale-110 filter brightness-[95%] ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
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
}
