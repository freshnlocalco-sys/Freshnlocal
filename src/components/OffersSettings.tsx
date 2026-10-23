import React, { useState, useEffect } from 'react';
import { useOffers, FreeGiftOffer, GiftItem, GiftRewardType, OFFER_PRESETS, getEffectiveGiftItems } from '../store/useOffers';
import { useProducts } from '../store/useProducts';
import { useSettings } from '../store/useSettings';
import { 
  Gift, 
  CheckCircle2, 
  AlertCircle, 
  ShoppingBag, 
  Save, 
  Tag, 
  Eye, 
  Search, 
  Check, 
  Trash2, 
  Plus, 
  Layers, 
  Sparkles,
  CheckSquare
} from 'lucide-react';
import toast from 'react-hot-toast';

export function OffersSettings() {
  const { offer, fetchOffer, updateOffer } = useOffers();
  const { products, fetchProducts, hydrateFromIDB } = useProducts();
  const { fetchCategoryImages } = useSettings();

  const [formData, setFormData] = useState<FreeGiftOffer>(() => {
    const base: Partial<FreeGiftOffer> = offer || {};
    const items = getEffectiveGiftItems(base);
    return {
      ...base,
      giftItems: items,
      rewardType: base.rewardType || 'choice',
      maxChoices: base.maxChoices || 1,
    } as FreeGiftOffer;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewSelectedIds, setPreviewSelectedIds] = useState<string[]>([]);

  // Manual custom gift entry state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('1 Pc');
  const [customPrice, setCustomPrice] = useState(100);
  const [customImageUrl, setCustomImageUrl] = useState('');

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
      const items = getEffectiveGiftItems(offer);
      setFormData({
        ...offer,
        giftItems: items,
        rewardType: offer.rewardType || 'choice',
        maxChoices: offer.maxChoices || 1,
      });
      // Default preview selection
      if (items.length > 0) {
        const count = Math.min(offer.maxChoices || 1, items.length);
        setPreviewSelectedIds(items.slice(0, count).map(i => i.id));
      }
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
      if (p.isDeactivated) return false;
      const name = p.name || '';
      const cat = p.category || '';
      if (cat.toLowerCase().includes('juice')) return false;

      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            cat.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || cat === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const effectiveGiftItems = formData.giftItems && formData.giftItems.length > 0 
    ? formData.giftItems 
    : getEffectiveGiftItems(formData);

  const handleAddCatalogProduct = (prod: any) => {
    const existingIndex = effectiveGiftItems.findIndex(g => g.productId === prod.id || g.id === prod.id);
    if (existingIndex >= 0) {
      toast('Product is already in the offer list', { icon: 'ℹ️' });
      return;
    }

    const newItem: GiftItem = {
      id: prod.id || `gift-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: prod.id,
      name: prod.name,
      unit: prod.unit || '1 Pc',
      imageUrl: prod.imageUrl || '',
      originalPrice: prod.price || 0,
    };

    const nextItems = [...effectiveGiftItems, newItem];
    setFormData({
      ...formData,
      giftItems: nextItems,
    });
    toast.success(`Added "${prod.name}" to offer gifts!`);
  };

  const handleAddCustomGift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) {
      toast.error('Please enter product name');
      return;
    }

    const newItem: GiftItem = {
      id: `custom-gift-${Date.now()}`,
      name: customName.trim(),
      unit: customUnit.trim() || '1 Pc',
      imageUrl: customImageUrl.trim(),
      originalPrice: Number(customPrice) || 0,
    };

    const nextItems = [...effectiveGiftItems, newItem];
    setFormData({
      ...formData,
      giftItems: nextItems,
    });

    setCustomName('');
    setCustomUnit('1 Pc');
    setCustomPrice(100);
    setCustomImageUrl('');
    setShowCustomModal(false);
    toast.success(`Added custom gift: ${newItem.name}`);
  };

  const handleRemoveGiftItem = (idToRemove: string) => {
    const nextItems = effectiveGiftItems.filter(item => item.id !== idToRemove);
    setFormData({
      ...formData,
      giftItems: nextItems,
      maxChoices: Math.min(formData.maxChoices || 1, Math.max(1, nextItems.length)),
    });
    setPreviewSelectedIds(prev => prev.filter(id => id !== idToRemove));
    toast.success('Removed gift item from offer');
  };

  const handleUpdateItemField = (id: string, field: keyof GiftItem, value: any) => {
    const nextItems = effectiveGiftItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setFormData({
      ...formData,
      giftItems: nextItems,
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!effectiveGiftItems || effectiveGiftItems.length === 0) {
      toast.error("Please add at least one gift product to the offer.");
      return;
    }
    if (formData.minOrderAmount < 0) {
      toast.error("Minimum order amount cannot be negative.");
      return;
    }

    const first = effectiveGiftItems[0];
    const payload: Partial<FreeGiftOffer> = {
      ...formData,
      giftItems: effectiveGiftItems,
      rewardType: formData.rewardType,
      maxChoices: formData.rewardType === 'choice' ? Math.max(1, Number(formData.maxChoices) || 1) : effectiveGiftItems.length,
      giftItemName: first.name,
      giftItemUnit: first.unit,
      giftItemImageUrl: first.imageUrl,
      giftItemOriginalPrice: first.originalPrice,
      giftProductId: first.productId,
      updatedAt: Date.now(),
    };

    setIsSaving(true);
    try {
      await updateOffer(payload);
      toast.success("Offer settings successfully saved and updated!");
    } catch (error: any) {
      toast.error("Failed to save offer settings: " + (error.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePresetSelect = async (presetId: string) => {
    const selected = OFFER_PRESETS.find(p => p.id === presetId);
    if (selected && selected.offer) {
      const items = selected.offer.giftItems || [];
      const next: FreeGiftOffer = {
        ...formData,
        ...selected.offer,
        giftItems: items,
        rewardType: selected.offer.rewardType || 'choice',
        maxChoices: selected.offer.maxChoices || 1,
      } as FreeGiftOffer;

      setFormData(next);
      if (items.length > 0) {
        setPreviewSelectedIds(items.slice(0, next.maxChoices || 1).map(i => i.id));
      }

      try {
        setIsSaving(true);
        await updateOffer(next);
        toast.success(`Activated Campaign: ${selected.label}`);
      } catch (error: any) {
        toast.error("Failed to switch preset: " + error.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const togglePreviewSelection = (id: string) => {
    if (formData.rewardType === 'all') return;
    const max = formData.maxChoices || 1;
    if (max === 1) {
      setPreviewSelectedIds([id]);
      return;
    }

    if (previewSelectedIds.includes(id)) {
      setPreviewSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      if (previewSelectedIds.length < max) {
        setPreviewSelectedIds(prev => [...prev, id]);
      } else {
        // Replace first
        setPreviewSelectedIds(prev => [...prev.slice(1), id]);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header Banner */}
      <div className="bg-neutral-900 border border-neutral-800 text-white p-6 sm:p-8 rounded-3xl shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-400/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" /> Multi-Product Offers Engine
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
              Award multiple free gifts or let customers choose between optional items (e.g. Avocado OR Strawberry, or pick 2 of 4) when reaching minimum order price.
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

      {/* Preset Campaign Shortcuts */}
      <div className="bg-white border border-border rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" /> Quick-Apply Campaign Presets
          </h3>
          <span className="text-[10px] text-muted-foreground font-semibold">1-Click Launch</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {OFFER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset.id)}
              className="flex items-center gap-2.5 p-3 rounded-2xl border border-border/80 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-left transition-all group cursor-pointer"
            >
              <span className="text-xl shrink-0 group-hover:scale-110 transition-transform">{preset.icon}</span>
              <div className="min-w-0 flex-1">
                <h4 className="text-[11px] font-bold text-foreground truncate group-hover:text-emerald-700">
                  {preset.label}
                </h4>
                <p className="text-[9px] text-muted-foreground truncate">
                  {preset.offer.rewardType === 'choice' 
                    ? `Customer chooses ${preset.offer.maxChoices || 1} item` 
                    : `All ${preset.offer.giftItems?.length || 1} items given free`}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Controls */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-white border border-border rounded-3xl p-5 sm:p-7 shadow-xs space-y-6">
            <div className="border-b border-border/80 pb-4 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" /> 1. Campaign Rules & Threshold
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
                  placeholder="e.g. Free Avocado or Strawberry on Orders ₹1000+"
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
                  placeholder="e.g. Choose 1 Free Fresh Gift on Home Delivery orders of ₹1000 or more!"
                  className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none transition-colors"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

            {/* Threshold & Delivery Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
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
                <span className="text-[10px] text-muted-foreground block font-medium">Customer cart total before gift is unlocked.</span>
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
                  <option value="delivery">🚗 Home Delivery Only (Standard)</option>
                  <option value="pickup">🏪 Store Pickup Only</option>
                  <option value="any">✨ Any Delivery Method (Both Delivery & Pickup)</option>
                </select>
                <span className="text-[10px] text-muted-foreground block font-medium">Controls whether pickup orders also qualify.</span>
              </div>
            </div>

            {/* Top Bar Announcement Text */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Header Announcement Banner Text
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-neutral-600">
                  <input 
                    type="checkbox"
                    checked={formData.showTopBanner !== false}
                    onChange={(e) => setFormData({ ...formData, showTopBanner: e.target.checked })}
                    className="rounded border-border"
                  />
                  Show on top banner
                </label>
              </div>
              <input 
                type="text"
                placeholder="e.g. Choose between Fresh Avocado or Sweet Strawberries on orders of ₹1000+!"
                className="w-full border border-border rounded-xl px-3.5 py-2.5 text-xs bg-white text-foreground focus:border-emerald-600 outline-none transition-colors"
                value={formData.bannerText || ''}
                onChange={(e) => setFormData({ ...formData, bannerText: e.target.value })}
              />

              {/* Live Preview of Top Header Announcement Banner */}
              <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-1.5">
                <div className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                  Header Bar Live Preview
                </div>
                {formData.bannerText?.trim() ? (
                  <div className="bg-emerald-600 text-white py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 text-center overflow-hidden">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0"></span>
                    <span className="bg-white text-emerald-700 px-2 py-0.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs shrink-0">
                      Free
                    </span>
                    <span className="text-[11px] font-extrabold tracking-wide uppercase text-white/95 truncate">
                      {formData.bannerText.trim().replace(/^free[:\s\-–—]+/i, '').trim() || formData.bannerText.trim()}
                    </span>
                  </div>
                ) : (
                  <div className="bg-neutral-800 text-neutral-400 py-2 px-3 rounded-lg text-center text-[10px] font-medium italic">
                    (No announcement banner text entered — top header bar is hidden)
                  </div>
                )}
              </div>
            </div>

            {/* 2. Free Gift Awarding Mode: Choice vs All */}
            <div className="border-t border-border/80 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" /> 2. Gift Awarding Mode
                </h3>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                  Configurable
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Choice Mode */}
                <div 
                  onClick={() => setFormData({ ...formData, rewardType: 'choice' })}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                    formData.rewardType === 'choice' 
                      ? 'border-emerald-600 bg-emerald-500/[0.04] shadow-xs' 
                      : 'border-border/80 hover:border-neutral-300 bg-neutral-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs uppercase tracking-tight flex items-center gap-1.5 text-foreground">
                      <CheckSquare className="w-4 h-4 text-emerald-600" /> Customer Choice
                    </span>
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      formData.rewardType === 'choice' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300'
                    }`}>
                      {formData.rewardType === 'choice' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    Customer selects their preferred gift(s) in Cart from the options (e.g. Avocado OR Strawberry, or pick 2 of 4).
                  </p>
                </div>

                {/* All Mode */}
                <div 
                  onClick={() => setFormData({ ...formData, rewardType: 'all' })}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                    formData.rewardType === 'all' 
                      ? 'border-emerald-600 bg-emerald-500/[0.04] shadow-xs' 
                      : 'border-border/80 hover:border-neutral-300 bg-neutral-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs uppercase tracking-tight flex items-center gap-1.5 text-foreground">
                      <Gift className="w-4 h-4 text-emerald-600" /> Give All Products Free
                    </span>
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      formData.rewardType === 'all' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300'
                    }`}>
                      {formData.rewardType === 'all' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    All products added to this offer are automatically awarded to the customer together for ₹0.00.
                  </p>
                </div>
              </div>

              {/* In Choice mode: Specify how many items customer can pick */}
              {formData.rewardType === 'choice' && (
                <div className="p-4 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-emerald-950">
                        How many gifts can customer choose?
                      </label>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        (e.g., set to 1 for "choose 1 of 2", set to 2 for "pick 2 of 4")
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        min="1"
                        max={Math.max(1, effectiveGiftItems.length)}
                        value={formData.maxChoices || 1}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          setFormData({ ...formData, maxChoices: val });
                        }}
                        className="w-20 border border-emerald-500/30 rounded-xl px-3 py-1.5 text-center font-black text-sm bg-white text-foreground focus:border-emerald-600 outline-none"
                      />
                      <span className="text-xs font-bold text-muted-foreground">gift(s)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Products Currently in Offer */}
            <div className="border-t border-border/80 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                    <Gift className="w-4 h-4 text-emerald-600" /> 3. Configured Gift Products ({effectiveGiftItems.length})
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {formData.rewardType === 'choice' 
                      ? `Customers will choose ${formData.maxChoices || 1} from these ${effectiveGiftItems.length} products` 
                      : `Customers will receive all ${effectiveGiftItems.length} products free`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomModal(true)}
                  className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Custom Gift
                </button>
              </div>

              {effectiveGiftItems.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-border rounded-2xl bg-neutral-50/50 space-y-2">
                  <Gift className="w-8 h-8 text-neutral-400 mx-auto" />
                  <p className="text-xs font-bold text-foreground">No gift products added yet.</p>
                  <p className="text-[11px] text-muted-foreground">
                    Select products from your catalog below to add them to this promotional offer.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {effectiveGiftItems.map((item, index) => (
                    <div 
                      key={item.id || index}
                      className="p-3.5 bg-white border border-border/90 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs hover:border-emerald-500/40 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-14 h-14 rounded-xl bg-neutral-50 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                          {item.imageUrl ? (
                            <img 
                              src={item.imageUrl} 
                              alt={item.name} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <Gift className="w-6 h-6 text-emerald-600" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-md">
                              Gift #{index + 1}
                            </span>
                            {item.productId && (
                              <span className="text-[8px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                                Catalog Linked
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-xs text-foreground truncate">
                            {item.name}
                          </h4>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>Unit: <strong className="text-foreground">{item.unit || '1 Pc'}</strong></span>
                            <span>•</span>
                            <span>Value: <strong className="font-mono text-foreground">₹{item.originalPrice}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Controls: Edit unit/price or delete */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRemoveGiftItem(item.id)}
                          className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                          title="Remove from offer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Add Products from Catalog */}
            <div className="border-t border-border/80 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" /> 4. Add More Products from Active Catalog
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Search and click "+ Add to Offer" to include multiple products
                  </span>
                </div>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                  Live Inventory
                </span>
              </div>

              {/* Search & Category Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search catalog products (e.g. Avocado, Strawberry, Dragon fruit)..."
                    className="w-full border border-border rounded-xl pl-9 pr-3.5 py-2 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-medium"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="border border-border rounded-xl px-3 py-2 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-semibold cursor-pointer min-w-[140px]"
                >
                  <option value="all">All Categories</option>
                  {activeCartCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Products List Scroll Container */}
              <div className="border border-border/80 rounded-2xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-border/60 bg-neutral-50/30 shadow-xs">
                {filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground font-medium">
                    No matching products found in catalog.
                  </div>
                ) : (
                  filteredProducts.map((prod) => {
                    const isAlreadyAdded = effectiveGiftItems.some(g => g.productId === prod.id || g.id === prod.id);
                    return (
                      <div
                        key={prod.id}
                        className="flex items-center gap-3.5 p-3 hover:bg-neutral-100/70 transition-colors"
                      >
                        <div className="w-11 h-11 bg-white border border-border rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                          {prod.imageUrl ? (
                            <img 
                              src={prod.imageUrl} 
                              alt={prod.name} 
                              className="w-full h-full object-contain p-1"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <ShoppingBag className="w-5 h-5 text-neutral-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                            {prod.name}
                            {prod.category && (
                              <span className="px-1.5 py-0.2 bg-neutral-100 border border-neutral-200 text-[8px] rounded font-bold text-muted-foreground uppercase">
                                {prod.category}
                              </span>
                            )}
                          </h5>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold mt-0.5">
                            <span>{prod.unit || '1 Pc'}</span>
                            <span>•</span>
                            <span className="font-mono text-foreground font-bold">₹{prod.price}</span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isAlreadyAdded ? (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                              <Check className="w-3 h-3 text-emerald-600" /> In Offer
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddCatalogProduct(prod)}
                              className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700 bg-white border border-emerald-500/40 hover:bg-emerald-600 hover:text-white px-3 py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Add to Offer
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="border-t border-border/80 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[10px] text-muted-foreground font-medium">
                Saves campaign rules and live customer gifts immediately.
              </span>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto px-7 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving Settings..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* Right 1 Col: Live Customer Preview */}
        <div className="space-y-6">
          <div className="bg-white border border-border rounded-3xl p-5 sm:p-6 shadow-xs space-y-4 sticky top-24">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-600" /> Live Customer Cart Preview
              </span>
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Interactive
              </span>
            </div>

            <p className="text-[10px] text-muted-foreground font-semibold leading-relaxed">
              This preview simulates exactly what your customers will see in their Cart when the order meets your condition (Home Delivery & ≥ ₹{formData.minOrderAmount}).
            </p>

            {/* Unlocked Gift Preview Container */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">
                  {formData.rewardType === 'choice' 
                    ? `Customer Choice (${previewSelectedIds.length}/${formData.maxChoices || 1} Selected)` 
                    : `All ${effectiveGiftItems.length} Products Awarded Free`}
                </span>
                <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  🎉 Unlocked!
                </span>
              </div>

              {formData.rewardType === 'choice' ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-emerald-950">
                    Please select <strong>{formData.maxChoices || 1}</strong> free gift{Number(formData.maxChoices) > 1 ? 's' : ''} below:
                  </p>

                  <div className="space-y-2">
                    {effectiveGiftItems.map((item) => {
                      const isSelected = previewSelectedIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => togglePreviewSelection(item.id)}
                          className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                            isSelected 
                              ? 'border-emerald-600 bg-emerald-500/[0.08] shadow-xs' 
                              : 'border-border/80 bg-white hover:border-neutral-300'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-xl bg-white border border-border overflow-hidden shrink-0 flex items-center justify-center">
                            {item.imageUrl ? (
                              <img 
                                src={item.imageUrl} 
                                alt={item.name} 
                                className="w-full h-full object-contain p-1"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Gift className="w-5 h-5 text-emerald-600" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h5 className="font-bold text-xs text-foreground truncate">
                              {item.name}
                            </h5>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold mt-0.5">
                              <span>{item.unit}</span>
                              <span>•</span>
                              <span className="text-emerald-700 font-bold">100% FREE</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {effectiveGiftItems.map((item) => (
                    <div 
                      key={item.id}
                      className="p-3 bg-emerald-500/[0.05] border border-emerald-500/20 rounded-2xl flex items-center gap-3 shadow-2xs"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white border border-emerald-500/20 overflow-hidden shrink-0 flex items-center justify-center">
                        {item.imageUrl ? (
                          <img 
                            src={item.imageUrl} 
                            alt={item.name} 
                            className="w-full h-full object-contain p-1"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Gift className="w-5 h-5 text-emerald-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[8px] font-mono tracking-widest text-emerald-700 uppercase font-black block">
                          FREE PROMO GIFT
                        </span>
                        <h5 className="font-bold text-xs text-foreground truncate">
                          {item.name}
                        </h5>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{item.unit}</span>
                          <span>•</span>
                          <span className="text-emerald-600 font-black">₹0.00</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-600 text-white font-black text-[8px] uppercase tracking-wider rounded-md">
                        FREE
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[9px] text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 font-medium">
                ✓ All selected gifts automatically dispatched with order at ₹0.00!
              </div>
            </div>

            {/* Campaign Summary Card */}
            <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 space-y-2.5">
              <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground block">
                Rule Summary:
              </span>
              
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-neutral-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Delivery: <strong className="uppercase">{formData.deliveryMethodRequired}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-neutral-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Min Order: <strong className="font-mono">₹{formData.minOrderAmount}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-neutral-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Mode: <strong className="text-emerald-700 uppercase">{formData.rewardType === 'choice' ? `Choice (${formData.maxChoices || 1} of ${effectiveGiftItems.length})` : `All ${effectiveGiftItems.length} Products`}</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Gift Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-sm font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-600" /> Add Custom Promotional Gift
              </h4>
              <button 
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomGift} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-muted-foreground">Product Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Fresh Organic Blueberries"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase text-muted-foreground">Unit / Quantity</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. 1 Box (125g)"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase text-muted-foreground">Original Value (₹)</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    value={customPrice}
                    onChange={(e) => setCustomPrice(Number(e.target.value))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-white text-foreground focus:border-emerald-600 outline-none font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-muted-foreground">Image URL</label>
                <input 
                  type="url"
                  placeholder="https://..."
                  value={customImageUrl}
                  onChange={(e) => setCustomImageUrl(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-white text-foreground focus:border-emerald-600 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Add Gift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
