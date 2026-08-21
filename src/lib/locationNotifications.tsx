import React from 'react';
import toast from 'react-hot-toast';
import { MapPin, X, ChevronRight } from 'lucide-react';
import { getZoneByPincode } from './deliveryZones';
import { useDeliveryLocation } from '../store/useDeliveryLocation';

export interface LocationToastOptions {
  pincode: string;
  mainArea: string;
  subAreaText?: string;
}

export function notifyLocationUpdated({ pincode, mainArea }: LocationToastOptions) {
  const zone = getZoneByPincode(pincode);
  const displayMain = mainArea || zone?.mainArea || 'Surat';

  toast.custom(
    (t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } max-w-sm w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg shadow-black/8 pointer-events-auto p-3.5 flex items-center gap-3 transition-all duration-200`}
      >
        {/* Clean Icon Container */}
        <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>

        {/* Text Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              Delivering to <span className="font-bold text-emerald-700 dark:text-emerald-400">{displayMain}</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
              ({pincode})
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Express slots available</span>
          </div>
        </div>

        {/* Action & Dismiss */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              useDeliveryLocation.getState().openLocationModal();
            }}
            className="px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors flex items-center gap-0.5 cursor-pointer"
          >
            Change
            <ChevronRight className="w-3 h-3 text-zinc-400" />
          </button>
          
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
            aria-label="Close notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    ),
    {
      id: 'delivery-location-changed',
      duration: 3500,
      position: 'bottom-right',
    }
  );
}
