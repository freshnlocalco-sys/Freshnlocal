import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../store/useCart';
import { motion, AnimatePresence } from 'motion/react';

interface StickyMiniCartBarProps {
  freeDeliveryThreshold?: number;
}

export function StickyMiniCartBar({ freeDeliveryThreshold = 1000 }: StickyMiniCartBarProps) {
  const location = useLocation();
  const { items, total } = useCart();
  const [pulse, setPulse] = useState(false);
  const prevCountRef = useRef(0);

  // Total number of items
  const itemCount = items.reduce((acc, item) => acc + (item.quantity > 0 ? 1 : 0), 0);
  const totalAmount = total();

  // Trigger pulse animation when item count or total increases
  useEffect(() => {
    if (itemCount > prevCountRef.current && prevCountRef.current !== 0) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 500);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = itemCount;
  }, [itemCount, totalAmount]);

  // Hide on cart or checkout pages or when empty
  const isHiddenRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/admin');
  const isVisible = itemCount > 0 && !isHiddenRoute;

  const isUnlocked = totalAmount >= freeDeliveryThreshold;
  const remaining = Math.max(0, freeDeliveryThreshold - totalAmount);
  const progressPercent = Math.min(100, Math.max(0, Math.round((totalAmount / freeDeliveryThreshold) * 100)));

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="sticky-mini-cart"
          initial={{ y: 90, opacity: 0, scale: 0.96 }}
          animate={{ 
            y: 0, 
            opacity: 1, 
            scale: pulse ? 1.02 : 1,
          }}
          exit={{ y: 90, opacity: 0, scale: 0.96 }}
          transition={{ 
            type: 'spring', 
            damping: 24, 
            stiffness: 280,
            scale: { duration: 0.2 }
          }}
          className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[420px] z-50 pointer-events-auto"
        >
          {/* Frosted Glass Container with luminous border */}
          <div className="relative overflow-hidden rounded-3xl bg-white/75 backdrop-blur-2xl border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.05)] text-foreground">
            
            {/* Free Delivery Micro-Progress Bar on top edge */}
            <div className="w-full bg-black/5 h-1.5 relative overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className={`h-full ${isUnlocked ? 'bg-primary' : 'bg-primary/80'}`}
              />
            </div>

            {/* Micro-Progress Sub-header / Status Pill */}
            <div className="px-4 pt-2.5 pb-1 flex items-center justify-between text-[11px] font-bold tracking-wider uppercase">
              <div className="flex items-center gap-1.5">
                {isUnlocked ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-primary font-black flex items-center gap-1">
                      Free Delivery in Surat Unlocked!
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                    <span className="text-primary font-black">
                      Add ₹{remaining.toFixed(0)} more
                    </span>
                    <span className="text-muted-foreground font-semibold">for Free Delivery</span>
                  </>
                )}
              </div>
              <span className="text-[10px] font-bold text-muted-foreground">{progressPercent}%</span>
            </div>

            {/* Main Bar Content */}
            <Link
              to="/cart"
              className="flex items-center justify-between px-4 py-2.5 gap-3 hover:bg-white/60 active:scale-[0.99] transition-all cursor-pointer group"
            >
              {/* Left: Cart Icon & Item Count / Price */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 backdrop-blur-md flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                  <ShoppingBag className="w-4 h-4 text-primary stroke-[2.2]" />
                  <motion.span
                    key={itemCount}
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs"
                  >
                    {itemCount}
                  </motion.span>
                </div>

                <div className="min-w-0 flex flex-col justify-center">
                  <span className="text-base font-black text-foreground tracking-tight leading-none">
                    ₹{totalAmount.toFixed(0)}
                  </span>
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wider mt-0.5 leading-none">
                    {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                  </span>
                </div>
              </div>

              {/* Right: CTA Button */}
              <div className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-primary hover:bg-[#009e45] text-white font-sans text-xs font-black tracking-wider uppercase shadow-[0_4px_16px_rgba(0,186,81,0.3)] group-hover:shadow-[0_6px_20px_rgba(0,186,81,0.4)] transition-all">
                <span>View Cart</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
