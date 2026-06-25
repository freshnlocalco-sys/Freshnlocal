import React, { useEffect, useState } from 'react';
import { collection, query, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { useProducts } from '../store/useProducts';
import { Search, ShoppingBag, Plus, Sparkles, Filter, Leaf, Heart, Wind, Flame, Star, Check, X, History, TrendingUp, Zap } from 'lucide-react';
import { ProductSkeleton } from '../components/ProductSkeleton';
import { ProductCard } from '../components/ProductCard';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSettings } from '../store/useSettings';

// Definitions for dynamic menu sections
export type JuiceSubCategory = string;

export interface MenuCategoryInfo {
  id: JuiceSubCategory;
  name: string;
  tagline: string;
  accent: string;
  bgLight: string;
}

// Static juice definitions removed. Using dynamic store categories.

// Fully compiled catalog matching user's loaded menu board image precisely
export const AUTHENTIC_FNL_JUICES: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'imageUrl'> & { subCategory: JuiceSubCategory, imageUrl?: string }> = [
  // COLD PRESSED JUICES
  {
    name: "Fresh Tender Coconut",
    price: 75,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Naturally sweet, fat-free raw hydration extracted fresh from selected coastal water coconuts.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Watermelon Juice",
    price: 60,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Pure hydraulic pressure extraction from sun-ripened red watermelons. Ultimate crisp freshness.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Mosambi Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Classic sweet lime nectar, rich in vitamin C, pressed cold right before dispatch.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Watermelon Punch",
    price: 80,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Exquisite fusion of crisp watermelon, dynamic mint undertone and fresh lime notes.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Juice",
    price: 80,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Lush pulp of selected regional mangoes cold-pushed to make a smooth golden velvet juice.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Orange Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Sun-golden Nagpur oranges pressed cold with pulp particles for a full spectrum sweet and tangy experience.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Pineapple Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Lively tropical pineapple elixir cold-squeezed to maintain dietary enzymes and bright flavor.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Apple Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Rich sweet nectar extracted from selected crisp Kashmir Red Apples. 100% natural oxidization-guarded.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Maltamelon Juice",
    price: 120,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Specialized double melon press bringing together honeydew and red watermelons.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Kiwi Cold Wave",
    price: 120,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Slightly tart, vitamin-heavy green kiwi press with sweet apple base tones.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Pomegranate Paloma",
    price: 150,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "High antioxidant deep crimson ruby pomegranate arils pressed cold with a twist of lime.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Guava Kick",
    price: 150,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Creamy pink guava cold-pressed with a dusting of safe hand-pounded red spices for that classic local kick.",
    
    stock: 100,
    inStock: true
  },

  // DETOX JUICES
  {
    name: "ABC Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "detox",
    description: "The classic miracle elixir: Fresh Apple, vibrant Beetroot, and young Carrot. High-performance detox.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Green Goodness",
    price: 100,
    category: "fnl juices",
    subCategory: "detox",
    description: "Nutrient-packed juice of spinach, mint, cucumber, celery, kiwi and green apple.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Wheatgrass Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "detox",
    description: "Raw living chlorophyll shot of fresh tender wheatgrass, cold-pressed with touch of sweet apple.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Grapes Glow",
    price: 150,
    category: "fnl juices",
    subCategory: "detox",
    description: "Anti-ageing deep black grape juice cold-pressed to release skin-loving resveratrol.",
    
    stock: 100,
    inStock: true
  },

  // SATVIK
  {
    name: "Aam Panna",
    price: 120,
    category: "fnl juices",
    subCategory: "satvik",
    description: "Traditional roasted green mango drink flavored with cumin, black salt and mint leaves.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Coconut Kulukki",
    price: 120,
    category: "fnl juices",
    subCategory: "satvik",
    description: "Famous shaken coconut water with sweet basil seeds (sabja), crushed ginger and green chili slice.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Kokum Katira",
    price: 120,
    category: "fnl juices",
    subCategory: "satvik",
    description: "Tangy Konkan kokum fruit skin infusion blended with natural cooling tragacanth gum (gond katira).",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Jamun Shikanji",
    price: 120,
    category: "fnl juices",
    subCategory: "satvik",
    description: "Traditional cooling lemonade enriched with seasonal black plum (jamun) pulp and rock salts.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Super Sattu",
    price: 200,
    category: "fnl juices",
    subCategory: "satvik",
    description: "High-protein roasted gram flour energy drink spiced with mint, green chili, chat masala and cold spring water.",
    
    stock: 100,
    inStock: true
  },

  // SUGAR FREE SMOOTHIES
  {
    name: "Muskmelon Kesar Smoothie",
    price: 150,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Thick musk melon base infused with finest saffron (kesar) strands without any added sugar.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Strawberry Smoothie",
    price: 150,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Creamy sugar-free blend of hand-picked strawberries, Greek yogurt, and zero-calorie plant nectar.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Mixberry Smoothie",
    price: 200,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Fabulous blend of cold blueberries, raspberries, strawberries, and rich avocado base.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Moringa Avocado Smoothie",
    price: 200,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Extreme green boost: organic moringa leaves, creamy avocado, and ripe naturally sweet banana.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Smoothie",
    price: 150,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Creamy whipped Alphonso mango pulp blended with unsweetened organic almond milk.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Papaya Apricot Smoothie",
    price: 200,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Rich digestion-friendly blend of tropical papaya, Turkish apricots, and cardamoms.",
    
    stock: 100,
    inStock: true
  },

  // SWEET CRAVINGS
  {
    name: "Mango Milkshake",
    price: 80,
    category: "fnl juices",
    subCategory: "sweet-cravings",
    description: "Classic velvety rich milkshake crafted with pure mango pulp and cream.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Coco Drip",
    price: 100,
    category: "fnl juices",
    subCategory: "sweet-cravings",
    description: "Indulgent coconut milk chocolate milkshake crafted with premium cocoa and coconut bits.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Coco Drip with Mango",
    price: 150,
    category: "fnl juices",
    subCategory: "sweet-cravings",
    description: "Fabulous double drip combining rich coconut chocolate milkshake with mango pulp swirls.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Kesar Badam Thandai",
    price: 150,
    category: "fnl juices",
    subCategory: "sweet-cravings",
    description: "Rich traditional royal beverage loaded with saffron, almonds, fennel seeds, and cardamoms.",
    
    stock: 100,
    inStock: true
  },

  // OUR SPECIAL
  {
    name: "Gulabo Litchi",
    price: 150,
    category: "fnl juices",
    subCategory: "special",
    description: "Sensational fragrant rose petal preserve (gulkand) layered with sweet white litchi premium nectar.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Peach Ice Tea",
    price: 180,
    category: "fnl juices",
    subCategory: "special",
    description: "Brewed mountain black tea leaves chilled over fresh peach puree chunks and mint.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Cherry Vanilla Cloud",
    price: 180,
    category: "fnl juices",
    subCategory: "special",
    description: "Sweet dark red cherries cold pressed and blended with natural Madagascar vanilla pods.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Coconut Matcha",
    price: 300,
    category: "fnl juices",
    subCategory: "special",
    description: "Ceremonial Uji Japanese green matcha whisked directly over chilled sweet coconut water & tender coconut meat pulp.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Matcha",
    price: 300,
    category: "fnl juices",
    subCategory: "special",
    description: "Stunning layer of organic stoneground Japanese matcha whisked over fresh sweet mango nectar.",
    
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Sticky Rice",
    price: 300,
    category: "fnl juices",
    subCategory: "special",
    description: "Traditional sweet Thai dessert drink: layered rich coconut milk cream, pandan, sticky rice essence and pure mango pulp.",
    
    stock: 100,
    inStock: true
  }
];

export function FNLJuice() {
  const { juiceCategories, fetchCategoryImages } = useSettings();

  useEffect(() => {
    fetchCategoryImages();
  }, [fetchCategoryImages]);

  const JUICE_SECTIONS = juiceCategories;
  const ALL_JUICE_SECTIONS = React.useMemo(() => {
    return [
      { id: 'all', name: 'All Juices', tagline: 'Every raw cold pressed nectar', accent: '#059669', bgLight: 'bg-emerald-500/5' },
      ...juiceCategories
    ];
  }, [juiceCategories]);

  const { products, loading: storeLoading, fetchProducts, hydrateFromIDB } = useProducts();
  const [juices, setJuices] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubCategory = (searchParams.get('subCategory') || 'all') as JuiceSubCategory | 'all';
  const [seeding, setSeeding] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number>(500);
  
  const { addItem } = useCart();

  // Helper mapping subcategory names
  const getSubCategory = (product: Product | any): JuiceSubCategory => {
    if (product.subCategory) return product.subCategory as JuiceSubCategory;
    const match = AUTHENTIC_FNL_JUICES.find(item => item.name.toLowerCase() === (product.name || '').toLowerCase());
    return match ? match.subCategory : 'cold-pressed';
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      await hydrateFromIDB();
      try {
        await fetchProducts();
      } catch (err) {
        console.error("Error fetching juices:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchProducts, hydrateFromIDB]);

  useEffect(() => {
    async function fetchAndSeedJuices() {
      if (storeLoading) return;
      try {
        const currentJuices = products.filter(p => {
          const cat = p.category ? p.category.toLowerCase().trim() : '';
          return cat === 'fnl juices' || cat === 'fnl juice';
        });

        if (currentJuices.length === 0 && !seeding) {
          setSeeding(true);
          
          const chunks = [];
          for (let i = 0; i < AUTHENTIC_FNL_JUICES.length; i += 100) {
            chunks.push(AUTHENTIC_FNL_JUICES.slice(i, i + 100));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(item => {
              const newDocRef = doc(collection(db, 'products'));
              batch.set(newDocRef, {
                ...item,
                createdAt: Date.now(),
                updatedAt: Date.now()
              });
            });
            await batch.commit();
          }

          toast.success("Synchronized Fresh N Local signature menu board to cloud databases!");
          
          await fetchProducts(true);
          setSeeding(false);
        } else {
          setJuices(currentJuices);
        }
      } catch (error: any) {
        console.warn("Database fallback to memory model:", error);
        const memoryJuices = AUTHENTIC_FNL_JUICES.map((item, index) => ({
          id: `mem-${index}`,
          ...item,
          price: Number(item.price),
        })) as unknown as Product[];
        setJuices(memoryJuices);
      } finally {
        setLoading(false);
      }
    }
    fetchAndSeedJuices();
  }, [products, storeLoading, seeding, fetchProducts]);

  const handleAddToCart = (product: Product) => {
    addItem(product);
    toast.success(`${product.name} added to cart!`, {
      style: {
        background: '#151515',
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        borderRadius: '12px'
      }
    });
  };

  const POPULAR_SEARCHES = React.useMemo(() => {
    // Get distinct in-stock juice names from fetched products
    const activeJuices = juices.filter(p => p.inStock !== false && p.name);
    const uniqueNames: string[] = [];
    for (const p of activeJuices) {
      if (p.name && !uniqueNames.includes(p.name)) {
        uniqueNames.push(p.name);
        if (uniqueNames.length === 5) break;
      }
    }
    
    if (uniqueNames.length >= 3) {
      return uniqueNames;
    }
    
    // Exact authentic catalog names
    return ['Fresh Tender Coconut', 'ABC Juice', 'Wheatgrass Juice', 'Coconut Matcha', 'Strawberry Smoothie'];
  }, [juices]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('recentJuiceSearches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const handleSearchSelect = (term: string) => {
    setSearchQuery(term);
    setIsSearchFocused(false);
    if (!term) return;
    
    const newRecent = [term, ...recentSearches.filter(s => s.toLowerCase() !== term.toLowerCase())].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem('recentJuiceSearches', JSON.stringify(newRecent));
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentJuiceSearches');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSelect(searchQuery);
    }
  };

  // Perform filtering
  const filteredJuicesRaw = juices.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
                          (item.description && item.description.toLowerCase().includes((searchQuery || '').toLowerCase()));
    
    const matchesPrice = typeof item.price === 'number' ? item.price <= maxPrice : true;
    
    if (activeSubCategory === 'all') return matchesSearch && matchesPrice;
    const itemSubCat = getSubCategory(item);
    return matchesSearch && itemSubCat === activeSubCategory && matchesPrice;
  });

  const filteredJuices = React.useMemo(() => {
    const list = [...filteredJuicesRaw];
    const juiceOrder = new Map();
    juiceCategories.forEach((c, i) => juiceOrder.set(c.id, i));

    list.sort((a, b) => {
      const isOutA = a.inStock === false;
      const isOutB = b.inStock === false;

      const subA = getSubCategory(a);
      const subB = getSubCategory(b);
      
      if (subA !== subB) {
         const idxSubA = juiceOrder.has(subA) ? juiceOrder.get(subA) : 999;
         const idxSubB = juiceOrder.has(subB) ? juiceOrder.get(subB) : 999;
         return idxSubA - idxSubB;
      }

      if (isOutA !== isOutB) {
        return isOutA ? 1 : -1;
      }

      return (a.orderIndex ?? 999) - (b.orderIndex ?? 999);
    });
    return list;
  }, [filteredJuicesRaw, juiceCategories]);

  const searchSuggestions = searchQuery
    ? Array.from(new Set(juices
        .filter(p => (p.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()))
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

  const getSectionIcon = (id: string, className: string) => {
    switch (id) {
      case 'all':
        return <ShoppingBag className={className} />;
      case 'cold-pressed':
        return <Flame className={`${className} text-orange-500`} />;
      case 'detox':
        return <Wind className={`${className} text-red-500`} />;
      case 'satvik':
        return <Leaf className={`${className} text-emerald-500`} />;
      case 'smoothies':
        return <Check className={`${className} text-purple-500`} />;
      case 'sweet-cravings':
        return <Heart className={`${className} text-pink-500`} />;
      case 'special':
        return <Star className={`${className} text-sky-500 animate-pulse`} />;
      default:
        return <ShoppingBag className={className} />;
    }
  };

  const activeSubCategoryInfo = ALL_JUICE_SECTIONS.find(s => s.id === activeSubCategory);

  return (
    <div className="w-full max-w-full box-border overflow-x-hidden bg-background text-foreground animate-in fade-in duration-300">
      
      {/* Mobile Search Header */}
      <div className="md:hidden px-3 py-3 bg-background/95 backdrop-blur-md border-b border-border relative z-40">
        <div className="relative w-full search-container z-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
          <input 
            type="text" 
            placeholder="Search raw elixirs..." 
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => setIsSearchFocused(true)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border text-xs text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-white placeholder-muted-foreground transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
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
                        <span className="font-bold flex items-center gap-1 font-sans"><History className="w-3 h-3" /> Recent</span>
                        <button onClick={handleClearRecent} className="hover:text-primary transition-colors text-[10px] uppercase font-black tracking-widest font-sans">Clear</button>
                      </div>
                      {recentSearches.map((term, i) => (
                        <div 
                          key={`recent-${i}`} 
                          className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors font-sans font-semibold"
                          onClick={() => handleSearchSelect(term)}
                        >
                          <span>{term}</span>
                          <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <div className="px-4 py-2 text-muted-foreground font-bold flex items-center gap-1 font-sans font-black">
                      <TrendingUp className="w-3 h-3" /> Popular Elixirs
                    </div>
                    {POPULAR_SEARCHES.map((term, i) => (
                      <div 
                        key={`pop-${i}`} 
                        className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors font-sans font-semibold"
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
                        className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors font-sans font-semibold"
                        onClick={() => handleSearchSelect(String(term))}
                      >
                        <span>{String(term)}</span>
                        <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-center text-muted-foreground uppercase tracking-widest text-[10px] font-sans">
                      No matching sips found
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
            <h2 className="text-xl font-black uppercase tracking-tight">Juice Bar</h2>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium font-mono uppercase tracking-wider">Est. Surat 2026</p>
          </div>
          
          <div className="flex flex-col w-full px-1.5 md:px-3 gap-1 pt-2 md:pt-0 pb-8">
            {ALL_JUICE_SECTIONS.map((section) => {
              const isActive = activeSubCategory === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    setSearchParams({ subCategory: section.id });
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
                  <div className={`w-11 h-11 md:w-10 md:h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center transition-all relative ${isActive ? 'bg-primary/10' : 'bg-background border border-border group-hover:border-primary/30'}`}>
                    {getSectionIcon(section.id, `w-5 h-5 md:w-3.5 md:h-3.5 ${isActive ? 'scale-110' : 'opacity-70'}`)}
                  </div>
                  <span className={`text-[9px] md:text-sm text-center md:text-left leading-tight mt-1 md:mt-0 md:normal-case md:font-bold ${isActive ? 'font-black uppercase tracking-widest text-primary md:text-foreground' : 'font-semibold tracking-wide md:tracking-normal'} break-words w-full`}>
                    {section.name}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Content Side */}
        <main className="flex-1 relative z-10">
          <div className="p-3 sm:p-5 md:p-8 min-h-full flex flex-col bg-white">
            
            {/* Desktop header with search */}
            <div className="hidden md:flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center mb-8 border-b border-border pb-6">
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground block font-mono">
                  Raw Cold Squeezed No Pasteurization
                </span>
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-sans font-black uppercase tracking-tight text-foreground leading-none">
                  {activeSubCategory === 'all' ? 'Signature Blends' : activeSubCategoryInfo?.name}
                </h1>
                <p className="text-muted-foreground text-xs font-semibold max-w-xl leading-relaxed normal-case">
                  {activeSubCategory === 'all' 
                    ? 'Raw, cold-extracted juices with zero added water or artificial preservatives. Handcrafted daily at 4:30 AM to capture living enzymes in premium recyclable glass flasks.' 
                    : activeSubCategoryInfo?.tagline}
                </p>
              </div>
              
              <div className="flex gap-3 w-full xl:w-auto relative search-container">
                <div className="relative w-full xl:w-[320px] shrink-0">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Search raw menu board..." 
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => setIsSearchFocused(true)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-full border border-border text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-secondary placeholder-muted-foreground transition-colors mix-blend-normal"
                  />
                  {isSearchFocused && (
                    <div className="absolute top-full mt-2 w-full bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden text-xs py-2">
                       {!searchQuery ? (
                        <>
                          {recentSearches.length > 0 && (
                            <div className="mb-2 w-full">
                              <div className="flex items-center justify-between px-4 py-2 text-muted-foreground">
                                <span className="font-bold flex items-center gap-1 font-sans"><History className="w-3 h-3" /> Recent Searches</span>
                                <button onClick={handleClearRecent} className="hover:text-primary transition-colors text-[10px] uppercase font-black tracking-widest font-sans">Clear</button>
                              </div>
                              {recentSearches.map((term, i) => (
                                <div 
                                  key={`recent-${i}`} 
                                  className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors font-sans font-semibold"
                                  onClick={() => handleSearchSelect(term)}
                                >
                                  <span>{term}</span>
                                  <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="w-full">
                            <div className="px-4 py-2 text-muted-foreground font-bold flex items-center gap-1 font-sans">
                              <TrendingUp className="w-3 h-3" /> Popular Searches
                            </div>
                            {POPULAR_SEARCHES.map((term, i) => (
                              <div 
                                key={`pop-${i}`} 
                                className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors font-sans font-semibold"
                                onClick={() => handleSearchSelect(term)}
                              >
                                <span>{term}</span>
                                <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="w-full">
                          {searchSuggestions.length > 0 ? (
                            searchSuggestions.map((term: any, i) => (
                              <div 
                                key={`sugg-${i}`} 
                                className="px-4 py-2 hover:bg-secondary cursor-pointer flex items-center justify-between group text-foreground transition-colors font-sans font-semibold"
                                onClick={() => handleSearchSelect(String(term))}
                              >
                                <span>{String(term)}</span>
                                <Search className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-4 text-center text-muted-foreground uppercase tracking-widest text-[10px] font-sans">
                              No matching sips found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowFilterModal(true)} className="px-4 py-3.5 rounded-full bg-secondary text-foreground text-sm font-bold flex items-center gap-2 border border-border hover:border-primary/50 transition-colors shrink-0 cursor-pointer">
                  <Filter className="w-4 h-4"/> Filter
                </button>
              </div>
            </div>
            
            {/* Mobile Header view */}
            <div className="md:hidden flex items-center justify-between mb-4 pb-2 border-b border-border w-full">
               <h2 className="text-lg font-black tracking-tight">{activeSubCategory === 'all' ? 'Signature Juices' : activeSubCategoryInfo?.name}</h2>
               <button onClick={() => setShowFilterModal(true)} className="p-2 rounded-lg bg-secondary text-foreground text-xs font-bold flex items-center gap-1.5 shrink-0 border border-transparent active:bg-black/5 cursor-pointer">
                  <Filter className="w-3.5 h-3.5"/> Filter
               </button>
            </div>

            {/* Product lists/Grid with Skeleton Loading and Lazy Image renderers */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 pb-12">
              {(loading || seeding || storeLoading) && juices.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)
              ) : filteredJuices.length === 0 ? (
                <div className="col-span-full py-24 text-center text-muted-foreground font-sans text-xs uppercase tracking-widest border border-dashed border-border rounded-w p-8">
                  This menu section is currently resting or empty under ₹{maxPrice}.
                </div>
              ) : (
                filteredJuices.map((product) => {
                  const subCatId = getSubCategory(product);
                  const subCatInfo = JUICE_SECTIONS.find(s => s.id === subCatId);
                  return (
                    <ProductCard 
                      key={product.id} 
                      product={product} 
                      onAddToCart={handleAddToCart} 
                      displayCategoryOverride={subCatInfo?.name || "Cold-Pressed"} 
                    />
                  );
                })
              )}
            </div>



            {/* Vintage style bottom informational banner */}
            <div className="bg-secondary border border-border rounded-[24px] p-6 sm:p-10 text-center max-w-3xl mx-auto space-y-6 mt-1 w-full">
              <Leaf className="w-8 h-8 text-[#059669] mx-auto animate-pulse" />
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">The Cold-Pressed Commitment</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl mx-auto normal-case font-medium">
                At Fresh N Local Juice House, we do not compromise. We never use pasteurization or heat treatment, which kills living vitamins and enzymes. Absolutely no chemical colors, artificial fillers, table sugars, or frozen syrups. Pure goodness in every bottle.
              </p>
              <div className="pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
                <div>
                  <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block mb-1">Contact Us</span>
                  <span className="text-[10px] font-bold text-foreground">+91 72840 00883</span>
                </div>
                <div>
                  <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block mb-1">Official Email</span>
                  <span className="text-[10px] font-bold text-foreground font-mono">freshnlocalco@gmail.com</span>
                </div>
                <div>
                  <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block mb-1">Surat Address</span>
                  <span className="text-[10px] font-bold text-foreground uppercase leading-snug">Gr Floor Hall, Reva Dham, Uma Bhawan Road</span>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* Filter Modal for Juices */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs transition-opacity" onClick={() => setShowFilterModal(false)}>
          <div 
            className="w-full sm:w-96 bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-xl transform transition-transform animate-in slide-in-from-bottom-5" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-xl uppercase tracking-tight">Filters</h3>
              <button onClick={() => setShowFilterModal(false)} className="p-2 bg-secondary rounded-full hover:bg-black/5 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-2 text-left">Max Price</label>
                  <span className="font-black text-primary">₹{maxPrice}</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="500" 
                  step="10"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" 
                />
                <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground mt-2">
                  <span>₹0</span>
                  <span>₹500+</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowFilterModal(false)}
              className="w-full mt-8 py-3.5 bg-primary text-white font-black text-sm uppercase tracking-widest rounded-xl hover:bg-[#09120b] transition-colors cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom simple inline cart icon
function ShoppingCartIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}
