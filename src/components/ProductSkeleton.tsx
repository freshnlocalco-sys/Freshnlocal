import React from 'react';

export function ProductSkeleton() {
  return (
    <div className="slice-card h-full animate-pulse border border-border">
      <div className="w-full aspect-[4/3] bg-muted relative shrink-0"></div>
      <div className="p-3 sm:p-5 md:p-6 bg-secondary space-y-3 sm:space-y-4 flex-1 flex flex-col justify-between min-h-[140px] sm:min-h-[160px]">
        <div className="flex flex-col gap-2 w-full mt-2">
          <div className="h-4 bg-muted/60 rounded w-3/4"></div>
          <div className="h-4 bg-muted/60 rounded w-1/2"></div>
        </div>
        <div className="flex items-end justify-between w-full mt-1 sm:mt-2">
          <div className="h-6 bg-muted/80 rounded w-1/3"></div>
        </div>
        <div className="h-10 bg-muted/50 rounded-xl sm:rounded-[14px] w-full mt-auto"></div>
      </div>
    </div>
  );
}
