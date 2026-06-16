import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Trash2 } from 'lucide-react';
import { useWishlist } from '../store/useWishlist';
import { useCart } from '../store/useCart';
import { ProductCard } from '../components/ProductCard';

export function Wishlist() {
  const { items, clearWishlist } = useWishlist();
  const { addItem } = useCart();

  const handleAddToCart = (product: any) => {
    if (product.inStock) {
      addItem(product);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 w-full min-h-[60vh]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 sm:mb-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-sans font-black text-3xl sm:text-4xl text-foreground tracking-tight flex items-center gap-3">
            <Heart className="w-8 h-8 text-foreground" />
            Wishlist
          </h1>
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {items.length} {items.length === 1 ? 'Item' : 'Items'} Saved
          </p>
        </div>

        {items.length > 0 && (
          <button 
            onClick={clearWishlist}
            className="flex items-center justify-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border border-border rounded-full hover:bg-secondary w-fit"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 bg-background border border-border border-dashed rounded-3xl text-center">
          <div className="w-20 h-20 bg-secondary/50 rounded-full flex flex-col items-center justify-center mb-6">
            <Heart className="w-8 h-8 text-muted-foreground stroke-[1.5px]" />
          </div>
          <h2 className="font-sans text-xl font-black tracking-tight mb-2 text-foreground">Your wishlist is empty</h2>
          <p className="text-muted-foreground text-sm font-medium mb-8 max-w-sm">
            Save items you love to your wishlist to easily find them later.
          </p>
          <Link to="/shop" className="slice-btn-primary px-8 py-4 text-[10px] sm:text-xs flex items-center gap-2 group mt-2">
            Explore Shop
            <svg 
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:translate-x-1" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {items.map((product) => (
            <ProductCard 
              key={product.id} 
              product={product} 
              onAddToCart={() => handleAddToCart(product)} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
