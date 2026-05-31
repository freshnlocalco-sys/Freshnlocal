import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { Search, ShoppingBag, Plus, Sparkles, Filter, Leaf, Heart, Wind, Flame, Star, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';

// Definitions for the 6 menu sections seen in the customer image
export type JuiceSubCategory = 'cold-pressed' | 'detox' | 'satvik' | 'smoothies' | 'sweet-cravings' | 'special';

export interface MenuCategoryInfo {
  id: JuiceSubCategory;
  name: string;
  tagline: string;
  accent: string;
  bgLight: string;
}

const JUICE_SECTIONS: MenuCategoryInfo[] = [
  { id: 'cold-pressed', name: 'Cold Pressed Juices', tagline: '100% natural raw hydraulic squeeze', accent: '#f97316', bgLight: 'bg-orange-500/5' },
  { id: 'detox', name: 'Detox Juices', tagline: 'Power cell cleansing & skin illumination', accent: '#dc2626', bgLight: 'bg-red-500/5' },
  { id: 'satvik', name: 'Satvik', tagline: 'Yogic hydration, cooling botanical remedies', accent: '#059669', bgLight: 'bg-emerald-500/5' },
  { id: 'smoothies', name: 'Sugar Free Smoothies', tagline: 'Rich avocado, Greek yogurt & kesar whip', accent: '#8b5cf6', bgLight: 'bg-purple-500/5' },
  { id: 'sweet-cravings', name: 'Sweet Cravings', tagline: 'Saffron badam thandai & velvet shakes', accent: '#ec4899', bgLight: 'bg-pink-500/5' },
  { id: 'special', name: 'Our Special', tagline: 'Stunning Matcha & Rose nectar layers', accent: '#0284c7', bgLight: 'bg-sky-500/5' }
];

// Fully compiled catalog matching user's loaded menu board image precisely
export const AUTHENTIC_FNL_JUICES: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { subCategory: JuiceSubCategory }> = [
  // COLD PRESSED JUICES
  {
    name: "Fresh Tender Coconut",
    price: 75,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Naturally sweet, fat-free raw hydration extracted fresh from selected coastal water coconuts.",
    imageUrl: "https://images.unsplash.com/photo-1563219037-c87b4178901b?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Watermelon Juice",
    price: 60,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Pure hydraulic pressure extraction from sun-ripened red watermelons. Ultimate crisp freshness.",
    imageUrl: "https://images.unsplash.com/photo-1589733911223-99d43527db09?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Mosambi Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Classic sweet lime nectar, rich in vitamin C, pressed cold right before dispatch.",
    imageUrl: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Watermelon Punch",
    price: 80,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Exquisite fusion of crisp watermelon, dynamic mint undertone and fresh lime notes.",
    imageUrl: "https://images.unsplash.com/photo-1546173159-315724a31696?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Juice",
    price: 80,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Lush pulp of selected regional mangoes cold-pushed to make a smooth golden velvet juice.",
    imageUrl: "https://images.unsplash.com/photo-1534080391025-a7db5eedcc4f?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Orange Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Sun-golden Nagpur oranges pressed cold with pulp particles for a full spectrum sweet and tangy experience.",
    imageUrl: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Pineapple Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Lively tropical pineapple elixir cold-squeezed to maintain dietary enzymes and bright flavor.",
    imageUrl: "https://images.unsplash.com/photo-1550950158-d0d960dff51b?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Fresh Apple Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Rich sweet nectar extracted from selected crisp Kashmir Red Apples. 100% natural oxidization-guarded.",
    imageUrl: "https://images.unsplash.com/photo-1610397613000-f03e8575364e?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Maltamelon Juice",
    price: 120,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Specialized double melon press bringing together honeydew and red watermelons.",
    imageUrl: "https://images.unsplash.com/photo-1508888620463-90d3e51dd13a?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Kiwi Cold Wave",
    price: 120,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Slightly tart, vitamin-heavy green kiwi press with sweet apple base tones.",
    imageUrl: "https://images.unsplash.com/photo-1589416515438-e6ed45f573af?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Pomegranate Paloma",
    price: 150,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "High antioxidant deep crimson ruby pomegranate arils pressed cold with a twist of lime.",
    imageUrl: "https://images.unsplash.com/photo-1618331835717-801e976710b2?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Guava Kick",
    price: 150,
    category: "fnl juices",
    subCategory: "cold-pressed",
    description: "Creamy pink guava cold-pressed with a dusting of safe hand-pounded red spices for that classic local kick.",
    imageUrl: "https://images.unsplash.com/photo-1533038597257-39d5f36d7570?w=600&auto=format&fit=crop&q=80",
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
    imageUrl: "https://images.unsplash.com/photo-1610970881699-44a5587caa90?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Green Goodness",
    price: 100,
    category: "fnl juices",
    subCategory: "detox",
    description: "Nutrient-packed juice of spinach, mint, cucumber, celery, kiwi and green apple.",
    imageUrl: "https://images.unsplash.com/photo-1606772733959-c214e15167a3?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Wheatgrass Juice",
    price: 100,
    category: "fnl juices",
    subCategory: "detox",
    description: "Raw living chlorophyll shot of fresh tender wheatgrass, cold-pressed with touch of sweet apple.",
    imageUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Grapes Glow",
    price: 150,
    category: "fnl juices",
    subCategory: "detox",
    description: "Anti-ageing deep black grape juice cold-pressed to release skin-loving resveratrol.",
    imageUrl: "https://images.unsplash.com/photo-1603569283847-aa295f0d016a?w=600&auto=format&fit=crop&q=80",
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
    imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Coconut Kulukki",
    price: 120,
    category: "fnl juices",
    subCategory: "satvik",
    description: "Famous shaken coconut water with sweet basil seeds (sabja), crushed ginger and green chili slice.",
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Kokum Katira",
    price: 120,
    category: "fnl juices",
    subCategory: "satvik",
    description: "Tangy Konkan kokum fruit skin infusion blended with natural cooling tragacanth gum (gond katira).",
    imageUrl: "https://images.unsplash.com/photo-1595981267035-7b04ec84a82d?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Jamun Shikanji",
    price: 120,
    category: "fnl juices",
    subCategory: "satvik",
    description: "Traditional cooling lemonade enriched with seasonal black plum (jamun) pulp and rock salts.",
    imageUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Super Sattu",
    price: 200,
    category: "fnl juices",
    subCategory: "satvik",
    description: "High-protein roasted gram flour energy drink spiced with mint, green chili, chat masala and cold spring water.",
    imageUrl: "https://images.unsplash.com/photo-1517256064527-09c53b2d0bc6?w=600&auto=format&fit=crop&q=80",
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
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Strawberry Smoothie",
    price: 150,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Creamy sugar-free blend of hand-picked strawberries, Greek yogurt, and zero-calorie plant nectar.",
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Mixberry Smoothie",
    price: 200,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Fabulous blend of cold blueberries, raspberries, strawberries, and rich avocado base.",
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Moringa Avocado Smoothie",
    price: 200,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Extreme green boost: organic moringa leaves, creamy avocado, and ripe naturally sweet banana.",
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Smoothie",
    price: 150,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Creamy whipped Alphonso mango pulp blended with unsweetened organic almond milk.",
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Papaya Apricot Smoothie",
    price: 200,
    category: "fnl juices",
    subCategory: "smoothies",
    description: "Rich digestion-friendly blend of tropical papaya, Turkish apricots, and cardamoms.",
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80",
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
    imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Coco Drip",
    price: 100,
    category: "fnl juices",
    subCategory: "sweet-cravings",
    description: "Indulgent coconut milk chocolate milkshake crafted with premium cocoa and coconut bits.",
    imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Coco Drip with Mango",
    price: 150,
    category: "fnl juices",
    subCategory: "sweet-cravings",
    description: "Fabulous double drip combining rich coconut chocolate milkshake with mango pulp swirls.",
    imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Kesar Badam Thandai",
    price: 150,
    category: "fnl juices",
    subCategory: "sweet-cravings",
    description: "Rich traditional royal beverage loaded with saffron, almonds, fennel seeds, and cardamoms.",
    imageUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
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
    imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Peach Ice Tea",
    price: 180,
    category: "fnl juices",
    subCategory: "special",
    description: "Brewed mountain black tea leaves chilled over fresh peach puree chunks and mint.",
    imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Cherry Vanilla Cloud",
    price: 180,
    category: "fnl juices",
    subCategory: "special",
    description: "Sweet dark red cherries cold pressed and blended with natural Madagascar vanilla pods.",
    imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Coconut Matcha",
    price: 300,
    category: "fnl juices",
    subCategory: "special",
    description: "Ceremonial Uji Japanese green matcha whisked directly over chilled sweet coconut water & tender coconut meat pulp.",
    imageUrl: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Matcha",
    price: 300,
    category: "fnl juices",
    subCategory: "special",
    description: "Stunning layer of organic stoneground Japanese matcha whisked over fresh sweet mango nectar.",
    imageUrl: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  },
  {
    name: "Mango Sticky Rice",
    price: 300,
    category: "fnl juices",
    subCategory: "special",
    description: "Traditional sweet Thai dessert drink: layered rich coconut milk cream, pandan, sticky rice essence and pure mango pulp.",
    imageUrl: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&auto=format&fit=crop&q=80",
    stock: 100,
    inStock: true
  }
];

export function FNLJuice() {
  const [juices, setJuices] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubCategory, setActiveSubCategory] = useState<JuiceSubCategory | 'all'>('all');
  const [seeding, setSeeding] = useState(false);
  
  const { addItem } = useCart();

  // Helper mapping subcategory names
  const getSubCategory = (product: Product | any): JuiceSubCategory => {
    if (product.subCategory) return product.subCategory as JuiceSubCategory;
    const match = AUTHENTIC_FNL_JUICES.find(item => item.name.toLowerCase() === product.name.toLowerCase());
    return match ? match.subCategory : 'cold-pressed';
  };

  useEffect(() => {
    async function fetchAndSeedJuices() {
      try {
        setLoading(true);
        const q = query(collection(db, 'products'));
        const querySnapshot = await getDocs(q);
        const allProducts = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];

        const currentJuices = allProducts.filter(p => {
          const cat = p.category ? p.category.toLowerCase().trim() : '';
          return cat === 'fnl juices' || cat === 'fnl juice';
        });

        // Seed with authentic products if empty in database
        if (currentJuices.length === 0) {
          setSeeding(true);
          const batch = writeBatch(db);
          
          AUTHENTIC_FNL_JUICES.forEach(item => {
            const newDocRef = doc(collection(db, 'products'));
            batch.set(newDocRef, {
              ...item,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          });

          await batch.commit();
          toast.success("Synchronized Fresh N Local signature menu board to cloud databases!");
          
          // Re-fetch
          const freshSnapshot = await getDocs(q);
          const freshProducts = freshSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
          const freshlyCataloged = freshProducts.filter(p => {
            const cat = p.category ? p.category.toLowerCase().trim() : '';
            return cat === 'fnl juices' || cat === 'fnl juice';
          });
          setJuices(freshlyCataloged);
        } else {
          setJuices(currentJuices);
        }
      } catch (error: any) {
        // Fall back gracefully to static state if database has issues/exceeds quotas
        console.warn("Database fallback to memory model:", error);
        const memoryJuices = AUTHENTIC_FNL_JUICES.map((item, index) => ({
          id: `mem-${index}`,
          ...item,
          price: Number(item.price),
        })) as unknown as Product[];
        setJuices(memoryJuices);
      } finally {
        setLoading(false);
        setSeeding(false);
      }
    }
    fetchAndSeedJuices();
  }, []);

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

  // Perform filtering
  const filteredJuices = juices.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (activeSubCategory === 'all') return matchesSearch;
    const itemSubCat = getSubCategory(item);
    return matchesSearch && itemSubCat === activeSubCategory;
  });

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#1A1A19] py-16 px-4 md:px-8 font-sans antialiased">
      <div className="max-w-6xl mx-auto space-y-16">
        
        {/* Minimalist Editorial Header */}
        <div className="border-b border-neutral-200/80 pb-12 text-center md:text-left space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400 block font-mono">
                Est. Surat 2026 // Raw Cold Squeezed No Pasteurization
              </span>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-[#151515] leading-none">
                Fresh N Local Juice House
              </h1>
              <p className="text-neutral-500 text-xs sm:text-sm font-medium max-w-2xl leading-relaxed">
                Raw, cold-extracted juices with zero water or artificial preservatives. Handcrafted daily at 4:30 AM to capture living enzymes in premium recyclable glass flasks. Wellness and purity in every sip.
              </p>
            </div>
            
            {/* Quick stats board */}
            <div className="flex gap-4 self-center md:self-end text-left border border-neutral-200 bg-white/60 p-4 rounded-2xl">
              <div>
                <span className="text-[8px] font-black tracking-widest text-neutral-400 uppercase block">Daily Flavors</span>
                <span className="text-xl font-black text-[#151515]">37 Blends</span>
              </div>
              <div className="w-px bg-neutral-200" />
              <div>
                <span className="text-[8px] font-black tracking-widest text-[#059669] uppercase block">Purity Ratio</span>
                <span className="text-xl font-black text-[#059669]">100% Raw</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar & Categories Tabs (Extreme Minimal Design) */}
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            
            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center md:justify-start">
              <button
                onClick={() => setActiveSubCategory('all')}
                className={`px-4 py-2 rounded-full text-[9px] font-black tracking-widest uppercase transition-all duration-200 border ${
                  activeSubCategory === 'all'
                    ? 'bg-[#151515] text-white border-transparent'
                    : 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-600'
                }`}
              >
                Show All
              </button>
              {JUICE_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSubCategory(section.id)}
                  className={`px-4 py-2 rounded-full text-[9px] font-black tracking-widest uppercase transition-all duration-200 border flex items-center gap-1.5 ${
                    activeSubCategory === section.id
                      ? 'bg-[#151515] text-white border-transparent shadow-sm'
                      : 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-600'
                  }`}
                >
                  {section.id === 'cold-pressed' && <Flame className="w-3 h-3 text-orange-500" />}
                  {section.id === 'detox' && <Wind className="w-3 h-3 text-red-500" />}
                  {section.id === 'satvik' && <Leaf className="w-3 h-3 text-emerald-500" />}
                  {section.id === 'smoothies' && <Check className="w-3 h-3 text-purple-500" />}
                  {section.id === 'sweet-cravings' && <Heart className="w-3 h-3 text-pink-500" />}
                  {section.id === 'special' && <Star className="w-3 h-3 text-sky-500 animate-pulse" />}
                  {section.name}
                </button>
              ))}
            </div>

            {/* Minimal Search Field */}
            <div className="relative w-full md:w-72 shrink-0 bg-white rounded-full border border-neutral-200 p-1">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                <Search className="w-3.5 h-3.5 text-neutral-400" />
              </div>
              <input
                type="text"
                placeholder="Find botanical elixir..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-4 py-1.5 focus:outline-none bg-transparent text-[10px] sm:text-xs text-neutral-800 font-medium tracking-wider uppercase placeholder-neutral-400"
              />
            </div>

          </div>
        </div>

        {/* Content Section */}
        {loading || seeding ? (
          <div className="py-24 text-center text-neutral-400 font-mono text-[10px] uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-4">
            <span className="w-6 h-6 rounded-full border-t-2 border-neutral-800 animate-spin"></span>
            Syncing Cold pressed inventory databases...
          </div>
        ) : (
          <div className="space-y-16">
            
            {/* Split view or grid for each section or filtered items */}
            <AnimatePresence mode="wait">
              <motion.div 
                layout 
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
              >
                {filteredJuices.map((product) => {
                  const subCatId = getSubCategory(product);
                  const subCatInfo = JUICE_SECTIONS.find(s => s.id === subCatId);
                  
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      key={product.id}
                      className="bg-white rounded-2xl overflow-hidden border border-neutral-200/80 hover:border-neutral-800 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 flex flex-col h-full group"
                    >
                      {/* Image container with subtle visual theme */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-50 border-b border-neutral-100">
                        <img
                          src={product.imageUrl || 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&auto=format&fit=crop&q=80'}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        
                        {/* Elegant floating sub-category label */}
                        {subCatInfo && (
                          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-200 shadow-sm">
                            <span className="text-[7.5px] font-black uppercase tracking-widest text-neutral-800">
                              {subCatInfo.name}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info & Typography block */}
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <h3 className="text-[13px] font-black uppercase tracking-wider text-neutral-900 leading-tight">
                            {product.name}
                          </h3>
                          <p className="text-[10px] text-neutral-500 leading-relaxed font-normal normal-case break-words">
                            {product.description || "Fresh raw formulation mixed and extracted cold to retain vitamins."}
                          </p>
                        </div>

                        {/* Price & Cart block */}
                        <div className="pt-4 border-t border-neutral-100 flex items-center justify-between mt-auto">
                          <div>
                            <span className="text-[8px] font-bold text-neutral-400 uppercase block tracking-wider">price</span>
                            <span className="text-base font-black text-neutral-900 tracking-tight">
                              ₹{product.price}
                            </span>
                          </div>

                          <button
                            onClick={() => handleAddToCart(product)}
                            className="bg-neutral-900 hover:bg-[#059669] text-white p-3 rounded-full transition-all duration-300 hover:scale-105 select-none cursor-pointer flex items-center justify-center"
                            title="Add to Squeeze Basket"
                          >
                            <ShoppingCartIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {filteredJuices.length === 0 && (
                  <div className="col-span-full py-20 text-center text-neutral-400 font-mono text-[10px] uppercase tracking-widest border border-dashed border-neutral-200 rounded-2xl bg-white/40">
                    No matching juices found under current search / filter options.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

          </div>
        )}

        {/* Minimal Bottom Info Section matching premium juice shop menus */}
        <div className="bg-white border border-neutral-200 rounded-[24px] p-6 sm:p-10 text-center max-w-3xl mx-auto space-y-6">
          <Leaf className="w-8 h-8 text-[#059669] mx-auto animate-pulse" />
          <h3 className="text-sm font-black uppercase tracking-widest text-[#151515]">The Cold-Pressed Commitment</h3>
          <p className="text-xs text-neutral-500 leading-relaxed max-w-xl mx-auto normal-case font-medium">
            At Fresh N Local Juice House, we do not compromise. We never use pasteurization or heat treatment, which kills living vitamins and enzymes. Absolutely no chemical colors, artificial fillers, table sugars, or frozen syrups. Pure goodness in every bottle.
          </p>
          <div className="pt-4 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div>
              <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block mb-1">Contact Us</span>
              <span className="text-[10px] font-bold text-neutral-800 uppercase">+91 72840 00883</span>
            </div>
            <div>
              <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block mb-1">Official Email</span>
              <span className="text-[10px] font-bold text-neutral-800 font-mono">freshnlocalco@gmail.com</span>
            </div>
            <div>
              <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 block mb-1">Surat Address</span>
              <span className="text-[10px] font-bold text-neutral-800 uppercase leading-snug">Gr Floor Hall, Reva Dham, Uma Bhawan Road</span>
            </div>
          </div>
        </div>

      </div>
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
