import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, AlertCircle, Check } from 'lucide-react';
import { useDeliveryLocation } from '../store/useDeliveryLocation';
import { SERVICEABLE_ZONES, isPincodeServiceable, searchPlaces } from '../lib/deliveryZones';
import { notifyLocationUpdated } from '../lib/locationNotifications';

export const LocationSelectorModal: React.FC = () => {
  const { 
    isLocationModalOpen, 
    closeLocationModal, 
    selectedLocation, 
    setLocation 
  } = useDeliveryLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset search when modal opens
  useEffect(() => {
    if (isLocationModalOpen) {
      setSearchQuery('');
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    }
  }, [isLocationModalOpen]);

  // Filtered Zones matching searchQuery
  const filteredZones = useMemo(() => {
    if (!searchQuery.trim()) return SERVICEABLE_ZONES;
    const q = searchQuery.toLowerCase().trim();
    return SERVICEABLE_ZONES.filter((z) => {
      return (
        z.pincode.includes(q) ||
        z.mainArea.toLowerCase().includes(q) ||
        z.areas.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [searchQuery]);

  // Specific search result items matching the query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchPlaces(searchQuery);
  }, [searchQuery]);

  // Check if searched query looks like a 6-digit pin outside service zone
  const isInvalidPincode = useMemo(() => {
    const clean = searchQuery.trim().replace(/\D/g, '');
    return clean.length === 6 && !isPincodeServiceable(clean);
  }, [searchQuery]);

  if (!isLocationModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeLocationModal}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
        />

        {/* Modal Window matching FreshNLocal Light Web Theme */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="relative w-full max-w-[560px] bg-white text-zinc-900 border border-zinc-200 rounded-[28px] sm:rounded-[32px] shadow-2xl z-50 overflow-hidden font-sans flex flex-col my-auto max-h-[85vh]"
        >
          {/* Header & Title */}
          <div className="p-5 sm:p-6 pb-4 border-b border-zinc-100 flex items-center justify-between bg-white shrink-0">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 tracking-tight">
                Select Delivery Location
              </h2>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Choose your Surat delivery zone for fresh farm orders
              </p>
            </div>
            <button
              type="button"
              onClick={closeLocationModal}
              className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Search Bar Input */}
          <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/70 flex items-center gap-3 shrink-0">
            <Search className="w-4 h-4 text-zinc-400 shrink-0 stroke-[2]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for area name or pincode..."
              className="w-full bg-transparent border-none text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 p-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>

          {/* Out of zone warning if unserviceable pincode entered */}
          {isInvalidPincode && (
            <div className="p-3.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                <p className="font-bold">Pincode {searchQuery.trim()} is outside our delivery zone</p>
                <p className="text-[11px] mt-0.5">We deliver to key Surat zones (Adajan, Vesu, Althan, Katargam, Rander, Varachha, Dumas, Udhna, etc.). Store pickup is available for all areas.</p>
              </div>
            </div>
          )}

          {/* Section Sub-header */}
          <div className="px-5 pt-3 pb-2 bg-zinc-50/50 border-b border-zinc-100 shrink-0">
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
              {searchQuery ? 'Search Results' : 'Serviceable Surat Areas'}
            </span>
          </div>

          {/* Scrollable Area List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
            {searchQuery.trim() ? (
              searchResults.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  <p className="text-sm font-semibold text-zinc-800">No matching Surat area found</p>
                  <p className="text-xs mt-1 text-zinc-500">Try searching for "Nanpura", "Palanpur", "Adajan", "Vesu", "Katargam", or "395001"</p>
                </div>
              ) : (
                searchResults.map((item) => {
                  const isSelected = selectedLocation?.pincode === item.pincode && selectedLocation?.areaName === item.title;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setLocation(item.pincode, item.title);
                        notifyLocationUpdated({
                          pincode: item.pincode,
                          mainArea: item.mainArea,
                          subAreaText: item.title,
                        });
                        closeLocationModal();
                      }}
                      className={`w-full px-5 py-3.5 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-[#00c853] text-white font-bold'
                          : 'bg-white hover:bg-emerald-50/70 text-zinc-900 font-medium'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={isSelected ? 'text-white font-black text-sm sm:text-base' : 'text-[#00c853] font-bold text-sm sm:text-base'}>
                            {item.pincode}
                          </span>
                          <span className={isSelected ? 'text-white/80' : 'text-zinc-400'}>—</span>
                          <span className={isSelected ? 'text-white font-bold text-sm sm:text-base' : 'text-zinc-900 font-bold text-sm sm:text-base'}>
                            {item.title}
                          </span>
                        </div>
                        <p className={`text-[11px] sm:text-xs leading-relaxed break-words mt-1 ${isSelected ? 'text-white/90' : 'text-zinc-500'}`}>
                          Part of {item.mainArea} delivery zone
                        </p>
                      </div>

                      {isSelected && (
                        <Check className="w-5 h-5 text-white shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })
              )
            ) : filteredZones.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <p className="text-sm font-semibold text-zinc-800">No matching Surat area found</p>
                <p className="text-xs mt-1 text-zinc-500">Try searching for "Nanpura", "Palanpur", "Adajan", "Vesu", "Katargam", or "395001"</p>
              </div>
            ) : (
              filteredZones.map((z) => {
                const isSelected = selectedLocation?.pincode === z.pincode;

                return (
                  <button
                    key={z.pincode}
                    type="button"
                    onClick={() => {
                      setLocation(z.pincode, z.mainArea);
                      notifyLocationUpdated({
                        pincode: z.pincode,
                        mainArea: z.mainArea,
                        subAreaText: z.areas?.slice(0, 3).join(', '),
                      });
                      closeLocationModal();
                    }}
                    className={`w-full px-5 py-3.5 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#00c853] text-white font-bold'
                        : 'bg-white hover:bg-emerald-50/70 text-zinc-900 font-medium'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={isSelected ? 'text-white font-black text-sm sm:text-base' : 'text-[#00c853] font-bold text-sm sm:text-base'}>
                          {z.pincode}
                        </span>
                        <span className={isSelected ? 'text-white/80' : 'text-zinc-400'}>—</span>
                        <span className={isSelected ? 'text-white font-bold text-sm sm:text-base' : 'text-zinc-900 font-bold text-sm sm:text-base'}>
                          {z.mainArea}
                        </span>
                      </div>
                      <p className={`text-[11px] sm:text-xs leading-relaxed break-words mt-1 ${isSelected ? 'text-white/90' : 'text-zinc-500'}`}>
                        ({z.areas.join(', ')})
                      </p>
                    </div>

                    {isSelected && (
                      <Check className="w-5 h-5 text-white shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
