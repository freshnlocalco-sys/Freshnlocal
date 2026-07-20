import React from 'react';
import { motion } from 'motion/react';

interface SectionDividerProps {
  className?: string;
}

export function SectionDivider({ className = '' }: SectionDividerProps) {
  return (
    <div className={`w-full flex justify-center py-6 sm:py-8 overflow-hidden select-none pointer-events-none ${className}`}>
      <motion.div
        initial={{ width: "0%", opacity: 0 }}
        whileInView={{ width: "80%", opacity: 1 }}
        viewport={{ once: true, margin: "-20px" }}
        transition={{ duration: 1.5, ease: [0.25, 1, 0.5, 1] }}
        className="h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent relative w-full"
      >
        {/* Subtle shimmer effect moving across the divider */}
        <motion.div
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          className="absolute top-0 bottom-0 left-0 w-40 bg-gradient-to-r from-transparent via-primary/45 to-transparent"
        />
      </motion.div>
    </div>
  );
}
