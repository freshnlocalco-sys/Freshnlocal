import React, { useEffect, useState, useRef } from 'react';
import { useProducts } from '../store/useProducts';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { Search, ShoppingBag, ArrowRight, Zap, Sparkles, History, TrendingUp, X, Filter } from 'lucide-react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { getCategoryImage, CATEGORIES } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { ProductSkeleton } from '../components/ProductSkeleton';
import { ProductCard } from '../components/ProductCard';
import toast from 'react-hot-toast';

import { motion, AnimatePresence } from 'motion/react';

export function Shop() {
  const { products, loading: storeLoading, error, fetchProducts, fetchNextProducts, hasMore, loadingNext, hydrateFromIDB } = useProducts();
  const { categoryImages, productCategories, fetchCategoryImages, lastFetched } = useSettings();
  const allUiCategories = React.useMemo(() => {
    const cleanCategories = productCategories.filter(cat => {
      if (!cat) return false;
      const lower = cat.toLowerCase();
      return !lower.includes('juice');
    });
    return ['All Products', ...cleanCategories];
  }, [productCategories]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const { addItem } = useCart();
  
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== searchQuery) {
      setSearchQuery(q);
    } else if (q === null && searchQuery !== '') {
      setSearchQuery('');
    }
  }, [searchParams]);
  const navigate = useNavigate();
  const categoryFilter = searchParams.get('category') || allUiCategories[0] || 'All Products';
  const [isOffline, setIsOffline] = useState(false);
  const [offlineError, setOfflineError] = useState('');
  const [maxPrice, setMaxPrice] = useState<number>(5000);
  const [showFilterModal, setShowFilterModal] = useState(false);

  useEffect(() => {
    const matchesJuice = categoryFilter && (
      categoryFilter.toLowerCase().includes('juice') || 
      categoryFilter.toLowerCase() === 'fnl juices'
    );
    if (matchesJuice) {
      navigate('/juice', { replace: true });
    }
  }, [categoryFilter, navigate]);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const startTime = performance.now();
      
      // Hydrate from IndexedDB first for maximum speed
      await hydrateFromIDB();
      
      // Load products and settings config side-by-side
      try {
        await Promise.all([fetchProducts(), fetchCategoryImages()]);
      } catch (err) {
        console.error("Error fetching live shop data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchProducts, hydrateFromIDB, fetchCategoryImages]);

  useEffect(() => {
    if (error) {
      setIsOffline(true);
      setOfflineError(error);
    } else {
      setIsOffline(false);
    }
  }, [error]);

  const POPULAR_SEARCHES = React.useMemo(() => {
    // Dynamic selection of active in stock non-juice products
    const activeShopProducts = products.filter(p => {
      let productCategory = p.category ? p.category.toLowerCase() : '';
      productCategory = productCategory.replace(' font-bold', '');
      return !productCategory.includes('juice');
    });
    
    // Extract distinct in-stock product names
    const uniqueNames: string[] = [];
    for (const p of activeShopProducts) {
      if (p.inStock !== false && p.name && !uniqueNames.includes(p.name)) {
        uniqueNames.push(p.name);
        if (uniqueNames.length === 5) break;
      }
    }
    
    if (uniqueNames.length >= 3) {
      return uniqueNames;
    }
    
    // Fresh garden defaults
    return ['Devgad Alphonso', 'Avocados', 'Strawberries', 'Button Mushrooms', 'Broccoli'];
  }, [products]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('recentSearches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const handleSearchSelect = (term: string) => {
    setSearchQuery(term);
    setIsSearchFocused(false);
    
    const newParams = new URLSearchParams(searchParams);
    if (term) {
      newParams.set('q', term);
    } else {
      newParams.delete('q');
    }
    setSearchParams(newParams);

    if (!term) return;
    
    const newRecent = [term, ...recentSearches.filter(s => s.toLowerCase() !== term.toLowerCase())].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem('recentSearches', JSON.stringify(newRecent));
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    const newParams = new URLSearchParams(searchParams);
    if (val) {
      newParams.set('q', val);
    } else {
      newParams.delete('q');
    }
    setSearchParams(newParams, { replace: true });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSelect(searchQuery);
    }
  };

  const searchSuggestions = searchQuery
    ? Array.from(new Set(products
        .filter(p => (p.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) && !(p.category || '').toLowerCase().includes('juice'))
        .map(p => p.name)))
        .slice(0, 5)
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.search-container')) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProductsRaw = products.filter(p => {
    let productCategory = p.category ? p.category.toLowerCase() : '';
    productCategory = productCategory.replace(' font-bold', ''); // Normalize older data typos

    // Explicitly hide juices from the Shop page, as they belong on the dedicated FNL Juice page
    if (productCategory.includes('juice')) {
      return false;
    }

    const matchesCategory = categoryFilter && categoryFilter.toLowerCase() !== 'all products'
      ? productCategory === categoryFilter.toLowerCase()
      : true;
    const searchLower = (searchQuery || '').toLowerCase();
    const matchesSearch = searchLower ? (
      (p.name && p.name.toLowerCase().includes(searchLower)) ||
      (p.category && p.category.toLowerCase().includes(searchLower)) ||
      (p.description && p.description.toLowerCase().includes(searchLower))
    ) : true;
    const matchesPrice = typeof p.price === 'number' ? p.price <= maxPrice : true;
    return matchesCategory && matchesSearch && matchesPrice;
  });

  const filteredProducts = React.useMemo(() => {
    const list = [...filteredProductsRaw];
    const catOrder = new Map();
    try {
      productCategories.forEach((c, i) => { if (c) catOrder.set(c.toLowerCase().trim(), i) });
    } catch(e) {}

    list.sort((a, b) => {
      const catA = (a.category || '').toLowerCase().trim().replace(' font-bold', '');
      const catB = (b.category || '').toLowerCase().trim().replace(' font-bold', '');
      if (catA !== catB) {
        const idxA = catOrder.has(catA) ? catOrder.get(catA) : 999;
        const idxB = catOrder.has(catB) ? catOrder.get(catB) : 999;
        return idxA - idxB;
      }

      return (a.orderIndex ?? 999) - (b.orderIndex ?? 999);
    });
    return list;
  }, [filteredProductsRaw, productCategories]);

  // Infinite Scroll Intersection Observer
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loadingNext) {
        fetchNextProducts();
      }
    }, {
      rootMargin: '120px',
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingNext, fetchNextProducts, filteredProducts.length]);

  const handleAddToCart = (product: Product) => {
    addItem(product);
    toast.success(`${product.name} added to cart!`);
  };

  const formatCategoryName = (catName: string) => {
    if (!catName) return '';
    if (catName.toLowerCase() === 'fresh & hygenic cut fruits and vegetables') return 'Clean Cuts';
    if (catName.toLowerCase() === 'imported / super exotic vegetables') return 'Exotics';
    return catName;
  };

  return (
    <div className="w-full max-w-full box-border overflow-x-hidden bg-background text-foreground">
      
      {/* Mobile Search Header */}
      <div className="md:hidden px-3 py-3 bg-background/95 backdrop-blur-md border-b border-border relative z-40">
        <div className="relative w-full search-container z-50">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border text-xs text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-white placeholder-muted-foreground transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => handleSearchSelect('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-muted text-muted-foreground hover:bg-secondary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            {isSearchFocused && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden text-xs py-2 max-h-[60vh] overflow-y-auto">
                {!searchQuery ? (
                  <>
                    {recentSearches.length > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between px-4 py-2 text-muted-foreground">
                          <span className="font-bold flex items-center gap-1"><History className="w-3 h-3" /> Recent</span>
                          <button onClick={handleClearRecent} className="hover:text-primary transition-colors text-[10px] uppercase font-black tracking-widest">Clear</button>
                        </div>
                        {recentSearches.map((term, i) => (
                          <div 
                            key={`recent-${i}`} 
                            className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors"
                            onClick={() => handleSearchSelect(term)}
                          >
                            <span>{term}</span>
                            <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <div className="px-4 py-2 text-muted-foreground font-bold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Popular
                      </div>
                      {POPULAR_SEARCHES.map((term, i) => (
                        <div 
                          key={`pop-${i}`} 
                          className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors"
                          onClick={() => handleSearchSelect(term)}
                        >
                          <span>{term}</span>
                          <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div>
                    {searchSuggestions.length > 0 ? (
                      searchSuggestions.map((term: any, i) => (
                        <div 
                          key={`sugg-${i}`} 
                          className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors"
                          onClick={() => handleSearchSelect(String(term))}
                        >
                          <span>{String(term)}</span>
                          <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-center text-muted-foreground uppercase tracking-widest text-[10px]">
                        No matching crops found
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto flex w-full">
        
        {/* Left Sidebar Layout */}
        <aside className="w-20 sm:w-24 md:w-60 lg:w-72 bg-secondary border-r border-border shrink-0 md:sticky md:top-[116px] md:h-[calc(100vh-116px)] md:overflow-y-auto no-scrollbar flex flex-col z-20">
          <div className="hidden md:block px-6 py-6 pb-2 border-b border-border mb-2 sticky top-0 bg-secondary/95 backdrop-blur-sm z-10">
            <h2 className="text-xl font-black uppercase tracking-tight">Categories</h2>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">Fresh harvest daily</p>
          </div>
          
          <div className="flex flex-col w-full px-1.5 md:px-3 gap-1 pt-2 md:pt-0 pb-8">
            {lastFetched === 0 ? (
              // Sleek skeleton category loaders matching identical dimensions
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`cat-skeleton-${i}`}
                  className="flex flex-col md:flex-row items-center md:justify-start gap-1 md:gap-3 p-2.5 md:px-4 md:py-3.5 rounded-[14px] w-full border border-transparent animate-pulse"
                >
                  <div className="w-11 h-11 md:w-10 md:h-10 rounded-full bg-muted shrink-0" />
                  <div className="h-3 md:h-4 bg-muted rounded w-10 md:w-24 mt-1 md:mt-0" />
                </div>
              ))
            ) : (
              allUiCategories.map((cat) => {
                if (!cat) return null;
                const isActive = categoryFilter?.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setSearchParams({ category: cat });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`flex flex-col md:flex-row items-center md:justify-start gap-1 md:gap-3 p-2.5 md:px-4 md:py-3.5 rounded-[14px] transition-all w-full relative group ${
                      isActive 
                        ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-border/80 text-primary z-10' 
                        : 'text-muted-foreground border border-transparent hover:bg-white/50 active:bg-black/5 hover:text-foreground'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-md md:hidden" />
                    )}
                    <div className={`w-11 h-11 md:w-10 md:h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center transition-colors relative ${isActive ? 'bg-primary/10' : 'bg-background border border-border group-hover:border-primary/30'}`}>
                      {cat === 'All Products' ? (
                        <ShoppingBag className={`w-5 h-5 md:w-4 md:h-4 text-primary ${isActive ? 'opacity-100 scale-110' : 'opacity-70'}`} />
                      ) : (
                        <img src={getCategoryImage(cat, categoryImages) || null} alt={cat} className={`w-full h-full object-cover ${isActive ? 'opacity-100 scale-110' : 'opacity-85 group-hover:opacity-100'} transition-all`} />
                      )}
                    </div>
                    <span className={`text-[9px] md:text-sm text-center md:text-left leading-tight mt-1 md:mt-0 md:normal-case md:font-bold ${isActive ? 'font-black uppercase tracking-widest text-primary md:text-foreground' : 'font-semibold tracking-wide md:tracking-normal'} break-words w-full`}>
                      {cat === 'All Products' ? 'All' : formatCategoryName(cat)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Main Content Side */}
        <main className="flex-1 relative z-10">
          <div className="p-3 sm:p-5 md:p-8 min-h-full flex flex-col bg-white">
            {/* Desktop header with search */}
            <div className="hidden md:flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center mb-8 border-b border-border pb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-foreground line-clamp-1">{categoryFilter === 'All Products' ? 'The Harvest' : categoryFilter} <span className="text-primary font-bold hidden xl:inline-block">/ Fresh Selection</span></h1>
                <p className="text-sm text-muted-foreground mt-2 font-medium">Delivering premium ingredients, responsibly sourced.</p>
              </div>
              
              <div className="flex gap-3 w-full lg:w-auto relative">
                <div className="relative w-full lg:w-[400px] shrink-0 search-container">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Search active crop rosters..." 
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => setIsSearchFocused(true)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-full border border-border text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-secondary placeholder-muted-foreground transition-colors"
                  />
                  {isSearchFocused && (
                    <div className="absolute top-full mt-2 w-full bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden text-xs py-2">
                       {!searchQuery ? (
                        <>
                          {recentSearches.length > 0 && (
                            <div className="mb-2">
                              <div className="flex items-center justify-between px-4 py-2 text-muted-foreground">
                                <span className="font-bold flex items-center gap-1"><History className="w-3 h-3" /> Recent Searches</span>
                                <button onClick={handleClearRecent} className="hover:text-primary transition-colors text-[10px] uppercase font-black tracking-widest">Clear</button>
                              </div>
                              {recentSearches.map((term, i) => (
                                <div 
                                  key={`recent-${i}`} 
                                  className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors"
                                  onClick={() => handleSearchSelect(term)}
                                >
                                  <span>{term}</span>
                                  <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                                </div>
                              ))}
                            </div>
                          )}
                          <div>
                            <div className="px-4 py-2 text-muted-foreground font-bold flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> Popular Searches
                            </div>
                            {POPULAR_SEARCHES.map((term, i) => (
                              <div 
                                key={`pop-${i}`} 
                                className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors"
                                onClick={() => handleSearchSelect(term)}
                              >
                                <span>{term}</span>
                                <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div>
                          {searchSuggestions.length > 0 ? (
                            searchSuggestions.map((term: any, i) => (
                              <div 
                                key={`sugg-${i}`} 
                                className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors"
                                onClick={() => handleSearchSelect(String(term))}
                              >
                                <span>{String(term)}</span>
                                <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-4 text-center text-muted-foreground uppercase tracking-widest text-[10px]">
                              No matching crops found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowFilterModal(true)} className="px-4 py-3.5 rounded-full bg-secondary text-foreground text-sm font-bold flex items-center gap-2 border border-border hover:border-primary/50 transition-colors shrink-0">
                  <Filter className="w-4 h-4"/> Filter
                </button>
              </div>
            </div>
            
            <div className="md:hidden flex items-center justify-between mb-4 pb-2 border-b border-border w-full">
               <h2 className="text-lg font-black tracking-tight">{categoryFilter === 'All Products' ? 'All Items' : formatCategoryName(categoryFilter)}</h2>
               <button onClick={() => setShowFilterModal(true)} className="p-2 rounded-lg bg-secondary text-foreground text-xs font-bold flex items-center gap-1.5 shrink-0 border border-transparent active:bg-black/5">
                  <Filter className="w-3.5 h-3.5"/> Filter
               </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 pb-6">
              <AnimatePresence mode="popLayout">
                {((loading || storeLoading) && products.length === 0) ? (
                  Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)
                ) : isOffline ? (
                  <div className="col-span-full mt-10 py-16 text-center text-muted-foreground font-sans text-sm border border-dashed border-border rounded-3xl p-8 bg-secondary flex flex-col items-center gap-4">
                    <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-2">
                      <Zap className="w-6 h-6" />
                    </div>
                    <b>Connection Issue</b>
                    <span className="text-xs max-w-sm font-medium">Our database is currently blocking access. Refetch failed.</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-muted-foreground uppercase tracking-widest text-[10px] font-bold">
                    No matching fresh items available
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const displayCategory = (product.category || '').replace(/ font-bold/gi, '');
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        key={product.id}
                      >
                        <ProductCard 
                          product={product} 
                          onAddToCart={handleAddToCart} 
                          displayCategoryOverride={displayCategory} 
                        />
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>

            {/* Pagination scrolling trigger */}
            {hasMore && filteredProducts.length > 0 && (
              <div ref={bottomRef} className="col-span-full py-10 text-center flex items-center justify-center">
                {loadingNext ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] uppercase font-black tracking-wider text-primary">Gathering more fresh garden picks...</span>
                  </div>
                ) : (
                  <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground bg-secondary px-4 py-2 rounded-full border border-border cursor-pointer">Scroll for more</span>
                )}
              </div>
            )}


          </div>
        </main>
      </div>

      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setShowFilterModal(false)}>
          <div 
            className="w-full sm:w-96 bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-xl transform transition-transform animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-xl uppercase tracking-tight">Filters</h3>
              <button onClick={() => setShowFilterModal(false)} className="p-2 bg-secondary rounded-full hover:bg-black/5 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Max Price</label>
                  <span className="font-black text-primary">₹{maxPrice}</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="5000" 
                  step="50"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" 
                />
                <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground mt-2">
                  <span>₹0</span>
                  <span>₹5000+</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowFilterModal(false)}
              className="w-full mt-8 py-3.5 bg-primary text-white font-black text-sm uppercase tracking-widest rounded-xl hover:bg-[#09120b] transition-colors"
            >
              Apply Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
