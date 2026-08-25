import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles, Check, Truck } from 'lucide-react';
import { useCart } from '../store/useCart';
import { motion, AnimatePresence } from 'motion/react';

interface StickyMiniCartBarProps {
  freeDeliveryThreshold?: number;
}

export function StickyMiniCartBar({ freeDeliveryThreshold = 1000 }: StickyMiniCartBarProps) {
  const location = useLocation();
  const { items, total } = useCart();
  const [pulse, setPulse] = useState(false);
  const [showCelebrationBanner, setShowCelebrationBanner] = useState(false);
  const prevCountRef = useRef(0);
  const prevUnlockedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Active non-zero items
  const validItems = items.filter((item) => item && item.product && item.quantity > 0);
  const itemCount = validItems.reduce((acc, item) => acc + (item.quantity > 0 ? 1 : 0), 0);
  const totalAmount = total();
  const isUnlocked = totalAmount >= freeDeliveryThreshold;

  // Extract up to 3 most recently added product thumbnails
  const recentThumbnails = validItems
    .map((it) => it.product)
    .filter((p) => Boolean(p && p.imageUrl))
    .slice(-3)
    .reverse();

  // Detect item addition pulse
  useEffect(() => {
    if (itemCount > prevCountRef.current && prevCountRef.current !== 0) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 400);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = itemCount;
  }, [itemCount]);

  // Detect when Free Delivery is freshly unlocked and trigger celebratory slide
  useEffect(() => {
    if (isUnlocked && !prevUnlockedRef.current && prevCountRef.current > 0) {
      setShowCelebrationBanner(true);
      const timer = setTimeout(() => setShowCelebrationBanner(false), 3200);
      return () => clearTimeout(timer);
    }
    prevUnlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  // Hide on cart or checkout pages or when empty
  const isHiddenRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/admin');
  const isVisible = mounted && itemCount > 0 && !isHiddenRoute;

  if (!mounted) return null;

  const content = (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '0',
        right: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999999,
        pointerEvents: 'none',
        paddingLeft: '16px',
        paddingRight: '16px',
      }}
    >
      <AnimatePresence>
        {isVisible && (
          <motion.div
            key="instamart-floating-cart"
            initial={{ y: 60, opacity: 0, scale: 0.92 }}
            animate={{
              y: 0,
              opacity: 1,
              scale: pulse ? 1.035 : 1,
            }}
            exit={{ y: 60, opacity: 0, scale: 0.92 }}
            transition={{
              type: 'spring',
              damping: 26,
              stiffness: 360,
            }}
            style={{
              pointerEvents: 'auto',
              userSelect: 'none',
            }}
          >
            {/* Pill Container - Frosted Dark Glass with Cool Electric Green Accents */}
            <Link
              to="/cart"
              className="relative flex items-center bg-[#061c0f]/80 hover:bg-[#092716]/85 backdrop-blur-xl border border-emerald-500/40 text-white rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.6),0_0_24px_rgba(16,185,129,0.2)] active:scale-[0.98] transition-all overflow-hidden h-[58px] min-w-[300px] sm:min-w-[340px] max-w-[94vw]"
            >
              {/* Glass Top Specular Highlight */}
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent pointer-events-none" />

              {/* Product Thumbnails Stack */}
              <div className="flex items-center -space-x-3 shrink-0 pl-3 pr-2.5">
                <AnimatePresence initial={false}>
                  {recentThumbnails.map((prod, idx) => (
                    <motion.div
                      key={prod.id || idx}
                      initial={{ scale: 0.2, x: -12, opacity: 0 }}
                      animate={{ scale: 1, x: 0, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 380 }}
                      className="relative w-9 h-9 rounded-full border border-white bg-emerald-950 shadow-md overflow-hidden shrink-0 ring-2 ring-[#00FF87] shadow-[0_0_10px_rgba(0,255,135,0.7)]"
                      style={{ zIndex: 10 - idx }}
                    >
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Text & Price Info - Frosted Dark Glass & Cool Green Styling */}
              <div className="flex flex-col justify-center flex-1 min-w-0 pr-3 pl-1">
                {/* Main Row: CART · ₹Price */}
                <div className="flex items-baseline gap-1.5 leading-none">
                  <span className="font-extrabold text-xs tracking-widest uppercase text-emerald-100/90">
                    Cart
                  </span>
                  <span className="text-emerald-500/50 text-xs font-bold">·</span>
                  <span className="font-black text-[16px] text-[#00FF87] tracking-tight drop-shadow-[0_0_12px_rgba(0,255,135,0.45)]">
                    ₹{totalAmount.toFixed(0)}
                  </span>
                </div>

                {/* Sub Row: Item count badge + status */}
                <div className="flex items-center gap-1.5 mt-1 leading-none">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={itemCount}
                      initial={{ y: 3, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -3, opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="font-bold text-[10px] text-emerald-200/90 uppercase tracking-wider bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-full"
                    >
                      {itemCount} {itemCount === 1 ? 'ITEM' : 'ITEMS'}
                    </motion.span>
                  </AnimatePresence>

                  {isUnlocked && (
                    <span className="inline-flex items-center text-[10px] font-extrabold text-emerald-950 bg-[#00FF87] px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(0,255,135,0.3)]">
                      FREE DELIVERY
                    </span>
                  )}
                </div>
              </div>

              {/* Right Action Button - Glowing Cool Emerald */}
              <div className="mr-2.5 w-9 h-9 rounded-full bg-[#00FF87] hover:bg-[#20ff96] active:scale-95 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(0,255,135,0.35)] transition-all">
                <ArrowRight className="w-4 h-4 text-emerald-950 stroke-[3]" />
              </div>

              {/* Celebratory Slide-Over Banner */}
              <AnimatePresence>
                {showCelebrationBanner && (
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                    className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 flex items-center justify-between px-4 z-20 shadow-inner"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-[12.5px] text-white tracking-tight leading-tight">
                          Free Delivery Unlocked!
                        </span>
                        <span className="text-[10px] font-medium text-emerald-100 leading-tight">
                          Eligible for fast delivery in Surat
                        </span>
                      </div>
                    </div>

                    <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center shrink-0 ml-2">
                      <Check className="w-4 h-4 text-white stroke-[3]" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return createPortal(content, document.body);
}
