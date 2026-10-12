import React from 'react';
import { Truck, Check, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

interface FreeDeliveryProgressBarProps {
  currentTotal: number;
  threshold?: number;
  isHoreca?: boolean;
  className?: string;
  showShopLink?: boolean;
}

export function FreeDeliveryProgressBar({
  currentTotal,
  threshold = 1000,
  isHoreca = false,
  className = '',
  showShopLink = true,
}: FreeDeliveryProgressBarProps) {
  if (isHoreca) {
    return (
      <div className={`p-4 rounded-xl bg-[#f8faf8] border border-primary/15 flex items-center justify-between text-xs ${className}`}>
        <div className="flex items-center gap-2.5 text-foreground">
          <Truck className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-[#1a2e1f]">Commercial Delivery Active</span>
          <span className="text-muted-foreground text-[11px]">— Scheduled B2B logistics for HoReCa</span>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, threshold - currentTotal);
  const percentage = Math.min(100, Math.max(0, Math.round((currentTotal / threshold) * 100)));
  const isUnlocked = currentTotal >= threshold;

  return (
    <div className={`p-4 sm:p-5 rounded-2xl bg-primary/[0.04] dark:bg-primary/[0.08] border border-primary/20 shadow-xs transition-all ${className}`}>
      {/* Top Single Row: Message & Action */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            isUnlocked ? 'bg-primary text-white shadow-2xs' : 'bg-primary/15 text-primary'
          }`}>
            {isUnlocked ? (
              <Check className="w-4 h-4 stroke-[3]" />
            ) : (
              <Truck className="w-4 h-4 stroke-[2.5]" />
            )}
          </div>
          
          <div className="text-sm sm:text-base font-bold text-foreground leading-snug">
            {isUnlocked ? (
              <span className="font-bold text-primary">
                Minimum order met — You can place your order!
              </span>
            ) : (
              <span>
                Add <span className="font-black text-primary font-mono text-base sm:text-lg">₹{remaining.toFixed(0)}</span> more for <span className="font-black text-foreground">Place Order</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Link or Qualified Tag */}
        {isUnlocked ? (
          <span className="text-[10px] sm:text-xs font-black text-primary uppercase tracking-wider bg-primary/10 border border-primary/25 px-2.5 py-1 rounded-full shrink-0">
            Eligible
          </span>
        ) : showShopLink ? (
          <Link 
            to="/shop" 
            className="text-xs sm:text-sm font-black text-primary hover:text-primary/80 inline-flex items-center gap-1 hover:underline shrink-0"
          >
            <span>+ Add items</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : null}
      </div>

      {/* Slim Modern Progress Track with moving delivery truck */}
      <div className="relative w-full pt-1.5 pb-1">
        <div className="w-full h-2 rounded-full bg-emerald-950/10 dark:bg-white/10 overflow-hidden">
          <motion.div 
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Animated Moving Delivery Truck Icon on the line */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -ml-3 z-10 flex items-center justify-center pointer-events-none"
          initial={{ left: '0%' }}
          animate={{ left: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="w-6 h-6 rounded-full bg-white dark:bg-zinc-900 border border-primary/40 shadow-xs flex items-center justify-center">
            <Truck className="w-3.5 h-3.5 text-primary stroke-[2.5]" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
