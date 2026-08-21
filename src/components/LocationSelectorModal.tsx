import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, ArrowLeft, AlertCircle, ShieldAlert, Check } from 'lucide-react';
import { useDeliveryLocation } from '../store/useDeliveryLocation';
import { searchPlaces, SearchResultItem, isPincodeServiceable, SERVICEABLE_ZONES } from '../lib/deliveryZones';
import { useAuth } from '../lib/firebase';
import { toast } from 'react-hot-toast';

export const LocationSelectorModal: React.FC = () => {
  const { 
    isLocationModalOpen, 
    closeLocationModal, 
    selectedLocation, 
    setLocation 
  } = useDeliveryLocation();

  const { user } = useAuth();

  // Modes: 'prompt' | 'search' | 'permission-denied'
  const [viewMode, setViewMode] = useState<'prompt' | 'search' | 'permission-denied'>('prompt');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset states whenever modal opens
  useEffect(() => {
    if (isLocationModalOpen) {
      setViewMode('prompt');
      setSearchQuery('');
    }
  }, [isLocationModalOpen]);

  // Auto-focus input when entering search mode
  useEffect(() => {
    if (viewMode === 'search' && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [viewMode]);

  // Search Results
  const results = useMemo(() => {
    return searchPlaces(searchQuery);
  }, [searchQuery]);

  // Check if searched query looks like a 6-digit pin outside service zone
  const isInvalidPincode = useMemo(() => {
    const clean = searchQuery.trim().replace(/\D/g, '');
    return clean.length === 6 && !isPincodeServiceable(clean);
  }, [searchQuery]);

  const handleSelect = (item: SearchResultItem) => {
    setLocation(item.pincode, item.title);
    toast.success(`Delivery location: ${item.title} (${item.pincode})`, {
      icon: '📍',
      duration: 3000,
    });
    closeLocationModal();
  };

  // Browser Real GPS Geolocation & Live Reverse Geocoding Handler
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // Perform real live reverse geocoding via OpenStreetMap Nominatim
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'FreshNLocalApp/1.0',
              },
            }
          );

          if (res.ok) {
            const data = await res.json();
            const address = data.address || {};

            const detectedPincode = address.postcode ? address.postcode.replace(/\D/g, '') : '';
            const detectedArea = 
              address.suburb || 
              address.neighbourhood || 
              address.residential || 
              address.city_district || 
              address.road || 
              address.village || 
              address.town || 
              address.city || 
              'Surat';

            const isSurat = (data.display_name && data.display_name.toLowerCase().includes('surat')) || 
              (latitude >= 21.0 && latitude <= 21.35 && longitude >= 72.65 && longitude <= 73.05);

            if (detectedPincode && isPincodeServiceable(detectedPincode)) {
              setLocation(detectedPincode, detectedArea);
              toast.success(`📍 Live location detected: ${detectedArea} (${detectedPincode})`, {
                duration: 4000,
              });
            } else if (isSurat) {
              const matchedZone = SERVICEABLE_ZONES.find(z => z.areas.some(a => detectedArea.toLowerCase().includes(a.toLowerCase())));
              const pin = matchedZone ? matchedZone.pincode : '395009';
              const name = matchedZone ? matchedZone.mainArea : detectedArea;
              setLocation(pin, name);
              toast.success(`📍 Live location: ${name} (${pin}), Surat`, {
                duration: 4000,
              });
            } else {
              setLocation('395009', 'Adajan');
              toast(`📍 Device located outside Surat (${detectedArea}). Set to Surat Hub (Adajan 395009).`, {
                icon: 'ℹ️',
                duration: 5000,
              });
            }
          } else {
            throw new Error('Reverse geocode failed');
          }
        } catch {
          const isNearSurat = latitude >= 21.0 && latitude <= 21.35 && longitude >= 72.65 && longitude <= 73.05;
          const pin = isNearSurat ? (latitude > 21.18 ? '395009' : '395007') : '395009';
          const area = isNearSurat ? (latitude > 21.18 ? 'Adajan' : 'Vesu') : 'Adajan';
          setLocation(pin, area);
          toast.success(`📍 Location set: ${area} (${pin})`);
        } finally {
          setIsLocating(false);
          closeLocationModal();
        }
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          // Instead of triggering a harsh warning toast immediately, transition to a friendly interactive guidesheet inside the modal
          setViewMode('permission-denied');
        } else {
          setLocation('395009', 'Adajan');
          toast('Location set to central Surat delivery zone (Adajan 395009).', { icon: '📍' });
          closeLocationModal();
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

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
          className="fixed inset-0 bg-black/45 backdrop-blur-xs z-40 transition-opacity"
        />

        {/* Modal Window in Strict Crisp Light Mode */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="relative w-full max-w-[500px] bg-white border border-zinc-200/90 rounded-2xl sm:rounded-3xl shadow-2xl shadow-zinc-900/10 z-50 overflow-hidden font-sans flex flex-col my-auto text-zinc-900"
        >
          {viewMode === 'prompt' ? (
            /* ========================================================================= */
            /* VIEW 1: PROMPT MODAL (LIGHT THEME)                                        */
            /* ========================================================================= */
            <div className="p-6 sm:p-8 relative bg-white">
              {/* Close Button top-right */}
              <button
                type="button"
                onClick={closeLocationModal}
                className="absolute top-5 right-5 w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Title & 3D Map Pin Graphic in Brand Green */}
              <div className="flex items-center justify-between gap-4 pr-6 sm:pr-8">
                <h2 className="text-2xl sm:text-[26px] font-bold text-zinc-900 tracking-tight leading-tight">
                  Change your location?
                </h2>

                {/* Circular Map Graphic with Green Gradient & Grid */}
                <div className="relative shrink-0 w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-linear-to-b from-[#eafaf1] to-[#d4f5e2] border border-emerald-200/80 flex items-center justify-center overflow-hidden shadow-inner">
                  <svg className="absolute inset-0 w-full h-full opacity-40 text-emerald-600" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3.5">
                    <path d="M-10 32 C 30 20, 60 45, 110 25" />
                    <path d="M-10 70 C 25 80, 70 60, 110 75" />
                    <path d="M35 -10 C 30 40, 50 65, 40 110" />
                    <path d="M75 -10 C 65 35, 80 75, 70 110" />
                  </svg>
                  {/* Brand Green Pin */}
                  <div className="relative z-10 flex flex-col items-center filter drop-shadow-md">
                    <div className="w-6 h-6 rounded-full bg-[#00b853] border-2 border-white flex items-center justify-center shadow-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                    <div className="w-1.5 h-2 bg-[#00b853] -mt-1 transform rotate-45" />
                  </div>
                </div>
              </div>

              {/* Action Controls Row */}
              <div className="mt-7 flex flex-col gap-3">
                {/* Search Input Trigger */}
                <button
                  type="button"
                  onClick={() => setViewMode('search')}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-200 bg-[#f8faf9] text-zinc-600 hover:border-[#00b853] hover:bg-emerald-50/30 transition-colors text-left text-sm cursor-pointer shadow-2xs group"
                >
                  <span className="truncate font-normal">Search for an area or address</span>
                  <Search className="w-4 h-4 text-zinc-400 shrink-0 ml-2 stroke-[2] group-hover:text-[#00b853] transition-colors" />
                </button>

                {/* FreshNLocal Emerald "Use current location" button */}
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="w-full bg-[#00b853] hover:bg-[#009e47] active:bg-[#00873d] text-white font-bold text-sm px-5 py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {/* Crosshair Target Icon */}
                  <svg className={`w-4 h-4 text-white shrink-0 ${isLocating ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="7" />
                    <line x1="12" y1="2" x2="12" y2="5" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="5" y2="12" />
                    <line x1="19" y1="12" x2="22" y2="12" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  </svg>
                  <span>{isLocating ? 'Locating...' : 'Use current location'}</span>
                  <div className="flex flex-col text-[7px] leading-[7px] text-white/80 ml-0.5">
                    <span>▲</span>
                    <span>▼</span>
                  </div>
                </button>
              </div>

              {/* Dotted Line with OR */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-dashed border-zinc-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-zinc-400 font-bold tracking-widest text-[11px]">
                    OR
                  </span>
                </div>
              </div>

              {/* Login / Saved Addresses Link */}
              <div className="text-center text-sm font-medium text-zinc-600">
                {user ? (
                  <button
                    type="button"
                    onClick={() => setViewMode('search')}
                    className="text-[#00b853] font-bold hover:underline cursor-pointer"
                  >
                    View your saved addresses & delivery zones
                  </button>
                ) : (
                  <p>
                    <button
                      type="button"
                      onClick={() => {
                        closeLocationModal();
                        window.dispatchEvent(new CustomEvent('open-auth-modal'));
                      }}
                      className="text-[#00b853] font-bold hover:underline cursor-pointer"
                    >
                      Login
                    </button>{' '}
                    to see your saved addresses
                  </p>
                )}
              </div>
            </div>
          ) : viewMode === 'permission-denied' ? (
            /* ========================================================================= */
            /* VIEW 3: FRIENDLY INTERACTIVE PERMISSION GUIDE SHEET (NATIVE STYLE)        */
            /* ========================================================================= */
            <div className="p-6 sm:p-8 relative bg-white flex flex-col items-center text-center">
              {/* Close Button top-right */}
              <button
                type="button"
                onClick={closeLocationModal}
                className="absolute top-5 right-5 w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Visual Guidance Banner */}
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#00b853] shadow-xs mb-5">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight leading-tight">
                Location Access Required
              </h2>
              <p className="text-zinc-500 text-sm mt-2 max-w-[340px]">
                To search your address automatically, please enable your browser location permission.
              </p>

              {/* Step-by-Step Graphical Instructions */}
              <div className="w-full bg-[#f8faf9] border border-zinc-200/60 rounded-xl p-4 text-left my-6 space-y-3.5 text-xs sm:text-sm text-zinc-700">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-[#00b853] font-bold text-[11px] mt-0.5 shrink-0">1</span>
                  <p>Click the <strong>Lock / Settings icon (🔒)</strong> in your browser's address bar next to the website domain.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-[#00b853] font-bold text-[11px] mt-0.5 shrink-0">2</span>
                  <p>Find the <strong>Location</strong> setting and switch it to <strong>"Allow"</strong>.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-[#00b853] font-bold text-[11px] mt-0.5 shrink-0">3</span>
                  <p>Click the green <strong>"Try Again"</strong> button below to detect your Surat zone.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="flex-1 bg-[#00b853] hover:bg-[#009e47] active:bg-[#00873d] text-white font-bold text-sm px-5 py-3 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {isLocating ? 'Locating...' : 'Try Again'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('search')}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-sm px-5 py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Search Manually
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* VIEW 2: SEARCH RESULTS VIEW (STRICT LIGHT THEME)                         */
            /* ========================================================================= */
            <div className="flex flex-col h-[460px] max-h-[75vh] bg-white">
              {/* Header with Back Arrow and Search Input */}
              <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-200 flex items-center gap-3 bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('prompt')}
                  className="p-1 -ml-1 rounded-full hover:bg-zinc-100 text-zinc-700 transition-colors cursor-pointer"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
                </button>

                <div className="flex-1 relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for area, street name..."
                    className="w-full bg-transparent border-none text-sm sm:text-base font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 p-0"
                  />
                </div>

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-zinc-400 hover:text-zinc-700 p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                )}
              </div>

              {/* Fixed Top Option: "Use My Current Location" */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-emerald-50/50 bg-white transition-colors cursor-pointer group border-b border-zinc-100 shrink-0"
              >
                <svg className="w-4 h-4 text-[#00b853] fill-[#00b853] shrink-0" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
                <span className="font-bold text-sm text-[#00b853] group-hover:underline">
                  {isLocating ? 'Locating your current address...' : 'Use My Current Location'}
                </span>
              </button>

              {/* Out of zone warning if unserviceable pincode entered */}
              {isInvalidPincode && (
                <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 shrink-0">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <p className="font-bold">Pincode {searchQuery.trim()} is outside our delivery zone</p>
                    <p className="text-[11px] mt-0.5">We deliver to 15 key Surat zones (Adajan, Vesu, Althan, Katargam, Rander, Varachha, Dumas, etc.). Store pickup is available for all areas.</p>
                  </div>
                </div>
              )}

              {/* Section Header: Search Results */}
              <div className="px-5 pt-3 pb-1.5 bg-[#f8faf9] border-b border-zinc-100 shrink-0">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  {searchQuery ? 'Search Results' : 'Serviceable Surat Areas'}
                </span>
              </div>

              {/* Scrollable Results List (Crisp White Background) */}
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 bg-white">
                {results.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">
                    <p className="text-sm font-semibold text-zinc-800">No matching Surat area found</p>
                    <p className="text-xs mt-1 text-zinc-500">Try typing "Palanpur", "Adajan", "Vesu", "Katargam", or "395009"</p>
                  </div>
                ) : (
                  results.map((item) => {
                    const isSelected = selectedLocation?.pincode === item.pincode && selectedLocation?.areaName === item.title;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={`w-full px-5 py-3 flex items-start gap-3.5 text-left hover:bg-zinc-50 transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50/80' : 'bg-white'
                        }`}
                      >
                        {/* Themed Location Pin Icon in Green */}
                        <div className="mt-0.5 shrink-0 text-[#00b853]">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                            <circle cx="12" cy="9" r="2.5" fill="currentColor" />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                              {item.title}
                            </p>
                            {isSelected && (
                              <span className="text-[10px] font-bold text-[#00b853] bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                            {item.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
