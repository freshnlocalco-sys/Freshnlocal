import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useSettings } from '../store/useSettings';

interface WaveDividerProps {
  variant?: 'layered' | 'crest' | 'curve' | 'separator' | 'soft-slope';
  fillColor?: string;
  bgColor?: string;
  flip?: boolean;
  className?: string;
  height?: number;
}

export function WaveDivider({
  variant = 'layered',
  fillColor = 'currentColor',
  bgColor,
  flip = false,
  className = '',
  height = 48,
}: WaveDividerProps) {
  const flipStyle = flip ? { transform: 'rotate(180deg)' } : undefined;
  const { faviconUrl } = useSettings();
  const [logoError, setLogoError] = useState(false);

  if (variant === 'separator') {
    return (
      <div className={`w-full flex items-center justify-center py-4 sm:py-6 overflow-hidden select-none pointer-events-none relative ${className}`}>
        <div className="w-full max-w-5xl mx-auto px-4 flex items-center gap-3">
          {/* Left subtle wave trail */}
          <div className="flex-1 h-[24px] overflow-hidden opacity-40">
            <svg 
              viewBox="0 0 400 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg" 
              className="w-full h-full text-primary preserve-3d"
              preserveAspectRatio="none"
            >
              <path 
                d="M0 12 Q 50 2, 100 12 T 200 12 T 300 12 T 400 12" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round"
                strokeDasharray="4 4"
                className="text-primary/40"
              />
              <path 
                d="M0 12 Q 50 20, 100 12 T 200 12 T 300 12 T 400 12" 
                stroke="currentColor" 
                strokeWidth="1.2" 
                strokeLinecap="round"
                className="text-primary/60"
              />
            </svg>
          </div>

          {/* Central FNL Logo Badge */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border border-primary/25 shadow-sm p-1 shrink-0 overflow-hidden"
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

          {/* Right subtle wave trail */}
          <div className="flex-1 h-[24px] overflow-hidden opacity-40">
            <svg 
              viewBox="0 0 400 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg" 
              className="w-full h-full text-primary"
              preserveAspectRatio="none"
            >
              <path 
                d="M0 12 Q 50 22, 100 12 T 200 12 T 300 12 T 400 12" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round"
                strokeDasharray="4 4"
                className="text-primary/40"
              />
              <path 
                d="M0 12 Q 50 4, 100 12 T 200 12 T 300 12 T 400 12" 
                stroke="currentColor" 
                strokeWidth="1.2" 
                strokeLinecap="round"
                className="text-primary/60"
              />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'crest') {
    return (
      <div 
        className={`w-full overflow-hidden leading-none select-none pointer-events-none ${className}`} 
        style={{ height: `${height}px`, ...flipStyle }}
      >
        <svg 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none" 
          className="relative block w-full h-full"
        >
          {/* Soft background wave glow */}
          <path 
            d="M0,0 C150,90 350,-40 500,60 C650,140 900,10 1200,40 L1200,120 L0,120 Z" 
            fill={fillColor}
            className="opacity-25"
          />
          {/* Secondary wave layer */}
          <path 
            d="M0,20 C300,110 450,20 650,80 C850,130 1050,40 1200,70 L1200,120 L0,120 Z" 
            fill={fillColor}
            className="opacity-50"
          />
          {/* Foreground primary wave */}
          <path 
            d="M0,50 C200,110 400,30 700,90 C950,140 1100,50 1200,80 L1200,120 L0,120 Z" 
            fill={fillColor}
          />
        </svg>
      </div>
    );
  }

  if (variant === 'soft-slope') {
    return (
      <div 
        className={`w-full overflow-hidden leading-none select-none pointer-events-none ${className}`} 
        style={{ height: `${height}px`, ...flipStyle }}
      >
        <svg 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none" 
          className="relative block w-full h-full"
        >
          {/* Deep layered gentle curve */}
          <path 
            d="M0,0 C400,100 800,20 1200,80 L1200,120 L0,120 Z" 
            fill={fillColor}
            className="opacity-30"
          />
          <path 
            d="M0,30 C300,120 700,40 1200,100 L1200,120 L0,120 Z" 
            fill={fillColor}
          />
        </svg>
      </div>
    );
  }

  if (variant === 'curve') {
    return (
      <div 
        className={`w-full overflow-hidden leading-none select-none pointer-events-none ${className}`} 
        style={{ height: `${height}px`, ...flipStyle }}
      >
        <svg 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none" 
          className="relative block w-full h-full"
        >
          <path 
            d="M0,0 C300,90 900,90 1200,0 L1200,120 L0,120 Z" 
            fill={fillColor} 
          />
        </svg>
      </div>
    );
  }

  // Default: 'layered' organic waving ribbons
  return (
    <div 
      className={`w-full overflow-hidden leading-none select-none pointer-events-none ${className}`} 
      style={{ height: `${height}px`, ...flipStyle }}
    >
      <svg 
        viewBox="0 0 1440 96" 
        preserveAspectRatio="none" 
        className="relative block w-full h-full"
      >
        {/* Layer 1 - Light tint shadow wave */}
        <path 
          d="M0,32 C240,70 480,10 720,45 C960,80 1200,25 1440,50 L1440,96 L0,96 Z" 
          fill={fillColor}
          className="opacity-25"
        />
        {/* Layer 2 - Mid tint wave */}
        <path 
          d="M0,50 C320,15 640,75 960,35 C1200,65 1360,20 1440,42 L1440,96 L0,96 Z" 
          fill={fillColor}
          className="opacity-45"
        />
        {/* Layer 3 - Solid front wave */}
        <path 
          d="M0,64 C280,30 560,80 840,48 C1120,78 1320,40 1440,60 L1440,96 L0,96 Z" 
          fill={fillColor}
        />
      </svg>
    </div>
  );
}
