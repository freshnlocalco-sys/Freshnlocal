import React, { useState, useEffect } from 'react';
import { X, Heart, Plus, Minus, ShoppingBag, Building2 } from 'lucide-react';
import { Product, useCart } from '../store/useCart';
import { useWishlist } from '../store/useWishlist';
import { useAuth } from '../lib/firebase';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { calculateHorecaPrice, getBaseUnit, parseUnitScale, getUnitQuantityConfig, safeAddQuantity, safeSubtractQuantity, formatDisplayUnit, resolveHorecaSubunitPrice } from '../lib/horecaUtils';
import { useHorecaPrices } from '../store/useHorecaPrices';
import { optimizeProductImageUrl } from '../lib/imageUtils';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

import { QuantityInput } from './QuantityInput';

interface QuickViewModalProps {
  product: Product;
  onClose: () => void;
}

export function QuickViewModal({ product, onClose }: QuickViewModalProps) {
  const { categoryImages } = useSettings();
  const { user } = useAuth();
  const { items, addItem } = useCart();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();

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
  const rememberedPrices = useHorecaPrices((state) => state.prices);

  const currentUnit = currentVariant.unit;
  const cartProductId = currentUnit ? `${product.id}-${currentUnit.trim()}` : product.id;

  const pNameRaw = product.name?.trim();
  const pNameKey = product.name?.toLowerCase().trim();
  const baseIdKey = product.id ? product.id.split('-')[0] : '';
  const pidLower = product.id ? product.id.toLowerCase().trim() : '';
  const cartPidLower = cartProductId ? cartProductId.toLowerCase().trim() : '';
  const baseIdLower = baseIdKey ? baseIdKey.toLowerCase().trim() : '';

  const resolvedHorecaPrice = isHoreca ? resolveHorecaSubunitPrice(product, currentUnit, rememberedPrices) : 0;
  const hasRememberedPrice = isHoreca && resolvedHorecaPrice > 0;

  const currentPrice = isHoreca 
    ? (hasRememberedPrice ? resolvedHorecaPrice : 0)
    : currentVariant.price;
  const currentOriginalPrice = currentVariant.originalPrice;

  const unitConfig = React.useMemo(() => getUnitQuantityConfig(currentUnit), [currentUnit]);
  const step = isHoreca ? 0.5 : unitConfig.step;
  const initialQty = isHoreca ? 0 : unitConfig.initialQty;
  const isDiscrete = unitConfig.isDiscrete;

  const [quantity, setQuantity] = useState(initialQty);

  React.useEffect(() => {
    if (isHoreca) {
      setQuantity(0);
    } else {
      setQuantity(initialQty);
    }
  }, [isHoreca, currentUnit, initialQty]);
  const inWishlist = isInWishlist(product.id!);
  const rawProductImgSrc = product.imageUrl || getCategoryImage(product.category, categoryImages) || undefined;
  const productImgSrc = optimizeProductImageUrl(rawProductImgSrc, 600);

  const handleAddToCart = () => {
    if (product) {
      if (quantity <= 0) return;
      addItem({ ...product, id: cartProductId, price: currentPrice, originalPrice: isHoreca ? 0 : currentOriginalPrice, unit: currentUnit }, quantity);
      toast.success(`${quantity} ${product.name} added to cart!`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-background border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col md:flex-row">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-background/80 backdrop-blur-sm text-foreground hover:bg-secondary rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Image Section */}
        <div className="w-full md:w-1/2 h-40 sm:h-56 md:h-auto shrink-0 bg-white border-b md:border-b-0 md:border-r border-border relative flex items-center justify-center">
          {product.inStock === false && (
            <div className="absolute top-4 left-4 z-20">
              <span className="bg-black text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-md shadow-md">
                OUT OF STOCK
              </span>
            </div>
          )}
          <img 
            src={productImgSrc} 
            alt={product.name}
            loading="eager"
            decoding="async"
            onError={(e) => {
              const catImg = getCategoryImage(product.category, categoryImages);
              if (catImg && e.currentTarget.src !== catImg) {
                e.currentTarget.src = catImg;
              }
            }}
            className={`w-full h-full object-contain object-center transition-all duration-300 ${product.inStock === false ? 'grayscale opacity-75' : ''}`}
            referrerPolicy="no-referrer"
          />
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
            className="absolute top-3 left-3 md:top-4 md:left-4 p-2 z-10 bg-background/80 backdrop-blur-sm rounded-full transition-transform active:scale-90"
          >
            <Heart className={`w-4 h-4 md:w-5 md:h-5 ${inWishlist ? 'fill-red-500 text-red-500' : 'text-foreground'}`} />
          </button>
        </div>

        {/* Details Section */}
        <div className="w-full md:w-1/2 p-4 md:p-8 flex flex-col h-full overflow-y-auto">
          <div className="mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground uppercase mb-2">
              {product.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
              <span className="text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-secondary px-2 py-1 rounded">
                {product.category}
              </span>
              {!product.inStock && (
                <span className="text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded">
                  Out of Stock
                </span>
              )}
            </div>
            
            {isHoreca ? (
              <div className="flex items-center gap-2 mb-4 md:mb-6">
                {hasRememberedPrice ? (
                  <div className="flex flex-col gap-1">
                    <div className="text-2xl md:text-3xl font-black text-foreground">₹{currentPrice}</div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold self-start">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Last Price ({currentUnit || '1KG'})</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="text-2xl md:text-3xl font-black text-primary">₹0</div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20 text-xs font-bold self-start">
                      <Building2 className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                      <span>CUSTOM B2B PRICE ({currentUnit || '1KG'})</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-end gap-2 md:gap-3 mb-4 md:mb-6">
                <div className="text-2xl md:text-3xl font-black text-primary">₹{currentPrice}</div>
                {currentOriginalPrice && currentOriginalPrice > currentPrice && (
                  <div className="text-base md:text-lg font-bold text-muted-foreground line-through mb-1">
                    ₹{currentOriginalPrice}
                  </div>
                )}
              </div>
            )}

            {allVariants.length > 1 ? (
              <div className="flex flex-wrap gap-2 mb-4 md:mb-6">
                {allVariants.map((v, idx) => {
                  const vDisplayUnit = formatDisplayUnit(v.unit);
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedVariantIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] md:text-[10px] uppercase tracking-wider font-bold transition-colors border ${
                        selectedVariantIdx === idx 
                          ? 'bg-primary text-white border-primary' 
                          : 'bg-transparent text-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {vDisplayUnit}
                    </button>
                  );
                })}
              </div>
            ) : currentUnit && (
              <div className="mb-4 md:mb-6 text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-muted-foreground border border-border px-3 py-1.5 rounded-lg inline-block">
                Pack / Unit Size: <span className="text-foreground ml-1">{formatDisplayUnit(currentUnit)}</span>
              </div>
            )}

            {product.description && (
              <p className="text-[11px] md:text-xs text-muted-foreground leading-relaxed mb-4 md:mb-6 line-clamp-3 md:line-clamp-none">
                {product.description}
              </p>
            )}
          </div>

          <div className="mt-auto space-y-4 md:space-y-6">
            <div className="flex items-center justify-between border-t border-border pt-4 md:pt-6">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Quantity</span>
                <span className="text-[9px] text-primary font-bold mt-1">Total: {quantity * parseUnitScale(currentUnit)} {getBaseUnit(currentUnit)}</span>
              </div>
              <div className="flex items-center border border-border rounded-xl overflow-hidden p-1">
                {(() => {
                  const minQty = isHoreca ? 0.01 : unitConfig.initialQty;
                  return (
                    <>
                      <button 
                        onClick={() => {
                          if (quantity <= minQty + 0.001) {
                            setQuantity(minQty);
                          } else {
                            setQuantity(safeSubtractQuantity(quantity, step, isDiscrete, minQty));
                          }
                        }}
                        className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-foreground transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <div className="flex items-center">
                        <QuantityInput
                          initialQuantity={quantity}
                          isHoreca={isHoreca}
                          minQuantity={minQty}
                          isDiscrete={isDiscrete}
                          className="w-12 text-center text-xs font-black text-foreground bg-transparent outline-none border-b border-dashed border-foreground/30 focus:border-primary mx-1 py-1"
                          onUpdate={(val) => setQuantity(val)}
                          onRemove={() => setQuantity(isHoreca ? 0.01 : initialQty)}
                        />
                        <span className="text-[10px] font-bold text-muted-foreground ml-1 mr-2">x</span>
                      </div>
                      <button 
                        onClick={() => setQuantity(safeAddQuantity(quantity, step, isDiscrete))}
                        className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-foreground transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            <button 
              onClick={handleAddToCart}
              disabled={(!product.inStock && !isHoreca) || quantity < (isHoreca ? 0.01 : unitConfig.initialQty)}
              className="w-full py-4 rounded-xl bg-primary text-white font-sans text-xs uppercase font-black tracking-widest transition-colors hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
            >
              <ShoppingBag className="w-4 h-4" />
              {product.inStock ? 'Checkout to Basket' : isHoreca ? 'Request Requirement (Out of Stock)' : 'Out of Stock'}
            </button>
            
            <div className="text-center pt-2">
              <Link 
                to={`/product/${product.id}`}
                onClick={onClose}
                className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
              >
                View Full Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
