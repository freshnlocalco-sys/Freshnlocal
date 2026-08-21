import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useDeliveryLocation } from '../store/useDeliveryLocation';

interface DeliveryLocationBadgeProps {
  className?: string;
}

export const DeliveryLocationBadge: React.FC<DeliveryLocationBadgeProps> = ({ 
  className = '' 
}) => {
  const { selectedLocation, openLocationModal } = useDeliveryLocation();

  return (
    <button
      type="button"
      onClick={openLocationModal}
      className={`group flex items-center gap-1 text-left cursor-pointer transition-all duration-150 focus:outline-none py-1 px-1 sm:px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${className}`}
      title="Click to select delivery area in Surat"
      aria-label="Select delivery area in Surat"
    >
      <div className="flex items-center gap-1 font-bold text-xs min-[360px]:text-sm sm:text-base text-foreground max-w-[90px] min-[360px]:max-w-[120px] md:max-w-[200px] lg:max-w-[280px]">
        <span className="truncate border-b border-foreground group-hover:border-primary group-hover:text-primary transition-colors pb-0.5">
          {selectedLocation ? selectedLocation.areaName : 'Select Area'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0 transition-transform group-hover:translate-y-0.5" />
      </div>
    </button>
  );
};

