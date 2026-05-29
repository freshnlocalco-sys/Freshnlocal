import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, Leaf, Truck, ShieldCheck, Sparkles, TrendingUp, Zap, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCategoryImage } from '../lib/constants';
import { db, isQuotaError } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const CATEGORIES = [
  { id: 'indian fruits', name: 'Indian Fruits', tagline: 'Devgad Alphonso & Sweetest Mangoes', discount: 'Flat ₹50 Off' },
  { id: 'exotic fruits', name: 'Exotic Fruits', tagline: 'Premium berries & Japanese plums', discount: 'Trending' },
  { id: 'exotic vegetables', name: 'Exotic Vegetables', tagline: 'Pristine organic broccoli & bell peppers', discount: 'Best Seller' },
  { id: 'herbs & seasoning', name: 'Herbs & Seasoning', tagline: 'Aromatic basil, mint & rosemary', discount: 'Freshly Cut' },
  { id: 'fresh & hygenic cut fruits and vegetables', name: 'Clean Cuts', tagline: 'Pre-washed, chopped & ready to cook', discount: 'Super Safe' },
  { id: 'imported / super exotic vegetables', name: 'Global Luxe Veggies', tagline: 'Direct from premium international farms', discount: 'Exclusive' },
  { id: 'leafy greens', name: 'Leafy Greens', tagline: 'Hydroponic crisp kale, spinach & lettuce', discount: '100% Organic' },
  { id: 'frozen items', name: 'Frozen Premium', tagline: 'Snap-frozen berries & sweet corn', discount: 'Long Shelf life' }
];

export const SPOTLIGHTS = {
  greens: {
    title: 'Exotic Veggies & Fruits',
    subtitle: 'Pristine organic broccoli, fresh avocados, colored bell peppers, and luxury globally sourced fruits.',
    price: '₹280',
    unit: '500g assorted pack',
    badge: 'Exotic Harvests',
    origin: 'Elite Agri-Hub, Surat',
    harvested: 'Direct-harvest today at 5:00 AM',
    image: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-primary border-primary/20 bg-primary/10',
    accentColor: '#00ea72',
    link: '/shop?category=Exotic%20Vegetables'
  },
  alphonso: {
    title: 'FRESH & HYGENIC CUT FRUITS AND VEGETABLES',
    subtitle: 'Hand Peeled Garlic, Fresh Hand Peeled Sweet Corn, Fresh Hand Peeled Green Peas, Coconut Chunks, Pineapple Slice, Guava Chunks.',
    price: '₹120',
    unit: 'Clean-Cuts assorted box',
    badge: 'Clean Cuts',
    origin: 'Pristine Hub, Surat',
    harvested: 'Peeled & chilled today at 4:30 AM',
    image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-yellow-500 border-yellow-500/20 bg-yellow-500/10',
    accentColor: '#eab308',
    link: '/shop?category=Fresh%20%26%20Hygenic%20Cut%20Fruits%20and%20Vegetables'
  },
  exotics: {
    title: 'EXOTIC FRUITS',
    subtitle: 'Thai Mangosteen, Asian Persimmon, Fresh Blueberry & Raspberry, Purple Passion Fruit, Peara Fruit, Zespri Sungold & Green Kiwi, Mandarin Orange, Spanish Grapefruit, Malta Orange, Spanish Sweet Plum, Red Globe Grapes, Thai Longan, Green Pear, Apples.',
    price: '₹450',
    unit: 'Gourmet selection box',
    badge: 'Exotic Fruits',
    origin: 'Global Orchards Gateway',
    harvested: 'Air-shipped & cold-stored',
    image: 'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-[#ac3fff] border-[#ac3fff]/20 bg-[#ac3fff]/10',
    accentColor: '#ac3fff',
    link: '/shop?category=Exotic%20Fruits'
  },
  herbs: {
    title: 'HERBS & SEASONING',
    subtitle: 'Italian Basil, Moyashi Bean Sprouts, Parsley, Celery, Fresh Rosemary, Fresh Thyme, Fresh Oregano, Fresh Sage, Fresh Chives, Fresh Tarragon, Thai Lemongrass Stick, Thai Galangal, Thai Kaffir Lime, Thai Bird Chilli, Thai Sweet Tamarind, Banana Leaves, White Shimeji Mushroom.',
    price: '₹150',
    unit: 'Aromatic bundle',
    badge: 'Herbs & Seasoning',
    origin: 'Direct Agri-Hub, Surat',
    harvested: 'Direct-harvest today at 5:00 AM',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10',
    accentColor: '#10b981',
    link: '/shop?category=Herbs%20%26%20Seasoning'
  },
  superExotics: {
    title: 'IMPORTED / SUPER EXOTIC VEGETABLES',
    subtitle: 'Hass Avocado Semiripe, Italian Lemon, Portobello Mushroom, King Oyster Mushroom, Oyster Mushroom, Shiitake Mushroom, Enoki Mushroom, Jerusalem Artichoke, European Sweet Potato, Thai Jumbo Taro Root, Butternut Squash, Thai Jumbo Asparagus, Thai Snow Pea.',
    price: '₹350',
    unit: 'Premium grade',
    badge: 'Super Exotics',
    origin: 'Global Specialty Farms',
    harvested: 'Imported fresh',
    image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-cyan-400 border-cyan-400/20 bg-cyan-400/10',
    accentColor: '#22d3ee',
    link: '/shop?category=Imported%20%2F%20Super%20Exotic%20Vegetables'
  },
  leafyGreens: {
    title: 'LEAFY GREENS',
    subtitle: 'Mixed Salad Greens, Mix Microgreen, Radicchio Lettuce, Rocket Arugula, Curly Kale, Baby Spinach, Romaine Lettuce, Lollo Rosso Lettuce, Oak Leaf Lettuce, French Lettuce, Wild Arugula.',
    price: '₹140',
    unit: 'Farm Fresh Batch',
    badge: 'Leafy Greens',
    origin: 'Hydroponic Farms, Surat',
    harvested: 'Direct-harvest today at 6:00 AM',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-lime-500 border-lime-500/20 bg-lime-500/10',
    accentColor: '#84cc16',
    link: '/shop?category=Leafy%20Greens'
  },
  frozenItems: {
    title: 'FROZEN ITEMS',
    subtitle: 'Frozen Blueberry, Frozen Raspberry, Frozen Blackberry, Frozen Cranberry, Frozen Mulberry, Frozen Cherry Halves, Frozen Hass Avocado Paste, Frozen Sweet Corn Kernels, Frozen Green Peas, Edamame Beans Peeled and Boiled, Frozen Strawberry, Mix Berry.',
    price: '₹250',
    unit: 'Premium Pack',
    badge: 'Frozen Items',
    origin: 'Cold Storage, Imported',
    harvested: 'IQF Frozen',
    image: 'https://images.unsplash.com/photo-1498579809087-ef1e558fd1da?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-indigo-400 border-indigo-400/20 bg-indigo-400/10',
    accentColor: '#818cf8',
    link: '/shop?category=Frozen%20Items'
  },
  indianFruits: {
    title: 'INDIAN FRUITS',
    subtitle: 'Devgad Alphonso Mango, Indian Papaya, Guava, Indian Banana, Custard Apple, Indian Pomegranate, Indian Sweet Lime, Indian Watermelon, Indian Muskmelon, Indian Grapes.',
    price: '₹180',
    unit: 'Seasonal Box',
    badge: 'Indian Fruits',
    origin: 'Devgad, Ratnagiri, Local Farms',
    harvested: 'Farm Fresh',
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&auto=format&fit=crop&q=80',
    colorClass: 'text-orange-500 border-orange-500/20 bg-orange-500/10',
    accentColor: '#f97316',
    link: '/shop?category=Indian%20Fruits'
  }
};

export function Home() {
  const [activeCard, setActiveCard] = useState<'greens' | 'alphonso' | 'exotics' | 'herbs' | 'superExotics' | 'leafyGreens' | 'frozenItems' | 'indianFruits'>('greens');
  const [isHovered, setIsHovered] = useState(false);
  const [spotlights, setSpotlights] = useState(SPOTLIGHTS);

  useEffect(() => {
    async function fetchSpotlightOverrides() {
      try {
        const docRef = doc(db, 'settings', 'spotlights');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const overrides = docSnap.data();
          setSpotlights(prev => {
            const newSpots = { ...prev };
            Object.keys(overrides).forEach(key => {
              if (newSpots[key as keyof typeof SPOTLIGHTS] && overrides[key].image) {
                newSpots[key as keyof typeof SPOTLIGHTS] = {
                  ...newSpots[key as keyof typeof SPOTLIGHTS],
                  image: overrides[key].image
                };
              }
            });
            return newSpots;
          });
        }
      } catch (err: any) {
        if (!isQuotaError(err)) {
          console.error("Error fetching spotlights config:", err);
        }
      }
    }
    fetchSpotlightOverrides();
  }, []);

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCard(current => {
      const keys = Object.keys(spotlights) as Array<keyof typeof spotlights>;
      const currentIndex = keys.indexOf(current);
      const nextIndex = (currentIndex - 1 + keys.length) % keys.length;
      return keys[nextIndex];
    });
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCard(current => {
      const keys = Object.keys(spotlights) as Array<keyof typeof spotlights>;
      const currentIndex = keys.indexOf(current);
      const nextIndex = (currentIndex + 1) % keys.length;
      return keys[nextIndex];
    });
  };

  useEffect(() => {
    if (isHovered) return;
    
    const interval = setInterval(() => {
      setActiveCard(current => {
        const keys = Object.keys(spotlights) as Array<keyof typeof spotlights>;
        const currentIndex = keys.indexOf(current);
        const nextIndex = (currentIndex + 1) % keys.length;
        return keys[nextIndex];
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isHovered, spotlights]);

  return (
    <div className="flex flex-col items-center bg-background text-foreground overflow-hidden">
      
      {/* Hero Section */}
      <section className="w-full max-w-7xl mx-auto px-4 md:px-8 pt-12 md:pt-24 pb-20 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center relative">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-6 z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-[0.2em] font-extrabold border border-primary/20">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
            Redefining freshness in Surat
          </div>
          
          <h1 className="title-display text-5xl lg:text-8xl leading-[0.9] font-black tracking-tight uppercase">
            Freshness <br/>
            <span className="text-foreground">Sliced Simple.</span>
          </h1>

          <p className="text-sm md:text-base text-muted-foreground max-w-md leading-relaxed font-sans font-medium">
            Zero hassle. Ultra-pure quality. Experience Surat's premier tech-driven larder bringing crisp, handpicked, local harvests & exotic fruits right to your modern kitchen.
          </p>

          <div className="flex flex-wrap gap-4 pt-6">
            <Link to="/shop" className="slice-btn-primary px-8 py-5 text-xs text-[11px]">
              Explore Shop <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
            <Link to="/about" className="slice-btn-secondary px-8 py-5 text-xs text-[11px]">
              Learn our story
            </Link>
          </div>

          <div className="flex justify-between md:justify-start gap-2 md:gap-8 items-center pt-8 border-t border-border/60 w-full max-w-md mt-10">
            <div className="text-center md:text-left">
              <p className="text-xl sm:text-2xl font-black text-foreground p-0 leading-none">6 HRS</p>
              <p className="text-[8px] sm:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5">Guaranteed Delivery</p>
            </div>
            <div className="w-px h-10 bg-border/60"></div>
            <div className="text-center md:text-left">
              <p className="text-xl sm:text-2xl font-black text-foreground p-0 leading-none">100%</p>
              <p className="text-[8px] sm:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5">Farmer Traceability</p>
            </div>
            <div className="w-px h-10 bg-border/60"></div>
            <div className="text-center md:text-left">
              <p className="text-xl sm:text-2xl font-black text-foreground p-0 leading-none">0 FEES</p>
              <p className="text-[8px] sm:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5">No Platform Taxes</p>
            </div>
          </div>
        </motion.div>
        
        {/* Interactive "Fresh Platinum Card" visual deck */}
        <motion.div
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ duration: 0.8, delay: 0.25 }}
           className="relative flex flex-col items-center justify-center z-10 w-full"
        >
          {/* Real Agricultural Crop Spotlight Card */}
          <div 
            className="relative w-full max-w-[420px] aspect-[4/3]"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <AnimatePresence>
              <motion.div
                key={activeCard}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0"
              >
                <Link 
                  to={spotlights[activeCard].link}
                  className="w-full h-full rounded-[24px] p-6 text-white relative flex flex-col justify-between overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border group transition-all duration-700 cursor-pointer block"
                  style={{
                    borderColor: spotlights[activeCard].accentColor + '30',
                    transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  {/* Full-bleed category image backdrop */}
                  <div className="absolute inset-0 z-0 overflow-hidden bg-zinc-950">
                    <img 
                      src={spotlights[activeCard].image} 
                      alt={spotlights[activeCard].title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-[2000ms] ease-out group-hover:scale-105 filter brightness-[85%]"
                    />
                  </div>



                  {/* Bottom Section: crop titles, details & metadata layout */}
                  <div className="z-10 mt-auto space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-xl md:text-2xl font-sans font-black uppercase tracking-tight text-white leading-tight">
                        {spotlights[activeCard].title}
                      </h3>
                      <p className="text-[10px] text-zinc-200/90 leading-relaxed font-sans font-medium line-clamp-2 max-w-[340px]">
                        {spotlights[activeCard].subtitle}
                      </p>
                    </div>

                    {/* Action layout inline */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3.5 mt-1">
                      <span className="text-[8px] font-extrabold uppercase tracking-widest transition-colors duration-500" style={{ color: spotlights[activeCard].accentColor }}>
                        Premium Hand-Pick
                      </span>
                      
                      <span className="inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-3.5 py-2.5 bg-white text-black rounded-xl hover:bg-zinc-100 transition-colors">
                        Buy Now <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Arrows */}
            <div className="absolute top-4 right-4 flex gap-2 z-20">
              <button
                onClick={handlePrev}
                className="w-10 h-10 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all shadow-sm border border-white/10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNext}
                className="w-10 h-10 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all shadow-sm border border-white/10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Interactive Card Selector tabs resembling slice website widgets */}
          <div className="bg-secondary border border-border/60 rounded-2xl p-2 mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 w-full max-w-[960px]">
            <button 
              onClick={() => setActiveCard('greens')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'greens' ? 'bg-primary text-white shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Veggies
            </button>
            <button 
              onClick={() => setActiveCard('alphonso')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'alphonso' ? 'bg-yellow-500 text-black shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Cuts
            </button>
            <button 
              onClick={() => setActiveCard('exotics')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'exotics' ? 'bg-[#ac3fff] text-white shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Fruits
            </button>
            <button 
              onClick={() => setActiveCard('herbs')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'herbs' ? 'bg-emerald-500 text-white shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Herbs
            </button>
            <button 
              onClick={() => setActiveCard('superExotics')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'superExotics' ? 'bg-cyan-400 text-black shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Imported
            </button>
            <button 
              onClick={() => setActiveCard('leafyGreens')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'leafyGreens' ? 'bg-lime-500 text-white shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Greens
            </button>
            <button 
              onClick={() => setActiveCard('frozenItems')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'frozenItems' ? 'bg-indigo-400 text-white shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Frozen
            </button>
            <button 
              onClick={() => setActiveCard('indianFruits')} 
              className={`py-2 px-1 sm:py-3 sm:px-0 text-center rounded-xl text-[8px] sm:text-[10px] uppercase font-extrabold tracking-wider lg:tracking-widest transition-all active:scale-95 ${activeCard === 'indianFruits' ? 'bg-orange-500 text-white shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-black/5 hover:scale-105'}`}
            >
              Indian
            </button>
          </div>
        </motion.div>
      </section>

      {/* Modern Bento Value Proposition Section */}
      <section className="w-full bg-secondary border-y border-border/40 py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-xl mx-auto mb-16 space-y-3">
            <span className="glass-pill">Core Powerhouse</span>
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-foreground mt-4">Pristine Supply Chain</h2>
            <p className="text-xs text-muted-foreground font-medium">We sliced out every delay, agent, fee, and middleman to deliver peak farm quality.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="slice-bento flex flex-col items-start group">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Leaf className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase text-foreground tracking-tight mb-2">100% Traceable Farming</h3>
                <p className="text-xs text-muted-foreground leading-relaxed font-sans">
                  Direct agricultural partnerships with verified premium farmers in Gujarat. Zero undisclosed storage or chemical accelerators.
                </p>
              </div>
            </div>

            <div className="slice-bento flex flex-col items-start group">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase text-foreground tracking-tight mb-2">Pristine Cold Transit</h3>
                <p className="text-xs text-muted-foreground leading-relaxed font-sans">
                  Pre-cooled packing methods keep sensitive leaves and premium exotics safe during local journeys. Arrives absolute crisp.
                </p>
              </div>
            </div>

            <div className="slice-bento flex flex-col items-start group">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase text-foreground tracking-tight mb-2">Elite Vetting Standards</h3>
                <p className="text-xs text-muted-foreground leading-relaxed font-sans">
                  Manual inspection stem by stem. We reject discoloration, surface bruising, and shape defects before any box leaves Surat hubs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Beautiful bottom banner resembling slice dynamic launch screens */}
      <section className="w-full bg-primary text-white py-20 px-4 text-center relative overflow-hidden">
        <div className="absolute top-[-300px] left-[-300px] w-[600px] h-[600px] bg-white/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-300px] right-[-300px] w-[600px] h-[600px] bg-black/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="max-w-xl mx-auto space-y-6 z-10 relative">
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tight leading-none text-white">
            Ready to <br/>Slice Freshness?
          </h2>
          <p className="text-xs font-bold uppercase tracking-wider opacity-90 leading-relaxed max-w-sm mx-auto">
            Order premium harvests with absolute simplicity. Sign in or browse catalogs directly with free delivery above ₹1000/-.
          </p>
          <div className="pt-2">
            <Link to="/shop" className="bg-[#09120b] text-white hover:bg-black rounded-[20px] font-sans text-xs uppercase font-extrabold tracking-widest px-8 py-5 transition-all duration-300 transform active:scale-95 inline-flex items-center gap-2">
              Start Shopping Now <ArrowRight className="w-4 h-4 text-primary" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
