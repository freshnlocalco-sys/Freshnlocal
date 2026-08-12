import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Heart, Plus, Minus, Building2, RotateCcw } from 'lucide-react';
import { useCart, Product } from '../store/useCart';
import { useAuth } from '../lib/firebase';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { useWishlist } from '../store/useWishlist';
import { calculateHorecaPrice, calculateBaseUnitPrice, getUnitQuantityConfig, safeAddQuantity, safeSubtractQuantity } from '../lib/horecaUtils';
import { useHorecaPrices } from '../store/useHorecaPrices';
import { QuantityInput } from './QuantityInput';
import { motion } from 'motion/react';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity?: number) => void;
  displayCategoryOverride?: string;
  onQuickView?: (product: Product) => void;
  isReorderItem?: boolean;
  key?: React.Key | string | number;
}

const loadedProductImages = new Set<string>();

export const ProductCard = React.memo(function ProductCard({ product, onAddToCart, displayCategoryOverride, onQuickView, isReorderItem }: ProductCardProps) {
  const { categoryImages } = useSettings();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const { items, updateQuantity, removeItem, addItem } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
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
  
  const isHoreca = user?.role === 'horeca' || user?.role === 'horeca_admin';
  const { prices: rememberedPrices, loadPrices } = useHorecaPrices();

  useEffect(() => {
    if ((user?.uid || user?.email) && isHoreca) {
      loadPrices(user.uid, user.email || undefined);
    }
  }, [user?.uid, user?.email, isHoreca, loadPrices]);

  const currentUnit = isHoreca ? (currentVariant.horecaUnit || currentVariant.unit || '1KG') : currentVariant.unit;
  
  // Ensure cartProductId is strictly unique per variant
  const cartProductId = currentUnit ? `${product.id}-${currentUnit.trim()}` : product.id;

  const pNameRaw = product.name?.trim();
  const pNameKey = product.name?.toLowerCase().trim();
  const baseIdKey = product.id ? product.id.split('-')[0] : '';
  const pidLower = product.id ? product.id.toLowerCase().trim() : '';
  const cartPidLower = cartProductId ? cartProductId.toLowerCase().trim() : '';
  const baseIdLower = baseIdKey ? baseIdKey.toLowerCase().trim() : '';

  const rememberedPrice = isHoreca ? (
    (product.id ? rememberedPrices[product.id] : undefined) ??
    (pidLower ? rememberedPrices[pidLower] : undefined) ??
    (cartProductId ? rememberedPrices[cartProductId] : undefined) ??
    (cartPidLower ? rememberedPrices[cartPidLower] : undefined) ??
    (baseIdKey ? rememberedPrices[baseIdKey] : undefined) ??
    (baseIdLower ? rememberedPrices[baseIdLower] : undefined) ??
    (pNameRaw ? rememberedPrices[pNameRaw] : undefined) ??
    (pNameKey ? rememberedPrices[pNameKey] : undefined)
  ) : undefined;

  const currentPrice = isHoreca 
    ? (typeof rememberedPrice === 'number' && rememberedPrice > 0 
        ? rememberedPrice 
        : (currentVariant.horecaPrice ? calculateHorecaPrice(currentVariant.horecaPrice, currentUnit) : currentVariant.price))
    : currentVariant.price;
  const currentOriginalPrice = currentVariant.originalPrice;
  const baseUnitPrice = calculateBaseUnitPrice(currentPrice, currentUnit);

  const unitConfig = React.useMemo(() => getUnitQuantityConfig(currentUnit), [currentUnit]);
  const step = isHoreca ? 0.5 : unitConfig.step;
  const initialQty = isHoreca ? 0 : unitConfig.initialQty;
  const isDiscrete = unitConfig.isDiscrete;

  const [isExpanded, setIsExpanded] = useState(isHoreca);
  const [stagedQuantity, setStagedQuantity] = useState<number>(initialQty);

  const cartItem = items.find((item) => item?.product?.id === cartProductId && item?.product?.unit === currentUnit);
  const quantity = cartItem ? cartItem.quantity : 0;
  
  const displayQuantity = quantity > 0 ? quantity : stagedQuantity;

  useEffect(() => {
    if (isHoreca) {
      setIsExpanded(true);
      if (quantity === 0) {
        setStagedQuantity(0);
      }
    } else {
      if (quantity > 0) {
        setIsExpanded(true);
      } else {
        setIsExpanded(false);
        setStagedQuantity(initialQty);
      }
    }
  }, [isHoreca, quantity, initialQty]);
  
  const catImage = getCategoryImage(displayCategory, categoryImages) || undefined;
  const productImgSrc = product.imageUrl || catImage || undefined;

  const [imageLoaded, setImageLoaded] = useState(() => productImgSrc ? loadedProductImages.has(productImgSrc) : false);

  useEffect(() => {
    if (productImgSrc && loadedProductImages.has(productImgSrc)) {
      setImageLoaded(true);
    }
  }, [productImgSrc]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="slice-card h-full flex flex-col justify-between group overflow-hidden bg-background rounded-xl border border-border"
    >
      
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
        {isReorderItem && (
          <div className="absolute top-2 left-2 z-20 pointer-events-none">
            <span className="inline-flex items-center gap-1 bg-primary text-white text-[8px] sm:text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-md border border-white/20">
              <RotateCcw className="w-2.5 h-2.5 shrink-0" /> REORDER
            </span>
          </div>
        )}
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
          className="absolute top-2 right-2 p-1.5 z-20 transition-transform active:scale-90"
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
      
      <div 
        className="p-2.5 sm:p-3 bg-background flex-1 flex flex-col justify-between cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          if (onQuickView) {
            onQuickView(product);
          } else {
            navigate(`/product/${product.id}`);
          }
        }}
      >
        <div className="flex flex-col gap-1 w-full">
          <h3 className="text-[10px] sm:text-xs font-sans font-bold text-foreground line-clamp-2 leading-tight">{product.name}</h3>
          
          {allVariants.length > 1 ? (
            <div className="flex flex-wrap gap-1 mt-1 mb-1">
              {allVariants.map((v, idx) => {
                const vDisplayUnit = isHoreca ? (v.horecaUnit || v.unit || '1KG') : v.unit;
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
            {isHoreca ? (
              <div className="flex flex-col gap-1 w-full">
                {currentPrice > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="text-xs sm:text-sm font-bold text-foreground leading-none flex items-center gap-0.5">
                      <span className="text-[9px] sm:text-[10px] text-muted-foreground">₹</span>{currentPrice}
                    </div>
                    <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[8px] sm:text-[9px] font-bold">
                      <Building2 className="w-2.5 h-2.5 text-primary shrink-0" />
                      <span>{typeof rememberedPrice === 'number' && rememberedPrice > 0 ? "Your Confirmed Rate" : `Custom B2B Tier (${currentUnit || '1KG'})`}</span>
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary border border-primary/30 text-foreground shadow-2xs">
                    <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[8.5px] sm:text-[9.5px] font-black tracking-wider uppercase text-primary leading-none">
                        CUSTOM B2B PRICE
                      </span>
                      <span className="text-[7.5px] font-semibold text-muted-foreground leading-tight">
                        Wholesale Invoice Tier ({currentUnit || '1KG'})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
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
                {baseUnitPrice && (
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground/80 font-bold mt-1">
                    {baseUnitPrice}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {(!isExpanded && quantity === 0) ? (
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (product.inStock || isHoreca) {
                setIsExpanded(true);
                setStagedQuantity(initialQty);
              }
            }}
            disabled={!product.inStock && !isHoreca}
            className={`w-full py-1.5 sm:py-2.5 rounded-lg font-sans text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 mt-1.5 sm:mt-2.5 transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${(product.inStock || isHoreca) ? 'bg-primary text-white border border-primary hover:bg-[#09120b] hover:border-[#09120b] active:scale-[0.97] cursor-pointer shadow-sm' : 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-75'}`}
          >
            {product.inStock ? <span>Add</span> : isHoreca ? <span>Request (Out of Stock)</span> : <span>Out of Stock</span>}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 w-full mt-1.5 sm:mt-2.5 h-7 sm:h-9">
            <div className="flex-1 flex items-center justify-between border border-primary bg-primary/5 text-primary rounded-lg overflow-hidden h-full">
              <button 
                className="w-7 sm:w-8 h-full flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  const currentStep = isHoreca ? 0.5 : step;
                  if (quantity > 0) {
                    if (quantity <= currentStep + 0.001) {
                      removeItem(cartProductId);
                      setStagedQuantity(0);
                      if (!isHoreca) setIsExpanded(false);
                    } else {
                      updateQuantity(cartProductId, safeSubtractQuantity(quantity, currentStep, isDiscrete));
                    }
                  } else {
                    if (stagedQuantity <= currentStep + 0.001) {
                      setStagedQuantity(0);
                      if (!isHoreca) setIsExpanded(false);
                    } else {
                      setStagedQuantity(safeSubtractQuantity(stagedQuantity, currentStep, isDiscrete));
                    }
                  }
                }}
              >
                <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              <div className="flex items-center w-full" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <QuantityInput
                  initialQuantity={displayQuantity}
                  isHoreca={isHoreca}
                  className="font-bold text-[10px] sm:text-[11px] flex-1 text-center bg-transparent outline-none w-full border-b border-dashed border-primary/30 focus:border-primary mx-1"
                  onUpdate={(val) => {
                    if (quantity > 0) {
                      updateQuantity(cartProductId, val);
                    } else {
                      setStagedQuantity(val);
                    }
                  }}
                  onRemove={() => {
                    if (quantity > 0) {
                      removeItem(cartProductId);
                    }
                    setStagedQuantity(0);
                    if (!isHoreca) setIsExpanded(false);
                  }}
                />
              </div>
              <button 
                className="w-7 sm:w-8 h-full flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  const currentStep = isHoreca ? 0.5 : step;
                  if (quantity > 0) {
                    updateQuantity(cartProductId, safeAddQuantity(quantity, currentStep, isDiscrete));
                  } else {
                    setStagedQuantity(safeAddQuantity(stagedQuantity, currentStep, isDiscrete));
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
                  if ((product.inStock || isHoreca) && stagedQuantity > 0) {
                    onAddToCart({ ...product, id: cartProductId, price: currentPrice, originalPrice: isHoreca ? 0 : currentOriginalPrice, unit: currentUnit }, stagedQuantity); 
                  }
                } else {
                  updateQuantity(cartProductId, safeAddQuantity(quantity, step, isDiscrete));
                }
              }}
              disabled={(!product.inStock && !isHoreca) || displayQuantity <= 0}
              className={`h-full px-3 sm:px-4 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center ${(product.inStock || isHoreca) && displayQuantity > 0 ? 'bg-primary text-white shadow-sm active:scale-95 cursor-pointer hover:bg-[#09120b]' : 'bg-muted text-muted-foreground cursor-not-allowed opacity-75'}`}
            >
              {product.inStock ? 'Add' : 'Request'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
});
