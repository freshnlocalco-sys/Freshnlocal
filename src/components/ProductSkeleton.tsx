import React from 'react';

export function ProductSkeleton() {
  return (
    <div className="slice-card h-full flex flex-col justify-between overflow-hidden bg-background rounded-xl border border-border animate-pulse">
      <div className="w-full aspect-[4/3] bg-muted border-b border-border shrink-0" style={{ borderRadius: 'inherit', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}></div>
      <div className="p-2.5 sm:p-3 bg-background flex-1 flex flex-col justify-between">
        <div className="flex flex-col gap-1 w-full">
          <div className="h-3 sm:h-4 bg-muted rounded w-3/4 mb-1"></div>
          <div className="h-2.5 sm:h-3 bg-muted rounded w-1/2"></div>
          <div className="flex items-end justify-between w-full mt-2">
            <div className="h-4 sm:h-5 bg-muted rounded w-1/3"></div>
          </div>
        </div>
        <div className="w-full h-[28px] sm:h-[36px] bg-muted rounded-lg mt-1.5 sm:mt-2.5"></div>
      </div>
    </div>
  );
}
