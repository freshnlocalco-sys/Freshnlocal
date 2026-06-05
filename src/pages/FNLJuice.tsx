import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { Product, useCart } from '../store/useCart';
import { Search, ShoppingBag, Plus, Sparkles, Filter, Leaf, Heart, Wind, Flame, Star, Check } from 'lucide-react';
import { ProductSkeleton } from '../components/ProductSkeleton';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

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
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 w-full bg-background text-foreground">
      <div className="mb-14">
        
        {/* Minimalist Editorial Header */}
        <div className="border-b border-border pb-12 text-center md:text-left space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground block font-mono">
                Est. Surat 2026 // Raw Cold Squeezed No Pasteurization
              </span>
              <h1 className="text-4xl md:text-7xl font-sans font-black uppercase tracking-tight text-foreground leading-none">
                Fresh N Local Juice House
              </h1>
              <p className="text-muted-foreground text-xs font-semibold max-w-xl leading-relaxed">
                Raw, cold-extracted juices with zero water or artificial preservatives. Handcrafted daily at 4:30 AM to capture living enzymes in premium recyclable glass flasks. Wellness and purity in every sip.
              </p>
            </div>
            
            {/* Quick stats board */}
            <div className="flex gap-4 self-center md:self-end text-left border border-border bg-secondary p-4 rounded-2xl">
              <div>
                <span className="text-[8px] font-black tracking-widest text-muted-foreground uppercase block">Daily Flavors</span>
                <span className="text-xl font-black text-foreground">37 Blends</span>
              </div>
              <div className="w-px bg-border" />
              <div>
                <span className="text-[8px] font-black tracking-widest text-[#059669] uppercase block">Purity Ratio</span>
                <span className="text-xl font-black text-[#059669]">100% Raw</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar & Categories Tabs */}
        <div className="flex flex-col xl:flex-row gap-6 mt-12 items-start xl:items-center justify-between border-b pb-8 border-border">
            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2.5 flex-1 w-full md:w-auto justify-center md:justify-start">
              <button
                onClick={() => setActiveSubCategory('all')}
                className={`px-5 py-3 text-[9px] uppercase tracking-[0.2em] font-extrabold rounded-full border transition-all duration-300 ${
                  activeSubCategory === 'all'
                    ? 'bg-primary text-white border-primary shadow-[0_4px_15px_rgba(0,184,83,0.15)]'
                    : 'bg-secondary text-foreground border-border hover:border-primary/50 hover:text-primary hover:bg-primary/5'
                }`}
              >
                Show All
              </button>
              {JUICE_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSubCategory(section.id)}
                  className={`px-5 py-3 text-[9px] uppercase tracking-[0.2em] font-extrabold rounded-full border transition-all duration-300 flex items-center gap-1.5 ${
                    activeSubCategory === section.id
                      ? 'bg-primary text-white border-primary shadow-[0_4px_15px_rgba(0,184,83,0.15)]'
                      : 'bg-secondary text-foreground border-border hover:border-primary/50 hover:text-primary hover:bg-primary/5'
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
            <div className="relative w-full md:w-80 shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find botanical elixir..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-4 rounded-full border border-border text-xs text-foreground focus:outline-none focus:border-primary bg-secondary placeholder-muted-foreground transition-colors"
              />
            </div>
          </div>
      </div>

      {/* Content Section */}
      {loading || seeding ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : (
          <div className="space-y-16">
            
            {/* Split view or grid for each section or filtered items */}
            <AnimatePresence mode="wait">
              <motion.div 
                layout 
                className="grid grid-cols-2 lg:grid-cols-4 md:grid-cols-3 gap-3 sm:gap-6 lg:gap-8"
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
                      className="slice-card h-full"
                    >
                      {/* Sub-category tag */}
                      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex flex-wrap gap-1.5 leading-none">
                        {subCatInfo && (
                          <span className="bg-white/40 backdrop-blur-md text-black text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-white/40 shadow-sm">
                            {subCatInfo.name}
                          </span>
                        )}
                      </div>

                      {/* Image container */}
                      <Link to={`/product/${product.id}`} className="w-full aspect-[4/3] overflow-hidden relative bg-secondary border-b border-border block shrink-0">
                        <img
                          src={product.imageUrl || 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&auto=format&fit=crop&q=80'}
                          alt={product.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-[1500ms] group-hover:scale-110 filter brightness-[95%]"
                        />
                      </Link>

                      {/* Info & Typography block */}
                      <div className="p-3 sm:p-5 md:p-6 bg-secondary space-y-3 sm:space-y-4 flex-1 flex flex-col justify-between min-h-[140px] sm:min-h-[160px]">
                        <div className="flex flex-col gap-1.5 w-full">
                          <h3 className="text-xs sm:text-sm font-sans font-black uppercase tracking-wider text-foreground line-clamp-2 leading-tight">
                            {product.name}
                          </h3>
                          
                          <div className="flex items-end justify-between w-full mt-1 sm:mt-2">
                            <div className="flex flex-col gap-1.5">
                              {product.originalPrice && product.originalPrice > product.price && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] sm:text-xs text-muted-foreground line-through font-medium uppercase tracking-wider">MRP ₹{product.originalPrice}</span>
                                  <span className="text-[9px] sm:text-[10px] font-extrabold text-white bg-red-500 px-1.5 py-0.5 rounded-md leading-none tracking-widest">
                                    {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                                  </span>
                                </div>
                              )}
                              <div className="font-sans text-lg sm:text-xl font-black text-foreground tracking-tighter leading-none flex items-center gap-1">
                                <span className="text-sm font-bold text-muted-foreground">₹</span>{product.price}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Price & Cart block */}
                        <button 
                          onClick={() => handleAddToCart(product)}
                          className="w-full py-2.5 sm:py-3 rounded-xl sm:rounded-[14px] bg-primary text-white font-sans text-[8px] sm:text-[9px] uppercase font-black tracking-widest transition-all duration-300 hover:bg-[#09120b] hover:text-white hover:scale-[1.02] transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer mt-auto"
                        >
                          <ShoppingBag className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> <span className="hidden xs:inline">+ Add to Basket</span><span className="xs:hidden">Add</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}

                {filteredJuices.length === 0 && (
                  <div className="col-span-full py-36 text-center text-muted-foreground font-sans text-xs uppercase tracking-widest border border-dashed border-border rounded-3xl p-8">
                    This menu section is currently resting or empty.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

          </div>
        )}

        {/* Minimal Bottom Info Section matching premium juice shop menus */}
        <div className="bg-secondary border border-border rounded-[24px] p-6 sm:p-10 text-center max-w-3xl mx-auto space-y-6">
          <Leaf className="w-8 h-8 text-[#059669] mx-auto animate-pulse" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">The Cold-Pressed Commitment</h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl mx-auto normal-case font-medium">
            At Fresh N Local Juice House, we do not compromise. We never use pasteurization or heat treatment, which kills living vitamins and enzymes. Absolutely no chemical colors, artificial fillers, table sugars, or frozen syrups. Pure goodness in every bottle.
          </p>
          <div className="pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div>
              <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block mb-1">Contact Us</span>
              <span className="text-[10px] font-bold text-foreground uppercase">+91 72840 00883</span>
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
