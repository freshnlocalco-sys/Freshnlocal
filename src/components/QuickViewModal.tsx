import React, { useState } from 'react';
import { X, Heart, Plus, Minus, ShoppingBag } from 'lucide-react';
import { Product, useCart } from '../store/useCart';
import { useWishlist } from '../store/useWishlist';
import { useAuth } from '../lib/firebase';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { calculateHorecaPrice, getBaseUnit, parseUnitScale } from '../lib/horecaUtils';
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

  const isHoreca = user?.role === 'horeca';
  const currentUnit = isHoreca && currentVariant.horecaPrice ? (currentVariant.horecaUnit || '1KG') : currentVariant.unit;
  const currentPrice = isHoreca && currentVariant.horecaPrice ? calculateHorecaPrice(currentVariant.horecaPrice, currentUnit) : currentVariant.price;
  const currentOriginalPrice = currentVariant.originalPrice;
  const cartProductId = currentUnit ? `${product.id}-${currentUnit.trim()}` : product.id;

  const [quantity, setQuantity] = useState(1);
  const inWishlist = isInWishlist(product.id!);
  const productImgSrc = product.imageUrl || getCategoryImage(product.category, categoryImages) || undefined;

  const handleAddToCart = () => {
    if (product) {
      if (quantity <= 0) return;
      addItem({ ...product, id: cartProductId, price: currentPrice, originalPrice: currentOriginalPrice, unit: currentUnit }, quantity);
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
        <div className="w-full md:w-1/2 aspect-square md:aspect-auto bg-white border-b md:border-b-0 md:border-r border-border relative">
          <img 
            src={productImgSrc} 
            alt={product.name}
            className="w-full h-full object-contain object-center"
          />
          <button
            onClick={() => inWishlist ? removeFromWishlist(product.id!) : addToWishlist(product)}
            className="absolute top-4 left-4 p-2 z-10 bg-background/80 backdrop-blur-sm rounded-full transition-transform active:scale-90"
          >
            <Heart className={`w-5 h-5 ${inWishlist ? 'fill-red-500 text-red-500' : 'text-foreground'}`} />
          </button>
        </div>

        {/* Details Section */}
        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col h-full overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-black tracking-tight text-foreground uppercase mb-2">
              {product.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-secondary px-2 py-1 rounded">
                {product.category}
              </span>
              {!product.inStock && (
                <span className="text-[10px] uppercase tracking-wider font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded">
                  Out of Stock
                </span>
              )}
            </div>
            
            <div className="flex items-end gap-3 mb-6">
              <div className="text-3xl font-black text-primary">₹{currentPrice}</div>
              {currentOriginalPrice && currentOriginalPrice > currentPrice && (
                <div className="text-lg font-bold text-muted-foreground line-through mb-1">
                  ₹{currentOriginalPrice}
                </div>
              )}
            </div>

            {allVariants.length > 1 ? (
              <div className="flex flex-wrap gap-2 mb-6">
                {allVariants.map((v, idx) => {
                  const vDisplayUnit = isHoreca && v.horecaPrice ? (v.horecaUnit || '1KG') : v.unit;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedVariantIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-colors border ${
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
              <div className="mb-6 text-[10px] uppercase tracking-wider font-bold text-muted-foreground border border-border px-3 py-1.5 rounded-lg inline-block">
                Pack / Unit Size: <span className="text-foreground ml-1">{currentUnit}</span>
              </div>
            )}

            {product.description && (
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                {product.description}
              </p>
            )}
          </div>

          <div className="mt-auto space-y-6">
            <div className="flex items-center justify-between border-t border-border pt-6">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Quantity</span>
                <span className="text-[9px] text-primary font-bold mt-1">Total: {quantity * parseUnitScale(currentUnit)} {getBaseUnit(currentUnit)}</span>
              </div>
              <div className="flex items-center border border-border rounded-xl overflow-hidden p-1">
                <button 
                  onClick={() => setQuantity(Math.max(isHoreca ? 0.01 : 1, quantity - (isHoreca ? 0.5 : 1)))}
                  className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-foreground transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <div className="flex items-center">
                  <QuantityInput
                    initialQuantity={quantity}
                    isHoreca={isHoreca}
                    className="w-12 text-center text-xs font-black text-foreground bg-transparent outline-none border-b border-dashed border-foreground/30 focus:border-primary mx-1 py-1"
                    onUpdate={(val) => setQuantity(val)}
                    onRemove={() => setQuantity(isHoreca ? 0.01 : 1)}
                  />
                  <span className="text-[10px] font-bold text-muted-foreground ml-1 mr-2">x</span>
                </div>
                <button 
                  onClick={() => setQuantity(quantity + (isHoreca ? 0.5 : 1))}
                  className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            <button 
              onClick={handleAddToCart}
              disabled={!product.inStock || quantity <= 0}
              className="w-full py-4 rounded-xl bg-primary text-white font-sans text-xs uppercase font-black tracking-widest transition-colors hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
            >
              <ShoppingBag className="w-4 h-4" />
              {product.inStock ? 'Checkout to Basket' : 'Out of Stock'}
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
