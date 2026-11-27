import React, { useState } from 'react';
import { useSettings } from '../store/useSettings';
import { Product } from '../store/useCart';
import { 
  DEFAULT_META_CATEGORY_MAPPINGS, 
  COMMON_META_CATEGORIES, 
  getMappedMetaCategory 
} from '../lib/metaFeedGenerator';
import { 
  Check, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  CheckCircle2, 
  AlertCircle,
  Layers,
  Rss,
  X,
  ImageOff,
  EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';

interface MetaCatalogSettingsProps {
  products?: Product[];
}

export function MetaCatalogSettings({ products = [] }: MetaCatalogSettingsProps) {
  const {
    productCategories = [],
    juiceCategories = [],
    metaCategoryMapping = {},
    updateMetaCategoryMapping,
    saveAllMetaCategoryMappings
  } = useSettings();

  const [copied, setCopied] = useState(false);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [isMappingExpanded, setIsMappingExpanded] = useState(false);
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [skippedTab, setSkippedTab] = useState<'missing_image' | 'deactivated'>('missing_image');
  const [searchFilter, setSearchFilter] = useState('');
  const [customEditingCat, setCustomEditingCat] = useState<string | null>(null);
  const [customInputValue, setCustomInputValue] = useState('');

  const feedUrl = 'https://www.freshnlocal.co/api/meta/catalog-feed.xml';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      toast.success('Meta Catalog Feed URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  };

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const res = await fetch('/api/meta/catalog-feed.xml?diagnostics=true&force=true');
      if (!res.ok) {
        throw new Error(`Diagnostics request returned HTTP ${res.status}`);
      }
      const data = await res.json();
      setDiagnosticsData(data?.feedStats || null);
      toast.success('Catalog feed diagnostics completed!');
    } catch (err: any) {
      console.error('Diagnostics failed:', err);
      toast.error(err?.message || 'Failed to run diagnostics. Is server running?');
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleAutoMapDefaults = async () => {
    try {
      const updated: Record<string, string> = { ...metaCategoryMapping };
      let newCount = 0;

      // Map produce categories
      productCategories.forEach(cat => {
        if (!cat) return;
        const norm = cat.trim();
        const mapped = getMappedMetaCategory(norm, updated);
        if (updated[norm] !== mapped) {
          updated[norm] = mapped;
          newCount++;
        }
      });

      // Map juice categories
      juiceCategories.forEach(cat => {
        if (!cat || !cat.name) return;
        const norm = cat.name.trim();
        const mapped = 'Food, Beverages & Tobacco > Beverages > Juice';
        if (updated[norm] !== mapped) {
          updated[norm] = mapped;
          newCount++;
        }
      });

      // Map general juices
      updated['fnl juices'] = 'Food, Beverages & Tobacco > Beverages > Juice';
      updated['juices'] = 'Food, Beverages & Tobacco > Beverages > Juice';

      await saveAllMetaCategoryMappings(updated);
      toast.success(`Successfully mapped ${newCount} categories to standard Meta taxonomy!`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to auto-map categories');
    }
  };

  // Combine all categories (produce + juice)
  const allCategories = Array.from(new Set([
    ...productCategories.filter(Boolean),
    ...juiceCategories.map(j => j.name).filter(Boolean),
    'fnl juices'
  ]));

  const filteredCategories = allCategories.filter(cat => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const currentMeta = getMappedMetaCategory(cat, metaCategoryMapping);
    return cat.toLowerCase().includes(q) || currentMeta.toLowerCase().includes(q);
  });

  // Calculate products excluded from feed
  const activeMissingImages = products.filter(p => {
    if (p.isDeactivated === true) return false;
    const raw = p.imageUrl || (p as any).image;
    return !raw || typeof raw !== 'string' || (!raw.startsWith('http://') && !raw.startsWith('https://'));
  });

  const deactivatedProducts = products.filter(p => p.isDeactivated === true);
  const categoryCounts: Record<string, number> = {};
  products.forEach(p => {
    if (p.isDeactivated === true) return;
    const cat = p.category || 'uncategorized';
    categoryCounts[cat.toLowerCase().trim()] = (categoryCounts[cat.toLowerCase().trim()] || 0) + 1;
  });

  return (
    <div className="slice-card p-6 sm:p-8 bg-secondary/80 border border-border rounded-2xl flex flex-col gap-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center shrink-0 text-blue-600">
            <Rss className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black uppercase text-foreground">
                Meta Commerce Catalog Data Feed
              </h3>
              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-600 border border-blue-500/20">
                RSS 2.0 XML
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mt-0.5">
              Live feed for Facebook &amp; Instagram Shops, Advantage+ Dynamic Product Ads, and WhatsApp Commerce.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setShowSkippedModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 text-amber-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
            title="View products not included in data feed"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Excluded Items ({activeMissingImages.length + deactivatedProducts.length})</span>
          </button>
          <button
            type="button"
            onClick={handleRunDiagnostics}
            disabled={isRunningDiagnostics}
            className="px-3.5 py-2 rounded-xl bg-secondary border border-border hover:bg-background text-foreground text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Check live feed statistics and validate output"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${isRunningDiagnostics ? 'animate-spin' : ''}`} />
            <span>{isRunningDiagnostics ? 'Checking...' : 'Check Diagnostics'}</span>
          </button>
        </div>
      </div>

      {/* Feed URL Box */}
      <div className="p-4 sm:p-5 rounded-xl bg-background border border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">
            Scheduled Feed URL (Paste into Meta Commerce Manager)
          </span>
          <code className="text-xs sm:text-sm font-mono text-primary font-bold break-all select-all block">
            {feedUrl}
          </code>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyUrl}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs hover:opacity-95 transition-all cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy URL'}</span>
          </button>
          <a
            href="/api/meta/catalog-feed.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg bg-secondary border border-border hover:bg-background text-foreground text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View XML</span>
          </a>
        </div>
      </div>

      {/* Diagnostics Results (when triggered) */}
      {diagnosticsData && (
        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              Live Catalog Diagnostics Report
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              Generated in {diagnosticsData.generationTimeMs || 0}ms
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-lg bg-background border border-border/80">
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground block">Total Feed Items</span>
              <span className="text-base font-black text-foreground">{diagnosticsData.totalFeedItems}</span>
              <span className="text-[8px] text-muted-foreground block">Items for Meta Catalog</span>
            </div>
            <div className="p-2.5 rounded-lg bg-background border border-border/80">
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground block">Base Products</span>
              <span className="text-base font-black text-primary">{diagnosticsData.activeIncludedProducts}</span>
              <span className="text-[8px] text-muted-foreground block">Primary products</span>
            </div>
            <div className="p-2.5 rounded-lg bg-background border border-border/80">
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground block">Product Variants</span>
              <span className="text-base font-black text-indigo-600">{diagnosticsData.totalVariantsIncluded}</span>
              <span className="text-[8px] text-muted-foreground block">Linked with item_group_id</span>
            </div>
            <div className="p-2.5 rounded-lg bg-background border border-border/80">
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground block">Skipped / Inactive</span>
              <span className="text-base font-black text-amber-600">{diagnosticsData.skippedProducts}</span>
              <span className="text-[8px] text-muted-foreground block">Deactivated or no image</span>
            </div>
          </div>
        </div>
      )}

      {/* Meta Taxonomy Mapping Section */}
      <div className="space-y-4 pt-2 border-t border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-foreground">
                Google &amp; Meta Product Category Mappings
              </h4>
              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                {allCategories.length} Categories
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
              Map your store categories to Meta&apos;s standard product taxonomy for catalog compliance and Advantage+ ad targeting.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoMapDefaults}
              className="px-3.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
              title="Automatically map all categories using recommended standard taxonomy"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Map Defaults</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMappingExpanded(!isMappingExpanded)}
              className="px-3 py-1.5 rounded-lg bg-secondary border border-border hover:bg-background text-foreground text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>{isMappingExpanded ? 'Collapse' : 'Manage Mappings'}</span>
              {isMappingExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Expandable Category Mapping Table */}
        {isMappingExpanded && (
          <div className="space-y-3 pt-3 border-t border-border/50 animate-in fade-in">
            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search category name or mapped taxonomy..."
                className="slice-input w-full pl-9 text-[10px]"
              />
            </div>

            {/* List of categories */}
            <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
              {filteredCategories.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No categories match your search.
                </div>
              ) : (
                filteredCategories.map(cat => {
                  const currentMapped = getMappedMetaCategory(cat, metaCategoryMapping);
                  const isCustom = customEditingCat === cat;
                  const count = categoryCounts[cat.toLowerCase().trim()] || 0;

                  return (
                    <div 
                      key={cat}
                      className="p-3 rounded-xl bg-background border border-border/70 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-border transition-all"
                    >
                      <div className="min-w-0 md:w-1/3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-foreground uppercase tracking-wide truncate">
                            {cat}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[7.5px] font-black text-muted-foreground bg-secondary">
                            {count} {count === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        {isCustom ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={customInputValue}
                              onChange={(e) => setCustomInputValue(e.target.value)}
                              placeholder="e.g. Food, Beverages & Tobacco > Food Items..."
                              className="slice-input w-full text-[9.5px] py-1.5"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (customInputValue.trim()) {
                                  updateMetaCategoryMapping(cat, customInputValue.trim());
                                }
                                setCustomEditingCat(null);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[9px] font-black uppercase cursor-pointer shrink-0"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomEditingCat(null)}
                              className="px-2 py-1.5 rounded-lg bg-secondary text-muted-foreground text-[9px] font-black uppercase cursor-pointer shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={COMMON_META_CATEGORIES.includes(currentMapped) ? currentMapped : '__custom__'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__custom__') {
                                  setCustomEditingCat(cat);
                                  setCustomInputValue(currentMapped);
                                } else {
                                  updateMetaCategoryMapping(cat, val);
                                }
                              }}
                              className="slice-input w-full text-[9.5px] py-1.5 cursor-pointer bg-secondary"
                            >
                              {COMMON_META_CATEGORIES.map(opt => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                              {!COMMON_META_CATEGORIES.includes(currentMapped) && (
                                <option value="__custom__">Custom: {currentMapped}</option>
                              )}
                              <option value="__custom__">+ Enter Custom Category Path...</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => {
                                setCustomEditingCat(cat);
                                setCustomInputValue(currentMapped);
                              }}
                              className="px-2 py-1 rounded-lg bg-secondary border border-border text-[8px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                              title="Edit custom path"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* EXCLUDED PRODUCTS MODAL */}
      {showSkippedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-4 bg-secondary/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-foreground uppercase tracking-wide">
                    Products Excluded from Meta Catalog Feed
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Meta requires active products to have a valid image and price. Deactivated or incomplete items are excluded.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSkippedModal(false)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Subtabs */}
            <div className="flex items-center gap-2 p-3 bg-secondary/20 border-b border-border px-5">
              <button
                type="button"
                onClick={() => setSkippedTab('missing_image')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                  skippedTab === 'missing_image'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                <ImageOff className="w-3.5 h-3.5" />
                <span>Active but Missing Image ({activeMissingImages.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSkippedTab('deactivated')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                  skippedTab === 'deactivated'
                    ? 'bg-neutral-800 text-white shadow-xs dark:bg-neutral-700'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Deactivated Products ({deactivatedProducts.length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1">
              {skippedTab === 'missing_image' ? (
                <>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-800 space-y-1 mb-3">
                    <p className="font-bold">
                      💡 Why are these products excluded?
                    </p>
                    <p>
                      Meta Commerce Manager requires a valid, high-resolution product image for every single catalog item. Items without an image will be rejected by Meta with policy errors. To add these to your Meta catalog, open the product in the admin panel and upload an illustration photo.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {activeMissingImages.map((prod, idx) => (
                      <div 
                        key={prod.id}
                        className="p-3 rounded-xl bg-secondary/40 border border-border/80 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] text-muted-foreground">#{idx + 1}</span>
                            <span className="font-bold text-foreground truncate">{prod.name}</span>
                            {prod.itemCode && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-background text-muted-foreground border border-border">
                                Code: {prod.itemCode}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                            <span className="capitalize">{prod.category}</span>
                            <span>•</span>
                            <span className="font-semibold text-foreground">₹{prod.price}</span>
                            <span>•</span>
                            <span className={prod.inStock !== false ? 'text-primary font-bold' : 'text-neutral-400'}>
                              {prod.inStock !== false ? 'In Stock' : 'Out of Stock'}
                            </span>
                          </div>
                        </div>

                        <span className="px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-700 border border-amber-500/20 shrink-0">
                          Missing Image
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-secondary border border-border text-[10px] text-muted-foreground space-y-1 mb-3">
                    <p className="font-bold text-foreground">
                      ℹ️ Deactivated / Seasonal Products
                    </p>
                    <p>
                      These products have &quot;isDeactivated&quot; turned ON in the admin panel (e.g. out-of-season fruits, archived festival flowers, or draft items). They are safely omitted so customers cannot see or order inactive products.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {deactivatedProducts.map((prod, idx) => (
                      <div 
                        key={prod.id}
                        className="p-3 rounded-xl bg-secondary/30 border border-border/60 flex items-center justify-between gap-3 text-xs opacity-75"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] text-muted-foreground">#{idx + 1}</span>
                            <span className="font-medium text-foreground truncate">{prod.name}</span>
                            {prod.itemCode && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-background text-muted-foreground border border-border">
                                Code: {prod.itemCode}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                            <span className="capitalize">{prod.category}</span>
                            <span>•</span>
                            <span>₹{prod.price || 0}</span>
                          </div>
                        </div>

                        <span className="px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 shrink-0">
                          Deactivated
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-border bg-secondary/40 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSkippedModal(false)}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
