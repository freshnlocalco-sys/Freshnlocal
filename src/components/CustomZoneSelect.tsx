import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check, X, MapPin } from 'lucide-react';
import { SERVICEABLE_ZONES, getZoneByPincode } from '../lib/deliveryZones';

interface CustomZoneSelectProps {
  value: string;
  onChange: (pincode: string) => void;
}

export const CustomZoneSelect: React.FC<CustomZoneSelectProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedZone = getZoneByPincode(value);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredZones = SERVICEABLE_ZONES.filter((z) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      z.pincode.includes(q) ||
      z.mainArea.toLowerCase().includes(q) ||
      z.areas.some((a) => a.toLowerCase().includes(q))
    );
  });

  const handleSelect = (pincode: string) => {
    onChange(pincode);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <label className="block text-[9px] font-black uppercase text-muted-foreground tracking-wider">
        Quick Select Surat Zone
      </label>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border rounded-xl px-3.5 py-2.5 bg-white text-left flex items-center justify-between gap-2 text-xs font-semibold cursor-pointer transition-all ${
          isOpen
            ? 'border-[#00c853] ring-2 ring-[#00c853]/20 shadow-xs'
            : 'border-zinc-300 hover:border-[#00c853]/70'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-[#00c853] shrink-0" />
          <span className="truncate text-zinc-900">
            {selectedZone ? (
              <span>
                <strong className="text-[#00c853] font-bold">{selectedZone.pincode}</strong> —{' '}
                {selectedZone.mainArea} ({selectedZone.areas.join(', ')})
              </span>
            ) : (
              <span className="text-zinc-400 font-normal">-- Choose Surat Delivery Area --</span>
            )}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#00c853] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Web Theme Custom Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden font-sans">
          {/* Quick Search Header */}
          <div className="p-2 border-b border-zinc-100 bg-zinc-50/80 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-1" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search area name or pincode..."
              className="w-full bg-transparent text-xs outline-none text-zinc-900 placeholder:text-zinc-400 py-1"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-zinc-400 hover:text-zinc-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100">
            {/* Clear Selection option */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full px-3.5 py-2.5 text-left text-xs transition-colors cursor-pointer flex items-center justify-between ${
                !value
                  ? 'bg-emerald-50 text-[#00c853] font-bold'
                  : 'text-zinc-500 hover:bg-zinc-50'
              }`}
            >
              <span>-- Choose Surat Delivery Area --</span>
              {!value && <Check className="w-3.5 h-3.5 text-[#00c853]" />}
            </button>

            {filteredZones.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500">
                No matching Surat area found for "{searchQuery}"
              </div>
            ) : (
              filteredZones.map((z) => {
                const isSelected = z.pincode === value;
                return (
                  <button
                    key={z.pincode}
                    type="button"
                    onClick={() => handleSelect(z.pincode)}
                    className={`w-full px-3.5 py-2.5 text-left text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#00c853] text-white font-bold'
                        : 'text-zinc-800 hover:bg-emerald-50 hover:text-emerald-800 font-medium'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={isSelected ? 'text-white font-black' : 'text-[#00c853] font-bold'}>
                          {z.pincode}
                        </span>
                        <span>—</span>
                        <span className="font-semibold">{z.mainArea}</span>
                      </div>
                      <p className={`text-[10px] leading-relaxed break-words mt-0.5 ${isSelected ? 'text-white/90' : 'text-zinc-500'}`}>
                        ({z.areas.join(', ')})
                      </p>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
