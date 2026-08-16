import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useSettings } from '../store/useSettings';

interface SectionDividerProps {
  className?: string;
  variant?: 'line' | 'wave' | 'badge';
}

export function SectionDivider({ className = '', variant = 'wave' }: SectionDividerProps) {
  const { faviconUrl } = useSettings();
  const [logoError, setLogoError] = useState(false);

  if (variant === 'line') {
    return (
      <div className={`w-full flex justify-center py-6 sm:py-8 overflow-hidden select-none pointer-events-none ${className}`}>
        <motion.div
          initial={{ width: "0%", opacity: 0 }}
          whileInView={{ width: "80%", opacity: 1 }}
          viewport={{ once: true, margin: "-20px" }}
          transition={{ duration: 1.5, ease: [0.25, 1, 0.5, 1] }}
          className="h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent relative w-full"
        >
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            className="absolute top-0 bottom-0 left-0 w-40 bg-gradient-to-r from-transparent via-primary/45 to-transparent"
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`w-full flex items-center justify-center py-6 sm:py-10 overflow-hidden select-none pointer-events-none ${className}`}>
      <div className="w-full max-w-5xl mx-auto px-4 flex items-center gap-4">
        {/* Left flowing wave curve */}
        <div className="flex-1 h-5 overflow-hidden">
          <svg 
            viewBox="0 0 400 20" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg" 
            className="w-full h-full text-primary/30"
            preserveAspectRatio="none"
          >
            <path 
              d="M0 10 Q 50 2, 100 10 T 200 10 T 300 10 T 400 10" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
            <path 
              d="M0 10 Q 50 18, 100 10 T 200 10 T 300 10 T 400 10" 
              stroke="currentColor" 
              strokeWidth="1" 
              strokeLinecap="round"
              strokeDasharray="3 3"
              className="text-primary/20"
            />
          </svg>
        </div>

        {/* Center FNL Logo Badge */}
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border border-primary/25 shadow-sm p-1 flex items-center justify-center shrink-0 overflow-hidden"
        >
          {!logoError ? (
            <img 
              src={faviconUrl || '/icon.png'} 
              alt="FNL Logo" 
              onError={() => setLogoError(true)}
              className="w-full h-full object-contain rounded-full"
            />
          ) : (
            <span className="text-[10px] font-black text-primary tracking-tighter">FNL</span>
          )}
        </motion.div>

        {/* Right flowing wave curve */}
        <div className="flex-1 h-5 overflow-hidden">
          <svg 
            viewBox="0 0 400 20" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg" 
            className="w-full h-full text-primary/30"
            preserveAspectRatio="none"
          >
            <path 
              d="M0 10 Q 50 18, 100 10 T 200 10 T 300 10 T 400 10" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
            <path 
              d="M0 10 Q 50 2, 100 10 T 200 10 T 300 10 T 400 10" 
              stroke="currentColor" 
              strokeWidth="1" 
              strokeLinecap="round"
              strokeDasharray="3 3"
              className="text-primary/20"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

