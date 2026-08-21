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
      className={`group flex items-center gap-1 sm:gap-2 text-left cursor-pointer transition-all duration-150 focus:outline-none py-1 px-1.5 sm:px-2 rounded-lg hover:bg-black/5 ${className}`}
      title="Click to select delivery area in Surat"
      aria-label="Select delivery area in Surat"
    >
      <div className="flex flex-col text-left leading-none min-w-0 max-w-[70px] min-[360px]:max-w-[90px] min-[400px]:max-w-[120px] sm:max-w-[190px] md:max-w-[220px]">
        {/* Main Area name with signature underline */}
        <div className="flex items-center gap-0.5 sm:gap-1 font-bold text-[11px] min-[360px]:text-xs sm:text-[13px] text-zinc-900">
          <span className="truncate border-b border-zinc-900 group-hover:border-[#00b853] group-hover:text-[#00b853] transition-colors pb-0.5">
            {selectedLocation ? selectedLocation.areaName : 'Other'}
          </span>
          <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#00b853] shrink-0 transition-transform group-hover:translate-y-0.5" />
        </div>

        {/* Locality & city subtitle (Hidden on mobile to save space, visible from sm screen onwards) */}
        <span className="text-[10px] sm:text-[11px] text-zinc-500 font-normal truncate mt-1 hidden sm:block">
          {selectedLocation ? `${selectedLocation.pincode}, Surat, Gujarat` : 'Surat, Gujarat, India'}
        </span>
      </div>
    </button>
  );
};
