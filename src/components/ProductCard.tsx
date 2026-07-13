import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Heart, Plus, Minus } from 'lucide-react';
import { useCart, Product } from '../store/useCart';
import { useAuth } from '../lib/firebase';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { useWishlist } from '../store/useWishlist';
import { calculateHorecaPrice } from '../lib/horecaUtils';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity?: number) => void;
  displayCategoryOverride?: string;
  key?: React.Key | string | number;
}

const loadedProductImages = new Set<string>();

export const ProductCard = React.memo(function ProductCard({ product, onAddToCart, displayCategoryOverride }: ProductCardProps) {
  const { categoryImages } = useSettings();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const { items, updateQuantity, removeItem, addItem } = useCart();
  const { user } = useAuth();
  const displayCategory = displayCategoryOverride || (product.category || '').replace(/ font-bold/gi, '');
  const inWishlist = isInWishlist(product.id!);
  
  const variants = product.variants || [];
  const allVariants = React.useMemo(() => {
    const defaults = { unit: product.unit || '', price: product.price, originalPrice: product.originalPrice, horecaPrice: product.horecaPrice, horecaUnit: product.horecaUnit || '' };
    if (variants.length === 0) return [defaults];
    return [defaults, ...variants.map(v => ({ 
      unit: v.unit, 
      price: Number(v.price), 
      originalPrice: v.originalPrice ? Number(v.originalPrice) : undefined,
      horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : undefined,
      horecaUnit: v.horecaUnit || ''
    }))];
  }, [variants, product]);

  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const currentVariant = allVariants[selectedVariantIdx] || allVariants[0];
  
  const isHoreca = user?.role === 'horeca';
  const [isExpanded, setIsExpanded] = useState(false);
  const [stagedQuantity, setStagedQuantity] = useState<number>(isHoreca ? 1 : 1);

  const currentUnit = isHoreca && currentVariant.horecaPrice ? (currentVariant.horecaUnit || '1KG') : currentVariant.unit;
  const currentPrice = isHoreca && currentVariant.horecaPrice ? calculateHorecaPrice(currentVariant.horecaPrice, currentUnit) : currentVariant.price;
  const currentOriginalPrice = currentVariant.originalPrice;
  
  // Ensure cartProductId is strictly unique per variant
  const cartProductId = currentUnit ? `${product.id}-${currentUnit.trim()}` : product.id;

  const cartItem = items.find((item) => item?.product?.id === cartProductId && item?.product?.unit === currentUnit);
  const quantity = cartItem ? cartItem.quantity : 0;
  
  const step = 1;
  const displayQuantity = quantity > 0 ? quantity : stagedQuantity;

  useEffect(() => {
    if (quantity > 0) {
      setIsExpanded(true);
    }
  }, [quantity]);
  
  const catImage = getCategoryImage(displayCategory, categoryImages) || undefined;
  const productImgSrc = product.imageUrl || catImage || undefined;

  const [imageLoaded, setImageLoaded] = useState(() => productImgSrc ? loadedProductImages.has(productImgSrc) : false);

  useEffect(() => {
    if (productImgSrc && loadedProductImages.has(productImgSrc)) {
      setImageLoaded(true);
    }
  }, [productImgSrc]);

  return (
    <div className="slice-card h-full flex flex-col justify-between group overflow-hidden bg-background rounded-xl border border-border">
      
      <div className="w-full aspect-[4/3] overflow-hidden relative bg-white dark:bg-white border-b border-border shrink-0" style={{ borderRadius: 'inherit', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        {!imageLoaded && (
          <div className="absolute inset-0 bg-secondary/20 animate-pulse" />
        )}
        <Link to={`/product/${product.id}`} className="block w-full h-full relative">
          <img 
            src={productImgSrc} 
            alt={product.name}
            loading="lazy"
            decoding="async"
            onLoad={() => {
              if (productImgSrc) {
                loadedProductImages.add(productImgSrc);
              }
              setImageLoaded(true);
            }}
            className={`absolute inset-0 w-full h-full object-contain object-center ${!imageLoaded ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
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
          
          {allVariants.length > 1 ? (
            <div className="flex flex-wrap gap-1 mt-1 mb-1">
              {allVariants.map((v, idx) => {
                const vDisplayUnit = isHoreca && v.horecaPrice ? (v.horecaUnit || '1KG') : v.unit;
                const vProductId = vDisplayUnit ? `${product.id}-${vDisplayUnit.trim()}` : product.id;
                const vCartItem = items.find((item) => item?.product?.id === vProductId && item?.product?.unit === vDisplayUnit);
                const vQty = vCartItem ? vCartItem.quantity : 0;
                
                return (
                  <button
                    key={idx}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedVariantIdx(idx); }}
                    className={`relative text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-medium border ${selectedVariantIdx === idx ? 'bg-primary text-white border-primary' : 'bg-secondary text-secondary-foreground border-border hover:bg-secondary/80'}`}
                  >
                    {vDisplayUnit}
                    {vQty > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white">
                        {vQty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : currentUnit && (
            <span className="inline-block bg-secondary text-secondary-foreground text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-medium self-start mt-0.5">
              {currentUnit}
            </span>
          )}

          <div className="flex items-end justify-between w-full mt-1">
            <div className="flex flex-col gap-0.5">
              {currentOriginalPrice && currentOriginalPrice > currentPrice && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] sm:text-[10px] text-muted-foreground line-through font-medium">₹{currentOriginalPrice}</span>
                  <span className="text-[8px] font-bold text-red-500 bg-red-50 px-1 py-0.5 rounded leading-none">
                    {Math.round(((currentOriginalPrice - currentPrice) / currentOriginalPrice) * 100)}% OFF
                  </span>
                </div>
              )}
              <div className="text-xs sm:text-sm font-bold text-foreground leading-none flex items-center gap-0.5">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground">₹</span>{currentPrice}
              </div>
            </div>
          </div>
        </div>
        {(!isExpanded && quantity === 0) ? (
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (product.inStock) {
                setIsExpanded(true);
                setStagedQuantity(1);
              }
            }}
            disabled={!product.inStock}
            className={`w-full py-1.5 sm:py-2.5 rounded-lg font-sans text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 mt-1.5 sm:mt-2.5 transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${product.inStock ? 'bg-primary text-white border border-primary hover:bg-[#09120b] hover:border-[#09120b] active:scale-[0.97] cursor-pointer shadow-sm' : 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-75'}`}
          >
            {product.inStock ? <span>Add</span> : <span>Out of Stock</span>}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 w-full mt-1.5 sm:mt-2.5 h-7 sm:h-9">
            <div className="flex-1 flex items-center justify-between border border-primary bg-primary/5 text-primary rounded-lg overflow-hidden h-full">
              <button 
                className="w-7 sm:w-8 h-full flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  if (quantity > 0) {
                    if (quantity <= step) {
                      removeItem(cartProductId);
                      setStagedQuantity(0);
                    } else {
                      updateQuantity(cartProductId, quantity - step);
                    }
                  } else {
                    setStagedQuantity(Math.max(0, stagedQuantity - step));
                  }
                }}
              >
                <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              {isHoreca ? (
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={displayQuantity}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onChange={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const val = Math.max(0, Number(e.target.value));
                    if (quantity > 0) {
                      if (val === 0) {
                        removeItem(cartProductId);
                        setStagedQuantity(0);
                      } else {
                        updateQuantity(cartProductId, val);
                      }
                    } else {
                      setStagedQuantity(val);
                    }
                  }}
                  className="font-bold text-[10px] sm:text-[11px] flex-1 text-center bg-transparent outline-none w-full border-b border-dashed border-primary/30 focus:border-primary mx-1"
                  title="Enter custom quantity"
                />
              ) : (
                <span className="font-bold text-[10px] sm:text-[11px] flex-1 text-center select-none">{displayQuantity}</span>
              )}
              <button 
                className="w-7 sm:w-8 h-full flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  if (quantity > 0) {
                    updateQuantity(cartProductId, quantity + step);
                  } else {
                    setStagedQuantity(stagedQuantity + step);
                  }
                }}
              >
                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
            <button 
              onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation();
                if (quantity === 0) {
                  if (product.inStock && stagedQuantity > 0) {
                    onAddToCart({ ...product, id: cartProductId, price: currentPrice, originalPrice: currentOriginalPrice, unit: currentUnit }, stagedQuantity); 
                  }
                } else {
                  updateQuantity(cartProductId, quantity + step);
                }
              }}
              disabled={!product.inStock || displayQuantity <= 0}
              className={`h-full px-3 sm:px-4 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center ${product.inStock && displayQuantity > 0 ? 'bg-primary text-white shadow-sm active:scale-95 cursor-pointer hover:bg-[#09120b]' : 'bg-muted text-muted-foreground cursor-not-allowed opacity-75'}`}
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
