import React, { useState, useEffect } from 'react';
import { useOffers, FreeGiftOffer, OFFER_PRESETS } from '../store/useOffers';
import { useProducts } from '../store/useProducts';
import { useSettings } from '../store/useSettings';
import { 
  Gift, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  ShoppingBag, 
  Save, 
  Zap, 
  Tag,
  DollarSign,
  Eye,
  Search,
  Check
} from 'lucide-react';
import toast from 'react-hot-toast';

export function OffersSettings() {
  const { offer, loading, fetchOffer, updateOffer } = useOffers();
  const { products, fetchProducts, hydrateFromIDB } = useProducts();
  const { fetchCategoryImages } = useSettings();
  const [formData, setFormData] = useState<FreeGiftOffer>(offer);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    async function init() {
      await hydrateFromIDB();
      fetchProducts();
      await fetchCategoryImages();
    }
    init();
    fetchOffer();
  }, [fetchProducts, hydrateFromIDB, fetchOffer, fetchCategoryImages]);

  useEffect(() => {
    if (offer) {
      setFormData(offer);
    }
  }, [offer]);

  const activeCartCategories = React.useMemo(() => {
    if (!products) return [];
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category) {
        const catLower = p.category.toLowerCase();
        if (!catLower.includes('juice')) {
          cats.add(p.category);
        }
      }
    });
    return Array.from(cats);
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    return products.filter(p => {
      const name = p.name || '';
      const cat = p.category || '';
      
      // Exclude juice categories or general juice naming
      if (cat.toLowerCase().includes('juice')) return false;

      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            cat.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || cat === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.giftItemName.trim()) {
      toast.error("Please enter a gift item name.");
      return;
    }
    if (formData.minOrderAmount < 0) {
      toast.error("Minimum order amount cannot be negative.");
      return;
    }

    setIsSaving(true);
    try {
      await updateOffer(formData);
      toast.success("Offer settings successfully saved and updated!");
    } catch (error: any) {
      toast.error("Failed to save offer settings: " + (error.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePresetSelect = async (presetId: string) => {
    const selected = OFFER_PRESETS.find(p => p.id === presetId);
    if (selected) {
      const next = { ...formData, ...selected.offer };
      setFormData(next);
      try {
        setIsSaving(true);
        await updateOffer(next);
        toast.success(`Activated Campaign: ${selected.label.split('(')[0].trim()}`);
      } catch (error: any) {
        toast.error("Failed to switch preset: " + error.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header Banner */}
      <div className="bg-neutral-900 border border-neutral-800 text-white p-6 sm:p-8 rounded-3xl shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-400/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" /> Promotions Control Center
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                formData.enabled 
                  ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' 
                  : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
              }`}>
                {formData.enabled ? '● Active Live Campaign' : '○ Paused'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black uppercase tracking-tight text-white">
              Offers & Free Gifts Manager
            </h2>
            <p className="text-xs text-neutral-400 max-w-2xl font-semibold leading-relaxed">
              Configure automatic promotional gifts (e.g. 1 Free Avocado) awarded when customers meet order thresholds on Home Delivery.
            </p>
          </div>

          {/* Master Switch Card */}
          <div className="bg-neutral-800/85 border border-neutral-700/80 p-4 rounded-2xl flex items-center gap-4 shrink-0 w-full md:w-auto justify-between">
            <div className="text-left">
              <span className="block text-[10px] uppercase font-black tracking-wider text-neutral-400">
                Offer Status
              </span>
              <span className="text-xs font-bold text-white">
                {formData.enabled ? 'Campaign Active' : 'Campaign Disabled'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={formData.enabled}
                onChange={(e) => {
                  const updated = { ...formData, enabled: e.target.checked };
                  setFormData(updated);
                  updateOffer({ enabled: e.target.checked });
                  toast.success(e.target.checked ? 'Promotional campaign activated live!' : 'Promotional campaign paused.');
                }}
              />
              <div className="w-12 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-neutral-900 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Controls */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-white border border-border rounded-3xl p-5 sm:p-7 shadow-xs space-y-6">
            <div className="border-b border-border/80 pb-4 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" /> Offer Rules & Conditions
              </h3>
              <span className="text-[10px] font-mono text-muted-foreground font-bold">Rule Engine</span>
            </div>

            {/* Campaign Name & Description */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Campaign Title
                </label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Free 1 Avocado on Home Delivery"
                  className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none transition-colors font-semibold"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Customer Subtitle / Promo Description
                </label>
                <input 
                  type="text"
                  placeholder="e.g. Get 1 Fresh Avocado FREE on all Home Delivery orders of ₹1000 or more!"
                  className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none transition-colors"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

            {/* Threshold & Delivery Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Minimum Cart Subtotal (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">₹</span>
                  <input 
                    type="number"
                    min="1"
                    required
                    className="w-full border border-border rounded-xl pl-7 pr-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-bold"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: Number(e.target.value) })}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground block font-medium">Customer must add items totaling at least this value.</span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Applicable Delivery Method
                </label>
                <select
                  value={formData.deliveryMethodRequired}
                  onChange={(e) => setFormData({ ...formData, deliveryMethodRequired: e.target.value as any })}
                  className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-semibold cursor-pointer"
                >
                  <option value="delivery">🚗 Home Delivery Only (Required by rule)</option>
                  <option value="pickup">🏪 Store Pickup Only</option>
                  <option value="any">✨ Any Delivery Method (Both Delivery & Pickup)</option>
                </select>
                <span className="text-[10px] text-muted-foreground block font-medium">Controls whether pickup orders also qualify.</span>
              </div>
            </div>

            {/* Link Real Catalog Product */}
            <div className="border-t border-border/80 pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" /> Select Gift Product from Active Catalog
                </h4>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                  Live Inventory
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                Search your active store inventory below. Selecting a product will immediately link it as the campaign's promotional gift, auto-filling its name, unit, value, and image directly from your catalog.
              </p>

              {/* Search & Category Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search your real products..."
                    className="w-full border border-border rounded-xl pl-9 pr-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-medium"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="border border-border rounded-xl px-3 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-semibold cursor-pointer min-w-[140px]"
                >
                  <option value="all">All Categories</option>
                  {activeCartCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Scrollable Products List */}
              <div className="border border-border/80 rounded-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-border/60 bg-neutral-50/30 shadow-xs">
                {filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground font-medium">
                    No matching products found in your catalog.
                  </div>
                ) : (
                  filteredProducts.map((prod) => {
                    const isSelected = formData.giftProductId === prod.id;
                    return (
                      <div
                        key={prod.id}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            giftProductId: prod.id,
                            giftItemName: prod.name,
                            giftItemUnit: prod.unit || '1 Pc',
                            giftItemImageUrl: prod.imageUrl || '',
                            giftItemOriginalPrice: prod.price || 0,
                            title: `Free ${prod.name} Offer`,
                            description: `Get 1 Free ${prod.name} FREE on all Home Delivery orders of ₹${formData.minOrderAmount || 1000} or more!`
                          });
                          toast.success(`Linked to active catalog product: ${prod.name}`);
                        }}
                        className={`flex items-center gap-3.5 p-3 transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-emerald-500/10 border-l-4 border-l-emerald-600' 
                            : 'hover:bg-neutral-100/80 border-l-4 border-l-transparent'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="w-12 h-12 bg-white border border-border rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative">
                          {prod.imageUrl ? (
                            <img 
                              src={prod.imageUrl} 
                              alt={prod.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <ShoppingBag className="w-5 h-5 text-neutral-400" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-foreground truncate flex items-center gap-2">
                            {prod.name}
                            {prod.category && (
                              <span className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 text-[8px] rounded-md font-bold text-muted-foreground uppercase">
                                {prod.category}
                              </span>
                            )}
                          </h5>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold mt-0.5">
                            <span>{prod.unit || '1 Pc'}</span>
                            <span>•</span>
                            <span className="font-mono text-foreground font-bold">₹{prod.price}</span>
                            {!prod.inStock && (
                              <span className="text-red-500 bg-red-100 px-1 py-0.2 rounded text-[8px] font-black uppercase ml-1">Out of Stock</span>
                            )}
                          </div>
                        </div>

                        {/* Status Check */}
                        <div className="shrink-0">
                          {isSelected ? (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg">
                              <Check className="w-3 h-3 text-emerald-600" /> Linked
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase text-neutral-600 bg-white border border-border px-2 py-1 rounded-lg hover:border-emerald-600 hover:text-emerald-600 transition-colors">
                              Link Product
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Gift Item Details */}
            <div className="border-t border-border/80 pt-5 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-600" /> Free Gift Item Specification
              </h4>

              {formData.giftProductId ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-900 dark:text-emerald-300 font-semibold flex items-center justify-between gap-2 shadow-2xs">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Currently linked to a live catalog product!
                  </span>
                  <button 
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, giftProductId: '' });
                      toast.success("Unlinked product. You can now override inputs manually.");
                    }}
                    className="text-[9px] uppercase font-black tracking-widest text-emerald-700 hover:text-red-600 underline"
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-900 dark:text-amber-300 font-semibold flex items-center gap-1.5 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" /> Manual Entry Mode: Customize fields below freely.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Gift Item Name
                  </label>
                  <input 
                    type="text"
                    required
                    disabled={!!formData.giftProductId}
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none disabled:bg-neutral-50 disabled:text-neutral-500 font-semibold"
                    value={formData.giftItemName}
                    onChange={(e) => setFormData({ ...formData, giftItemName: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Quantity / Unit
                  </label>
                  <input 
                    type="text"
                    required
                    disabled={!!formData.giftProductId}
                    placeholder="e.g. 1 Pc or 250g"
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none disabled:bg-neutral-50 disabled:text-neutral-500 font-bold"
                    value={formData.giftItemUnit}
                    onChange={(e) => setFormData({ ...formData, giftItemUnit: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Original Price value (₹)
                  </label>
                  <input 
                    type="number"
                    min="0"
                    required
                    disabled={!!formData.giftProductId}
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none disabled:bg-neutral-50 disabled:text-neutral-500 font-semibold"
                    value={formData.giftItemOriginalPrice}
                    onChange={(e) => setFormData({ ...formData, giftItemOriginalPrice: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Catalog Image URL
                  </label>
                  <input 
                    type="text"
                    disabled={!!formData.giftProductId}
                    placeholder="e.g. https://images.unsplash.com/..."
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none disabled:bg-neutral-50 disabled:text-neutral-500"
                    value={formData.giftItemImageUrl}
                    onChange={(e) => setFormData({ ...formData, giftItemImageUrl: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="border-t border-border/80 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[10px] text-muted-foreground font-medium">
                Changes take effect across the website and cart immediately.
              </span>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving Settings..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* Right 1 Col: Live Visual Preview */}
        <div className="space-y-6">
          <div className="bg-white border border-border rounded-3xl p-5 sm:p-6 shadow-xs space-y-4 sticky top-24">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-600" /> Live Customer Preview
              </span>
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Interactive
              </span>
            </div>

            <p className="text-[10px] text-muted-foreground font-semibold leading-relaxed">
              This preview reflects what your customers will see in their Cart and Order Summary when the condition (Home Delivery & ≥ ₹{formData.minOrderAmount}) is satisfied.
            </p>

            {/* Unlocked Gift Cart Item Preview */}
            <div className="space-y-2 pt-2">
              <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">
                In-Cart Promotional Gift Card:
              </span>

              <div className="p-4 bg-emerald-500/[0.04] border border-emerald-500/20 rounded-2xl relative overflow-hidden shadow-[0_4px_20px_rgba(16,185,129,0.06)] space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 bg-emerald-600 text-white font-black text-[8px] uppercase tracking-widest rounded-md flex items-center gap-1">
                    <Gift className="w-2.5 h-2.5" /> FREE GIFT
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-700">
                    Unlocked! 🎉
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-white border border-emerald-500/15 shrink-0 flex items-center justify-center shadow-2xs">
                    {formData.giftItemImageUrl ? (
                      <img 
                        src={formData.giftItemImageUrl} 
                        alt={formData.giftItemName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain p-1.5 transition-transform hover:scale-105 duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Gift className="w-6 h-6 text-emerald-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] tracking-widest text-emerald-700 dark:text-emerald-400 uppercase truncate block font-black flex items-center gap-1">
                      <Gift className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> UNLOCKED FREE GIFT
                    </span>
                    <h5 className="font-black text-foreground text-xs sm:text-sm uppercase tracking-tight mt-0.5 truncate">
                      {formData.giftItemName || 'Free Promotional Item'}
                    </h5>
                    <div className="text-[10px] text-muted-foreground font-semibold mt-1 flex flex-wrap items-center gap-2">
                      <span className="bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-md text-[9px] font-bold">
                        {formData.giftItemUnit || '1 Pc'}
                      </span>
                      <span className="text-emerald-700 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wide">
                        Home Delivery Bonus
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-black text-emerald-600">
                        ₹0.00 (100% FREE)
                      </span>
                      {formData.giftItemOriginalPrice > 0 && (
                        <span className="text-[10px] line-through text-muted-foreground/70 font-mono">
                          ₹{formData.giftItemOriginalPrice}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[9px] text-emerald-800 bg-white/80 p-2.5 rounded-xl border border-emerald-200/60 font-medium">
                  ✓ Automatically included in dispatch when order is placed.
                </div>
              </div>
            </div>

            {/* Rule Qualification Metrics Card */}
            <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 space-y-3">
              <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground block">
                Active Qualification Rule:
              </span>
              
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-neutral-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Delivery: <strong className="uppercase">{formData.deliveryMethodRequired}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-neutral-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Minimum Order: <strong className="font-mono">₹{formData.minOrderAmount}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-neutral-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Award: <strong className="text-emerald-700">{formData.giftItemName} ({formData.giftItemUnit})</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
