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
    <div className={`p-4 sm:p-5 rounded-2xl bg-[#fbfdfb] border border-emerald-900/10 shadow-xs transition-all ${className}`}>
      {/* Top Single Row: Message & Action */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            isUnlocked ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
          }`}>
            {isUnlocked ? (
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            ) : (
              <Truck className="w-3.5 h-3.5" />
            )}
          </div>
          
          <div className="text-xs sm:text-sm font-medium text-foreground">
            {isUnlocked ? (
              <span className="font-bold text-primary">
                You've unlocked Free Delivery!
              </span>
            ) : (
              <span>
                Add <span className="font-bold text-primary font-mono">₹{remaining.toFixed(0)}</span> more for <span className="font-bold text-foreground">Free Delivery</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Link or Qualified Tag */}
        {isUnlocked ? (
          <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-2.5 py-1 rounded-full">
            Unlocked
          </span>
        ) : showShopLink ? (
          <Link 
            to="/shop" 
            className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1 hover:underline shrink-0"
          >
            <span>+ Add items</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        ) : null}
      </div>

      {/* Slim Modern Progress Track */}
      <div className="w-full h-1.5 rounded-full bg-emerald-950/5 overflow-hidden">
        <motion.div 
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}


