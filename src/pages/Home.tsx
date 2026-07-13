import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Leaf, Truck, ShieldCheck, Sparkles, TrendingUp, Zap, HelpCircle, ChevronLeft, ChevronRight, Snowflake, Building2, Recycle, PackageCheck, Bike, HeartHandshake, HeartPulse, Search, Bot } from 'lucide-react';
import { db, isQuotaError } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useSettings } from '../store/useSettings';
import { cacheManager, trackFirestoreRead } from '../lib/cacheManager';
import { getCategoryImage } from '../lib/constants';
import { useProducts } from '../store/useProducts';
import { useCart, Product } from '../store/useCart';
import { ProductCard } from '../components/ProductCard';
import toast from 'react-hot-toast';

export const CATEGORIES = [
  { id: 'in season fruits', name: 'In Season Fruits', tagline: 'Fresh seasonal picks', discount: 'Seasonal' },
  { id: 'indian fruits', name: 'Indian Fruits', tagline: 'Devgad Alphonso & Sweetest Mangoes', discount: 'Flat ₹50 Off' },
  { id: 'exotic fruits', name: 'Exotic Fruits', tagline: 'Premium berries & Japanese plums', discount: 'Trending' },
  { id: 'exotic vegetables', name: 'Exotic Vegetables', tagline: 'Pristine fresh broccoli & bell peppers', discount: 'Best Seller' },
  { id: 'herbs & seasoning', name: 'Herbs & Seasoning', tagline: 'Aromatic basil, mint & rosemary', discount: 'Freshly Cut' },
  { id: 'fresh & hygenic cut fruits and vegetables', name: 'Clean Cuts', tagline: 'Pre-washed, chopped & ready to cook', discount: 'Super Safe' },
  { id: 'imported / super exotic vegetables', name: 'Imported Veggies', tagline: 'Direct from premium international farms', discount: 'Exclusive' },
  { id: 'leafy greens', name: 'Leafy Greens', tagline: 'Hydroponic crisp kale, spinach & lettuce', discount: '100% Fresh' },
  { id: 'frozen items', name: 'Frozen Premium', tagline: 'Snap-frozen berries & sweet corn', discount: 'Long Shelf life' },
  { id: 'mushroom', name: 'Mushroom', tagline: 'Fresh oyster, button & exotic funghi', discount: 'Earthy Fresh' }
];

function CategoryCarousel({ category, products, handleAddToCart }: { key?: React.Key | null | undefined; category: any; products: Product[]; handleAddToCart: (product: Product) => void }) {
  const isJuice = category.id === 'fnl juices';
  const linkDest = isJuice ? '/juice' : `/shop?category=${encodeURIComponent(category.id)}`;
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const displayProducts = products.slice(0, 13);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-scroll loop
  useEffect(() => {
    let animationFrameId: number;
    let accumulatedScroll = 0;
    const pixelsPerFrame = 0.5; // Adjust this value for speed
    
    const smoothScroll = () => {
      if (!isHovered && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        
        accumulatedScroll += pixelsPerFrame;
        
        if (accumulatedScroll >= 1) {
          const scrollPixels = Math.floor(accumulatedScroll);
          accumulatedScroll -= scrollPixels;
          
          if (container.scrollLeft >= maxScrollLeft - 1) {
            // Reached the end, scroll back to start seamlessly
            container.scrollLeft = 0;
          } else {
            container.scrollLeft += scrollPixels;
          }
        }
      }
      animationFrameId = requestAnimationFrame(smoothScroll);
    };

    animationFrameId = requestAnimationFrame(smoothScroll);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isHovered]);


  return (
    <div 
      className="w-full relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex justify-between items-end mb-4 sm:mb-6 px-2">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-foreground">
          {category.name}
        </h2>
        <Link to={linkDest} className="text-[10px] sm:text-xs font-bold text-primary flex items-center hover:underline uppercase tracking-wider shrink-0">
          View All <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 ml-0.5" />
        </Link>
      </div>
      
      <div 
        ref={scrollContainerRef}
        className="w-full pb-6 overflow-x-auto no-scrollbar flex gap-3 sm:gap-4 lg:gap-6 px-2"
      >
        {displayProducts.map(product => (
          <div key={product.id} className="w-[calc(50%-6px)] sm:w-[calc(50%-8px)] md:w-[calc(25%-12px)] lg:w-[calc(25%-18px)] xl:w-[calc(25%-18px)] shrink-0 snap-start flex">
            <div className="w-full">
              <ProductCard 
                product={product}
                onAddToCart={handleAddToCart}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryImage({ src, alt }: { src?: string; alt: string }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  
  if (!src) return null;

  return (
    <>
      {!imageLoaded && <div className="absolute inset-0 bg-muted animate-pulse rounded-[24px]" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setImageLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover object-center block transition-all duration-500 group-hover:scale-110 drop-shadow-sm ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        referrerPolicy="no-referrer"
        loading="lazy"
      />
    </>
  );
}

const loadedHeroImages = new Set<string>();

function HeroImage({ src, alt }: { src: string, alt: string }) {
  const [imageLoaded, setImageLoaded] = useState(() => loadedHeroImages.has(src));
  
  useEffect(() => {
    if (loadedHeroImages.has(src)) {
      setImageLoaded(true);
    }
  }, [src]);

  return (
    <div className="w-full h-full relative">
      {!imageLoaded && <div className="absolute inset-0 bg-secondary/20 animate-pulse" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => {
          loadedHeroImages.add(src);
          setImageLoaded(true);
        }}
        className={`w-full h-full object-cover object-center ${!imageLoaded ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'}`}
      />
    </div>
  );
}

export function Home() {
  const { categoryImages, productCategories, loading: settingsLoading } = useSettings();
  const [spotlightsConfig, setSpotlightsConfig] = useState<Record<string, {image: string}>>({});
  const [spotlightsLoading, setSpotlightsLoading] = useState(true);

  const activeCategories: { id: string; name: string; tagline: string; discount: string; originalId?: string }[] = React.useMemo(() => {
    if (!productCategories || productCategories.length === 0) return CATEGORIES;
    
    return productCategories.map(catName => {
      const match = CATEGORIES.find(c => {
        const cLower = c.name.toLowerCase();
        const catLower = catName.toLowerCase();
        return cLower === catLower || 
        c.id.toLowerCase() === catLower ||
        (catLower === 'exotics' && c.id.includes('imported')) ||
        (catLower === 'clean cuts' && c.id.includes('hygenic'));
      });
      
      if (match) {
        return {
          ...match,
          name: catName,
          originalId: match.id,
          id: catName.toLowerCase()
        };
      }
      
      return {
        id: catName.toLowerCase(),
        name: catName,
        tagline: 'Fresh harvest daily',
        discount: '',
        originalId: catName.toLowerCase()
      };
    });
  }, [productCategories]);

  const { products, fetchProducts, hydrateFromIDB } = useProducts();
  const { addItem, items } = useCart();
  const [heroBanners, setHeroBanners] = useState<{id: string, imageUrl: string, link: string}[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isLoadingHeroBanners, setIsLoadingHeroBanners] = useState(true);
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleHomeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (homeSearchQuery.trim()) {
      navigate(`/fnl-recipes?q=${encodeURIComponent(homeSearchQuery.trim())}`);
    }
  };
  
  useEffect(() => {
    async function init() {
      await hydrateFromIDB();
      fetchProducts();
    }
    init();
  }, [fetchProducts, hydrateFromIDB]);

  useEffect(() => {
    async function fetchHeroBanners() {
      const cachedBanners = cacheManager.get<any[]>('heroBanners', true);
      const isCacheFresh = cacheManager.isValid('heroBanners');
      
      if (cachedBanners) {
        setHeroBanners(cachedBanners);
        setIsLoadingHeroBanners(false);
        if (isCacheFresh) return;
      }

      await cacheManager.fetchDeduplicated('hero_banners_fetch', async () => {
        try {
          const docRef = doc(db, 'settings', 'heroBanners');
          const docSnap = await getDoc(docRef);
          trackFirestoreRead('settings', 1);
          if (docSnap.exists() && docSnap.data().banners) {
            const banners = docSnap.data().banners;
            cacheManager.set('heroBanners', banners);
            setHeroBanners(banners);
            // Preload images in background
            banners.forEach((b: any) => {
              if (b.imageUrl && !loadedHeroImages.has(b.imageUrl)) {
                const img = new Image();
                img.src = b.imageUrl;
                img.onload = () => loadedHeroImages.add(b.imageUrl);
              }
            });
          }
        } catch (err) {
          console.error("Error fetching hero banners", err);
        } finally {
          setIsLoadingHeroBanners(false);
        }
      });
    }
    fetchHeroBanners();
  }, []);

  const [direction, setDirection] = useState(1); // 1 for right, -1 for left
  const lastInteractionTimeRef = useRef<number>(Date.now() - 4000);

  useEffect(() => {
    if (heroBanners.length <= 1) return;
    const interval = setInterval(() => {
      if (Date.now() - lastInteractionTimeRef.current >= 7000) {
        setDirection(1);
        setCurrentBannerIndex(prev => (prev + 1) % heroBanners.length);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [heroBanners.length]);

  const slideLeft = () => {
    lastInteractionTimeRef.current = Date.now();
    setDirection(-1);
    setCurrentBannerIndex(prev => (prev - 1 + heroBanners.length) % heroBanners.length);
  };

  const slideRight = () => {
    lastInteractionTimeRef.current = Date.now();
    setDirection(1);
    setCurrentBannerIndex(prev => (prev + 1) % heroBanners.length);
  };

  const setBannerIndex = (idx: number) => {
    lastInteractionTimeRef.current = Date.now();
    setDirection(idx > currentBannerIndex ? 1 : -1);
    setCurrentBannerIndex(idx);
  };

  const handleAddToCart = (product: Product, quantity: number = 1) => {
    const currentQty = items.find(item => item.product.id === product.id)?.quantity || 0;
    addItem(product, quantity);
    if (currentQty === 0) {
      toast.success(<span>Added <b>{product.name}</b> to cart</span>);
    }
  };

  useEffect(() => {
    async function fetchSpotlightOverrides() {
      const cachedSpotlights = cacheManager.get<any>('spotlights', true);
      const isCacheFresh = cacheManager.isValid('spotlights');

      if (cachedSpotlights) {
        setSpotlightsConfig(cachedSpotlights);
        if (isCacheFresh) {
          setSpotlightsLoading(false);
          return;
        }
      }

      await cacheManager.fetchDeduplicated('spotlights_fetch', async () => {
        try {
          const docRef = doc(db, 'settings', 'spotlights');
          const docSnap = await getDoc(docRef);
          trackFirestoreRead('settings', 1);
          if (docSnap.exists()) {
            const overrides = docSnap.data();
            cacheManager.set('spotlights', overrides);
            setSpotlightsConfig(overrides);
          }
        } catch (err: any) {
          console.error("Error fetching spotlights config:", err);
        } finally {
          setSpotlightsLoading(false);
        }
      });
    }
    fetchSpotlightOverrides();
  }, []);

  return (
    <div className="flex flex-col items-center bg-background text-foreground overflow-x-hidden w-full max-w-full box-border">
      <Helmet>
        <title>FreshNLocal.CO | Fresh Produce Delivery</title>
        <meta name="description" content="Surat's premium fresh delivery engine. Bringing fully vetted, hand-harvested fresh crops, local seasonal fruits, and premium exotics straight to your door." />
        <link rel="canonical" href="https://www.freshnlocal.co/" />
      </Helmet>
      
      {/* Hero Section */}
      <section className="w-full mx-auto pt-8 md:pt-24 pb-16 md:pb-20 flex flex-col gap-8 lg:gap-10 items-center relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 md:w-96 md:h-96 bg-primary/5 rounded-full blur-[80px] md:blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 md:w-80 md:h-80 bg-primary/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none"></div>

        {/* Global Search Bar */}
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 relative z-20">
          <form onSubmit={handleHomeSearch} className="relative w-full shadow-xl shadow-black/5 rounded-full overflow-hidden group border border-border/50 bg-background/80 backdrop-blur-xl focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-300">
            <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-14 sm:h-14 rounded-full overflow-hidden flex items-center justify-center bg-white/50 z-10 pointer-events-none">
              <img src="/freshi-icon.png?v=5" alt="Freshi" className="w-full h-full object-contain" />
            </div>
            
            {/* Custom Placeholder */}
            {!homeSearchQuery && (
              <div className="absolute left-[4.75rem] sm:left-[5.75rem] top-1/2 -translate-y-1/2 pointer-events-none flex flex-col justify-center">
                <span className="text-lg sm:text-xl font-semibold text-muted-foreground/70 leading-tight">Ask Freshi</span>
                <span className="text-[11px] sm:text-xs text-muted-foreground/50 font-medium">Your Ai Recipe Assistant By FNL</span>
              </div>
            )}
            
            <input
              type="text"
              value={homeSearchQuery}
              onChange={(e) => setHomeSearchQuery(e.target.value)}
              className="w-full h-16 sm:h-20 pl-[4.75rem] sm:pl-[5.75rem] pr-28 sm:pr-36 bg-transparent border-none outline-none text-lg sm:text-xl font-medium relative z-10"
            />
            <button 
              type="submit"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-5 sm:px-8 py-2.5 sm:py-4 rounded-full text-sm sm:text-base font-bold tracking-wide hover:bg-primary/90 transition-colors z-20"
            >
              Go
            </button>
          </form>
        </div>

        {isLoadingHeroBanners ? (
          <div className="w-full md:max-w-6xl md:mx-auto md:px-6 relative">
            <div className="w-full aspect-[4/3] md:rounded-[32px] overflow-hidden bg-secondary animate-pulse" />
          </div>
        ) : heroBanners.length > 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full md:max-w-6xl md:mx-auto md:px-6 relative group"
          >
            <div className="relative w-full aspect-[4/3] md:rounded-[32px] overflow-hidden bg-secondary/50 md:shadow-sm">
              <motion.div
                className="flex w-full h-full"
                animate={{ x: `-${currentBannerIndex * 100}%` }}
                transition={{ type: "tween", ease: [0.25, 1, 0.5, 1], duration: 0.6 }}
              >
                {heroBanners.map((banner, idx) => (
                  <div key={idx} className="w-full h-full shrink-0 relative">
                    {banner.link ? (
                      banner.link.startsWith('http') ? (
                        <a href={banner.link} target="_blank" rel="noopener noreferrer" className="w-full h-full block relative">
                          <HeroImage src={banner.imageUrl} alt="Hero Banner" />
                        </a>
                      ) : (
                        <Link to={banner.link} className="w-full h-full block relative">
                          <HeroImage src={banner.imageUrl} alt="Hero Banner" />
                        </Link>
                      )
                    ) : (
                      <div className="w-full h-full relative">
                        <HeroImage src={banner.imageUrl} alt="Hero Banner" />
                      </div>
                    )}
                  </div>
                ))}
              </motion.div>

              {/* Slider Dots */}
              {heroBanners.length > 1 && (
                <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
                  {heroBanners.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setBannerIndex(idx)}
                      className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                        idx === currentBannerIndex 
                          ? 'w-6 sm:w-8 bg-white' 
                          : 'w-1.5 sm:w-2 bg-white/50 hover:bg-white/80'
                      }`}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
              
              {/* Navigation Arrows */}
              {heroBanners.length > 1 && (
                <>
                  <button 
                    onClick={slideLeft}
                    className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 z-20"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={slideRight}
                    className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 z-20"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="w-full md:max-w-6xl md:mx-auto md:px-6">
            <div className="relative w-full aspect-[4/3] md:rounded-[32px] bg-secondary/30 md:border border-y border-border/50 flex flex-col items-center justify-center text-center p-6">
               <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 mt-16">
                 <Sparkles className="w-8 h-8 text-primary opacity-50" />
               </div>
               <h2 className="text-xl font-black text-foreground mb-2">No Hero Banners Uploaded</h2>
               <p className="text-sm text-muted-foreground">Admin: Please navigate to the dashboard and upload images (4:3 ratio) for the hero slider.</p>
            </div>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-6 md:pt-8 justify-center w-full sm:w-auto px-4 z-10">
          <Link to="/shop" className="slice-btn-primary px-6 py-4 md:px-8 md:py-5 text-[10px] md:text-[11px] w-full sm:w-auto justify-center flex items-center gap-2">
            SHOP NOW
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
          </Link>
          <Link to="/juice" className="slice-btn-secondary border-orange-500/20 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-500/5 px-6 py-4 md:px-8 md:py-5 text-[10px] md:text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 w-full sm:w-auto">
            FNL Juice House 🍹
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 md:gap-12 items-center pt-6 md:pt-8 w-full lg:max-w-3xl z-10 mx-auto">
          <div className="text-center flex-1 min-w-[30%]">
            <p className="text-lg sm:text-xl md:text-2xl font-black text-foreground p-0 leading-none">IN 24 HRS</p>
            <p className="text-[7px] sm:text-[8px] md:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5 truncate">Guaranteed Delivery</p>
          </div>
          <div className="w-px h-8 md:h-10 bg-border/60"></div>
          <div className="text-center flex-1 min-w-[30%]">
            <p className="text-lg sm:text-xl md:text-2xl font-black text-foreground p-0 leading-none">100%</p>
            <p className="text-[7px] sm:text-[8px] md:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5 truncate">Farmer Traceability</p>
          </div>
          <div className="hidden sm:block w-px h-8 md:h-10 bg-border/60"></div>
          <div className="text-center flex-1 min-w-[30%] mt-2 sm:mt-0">
            <p className="text-lg sm:text-xl md:text-2xl font-black text-foreground p-0 leading-none">0 FEES</p>
            <p className="text-[7px] sm:text-[8px] md:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5 truncate">No Platform Taxes</p>
          </div>
        </div>

        <motion.div
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ duration: 0.8, delay: 0.25 }}
           className="relative flex flex-col items-center justify-center z-10 w-full min-w-0"
        >
          {/* Mobile-first categories grid substituting the previous button deck */}
          <div className="w-full max-w-[1020px] mx-auto mt-10 md:mt-16 text-left relative z-20">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-foreground mb-4 sm:mb-6 px-2">
              Shop By Categories
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
              {activeCategories.map((cat) => {
                  const isJuice = cat.id === 'fnl juices';
                  const linkDest = isJuice ? '/juice' : `/shop?category=${encodeURIComponent(cat.id)}`;
                  return (
                    <Link
                      key={cat.id}
                      to={linkDest}
                    className="flex flex-col items-center group cursor-pointer w-full"
                  >
                    <div className="w-full aspect-[4/3] rounded-[24px] bg-sky-50/50 dark:bg-sky-950/20 overflow-hidden flex items-center justify-center mb-2 sm:mb-3 transition-transform duration-300 group-hover:-translate-y-1 shadow-sm group-hover:shadow-md relative">
                      {(spotlightsLoading || settingsLoading) ? (
                        <div className="w-full h-full bg-border/20 rounded-[24px] animate-pulse" />
                      ) : spotlightsConfig[cat.id]?.image || getCategoryImage(cat.name, categoryImages, false) ? (
                        <CategoryImage
                          src={spotlightsConfig[cat.id]?.image || getCategoryImage(cat.name, categoryImages, false) || undefined}
                          alt={cat.name}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-secondary/80 rounded-[24px]">
                           <span className="text-muted-foreground opacity-50 font-black text-2xl tracking-tighter uppercase">{cat.name.slice(0, 2)}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-center text-[9px] sm:text-[11px] font-extrabold uppercase tracking-wide leading-tight text-foreground group-hover:text-primary transition-colors max-w-full break-words px-1">
                      {cat.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* All Categories Product Showcases */}
          <div className="w-full max-w-[1020px] mx-auto mt-12 md:mt-20 text-left relative z-20 space-y-12 md:space-y-16 overflow-hidden">
            <style dangerouslySetInnerHTML={{__html: `
              .hide-scrollbar::-webkit-scrollbar {
                display: none;
              }
              @keyframes marquee {
                0% { transform: translate3d(0, 0, 0); }
                100% { transform: translate3d(-33.333333%, 0, 0); }
              }
              .animate-marquee {
                animation: marquee var(--marquee-duration, 20s) linear infinite;
                transform: translateZ(0);
              }
            `}} />
            {activeCategories.map(category => {
              const categoryProducts = products.filter(p => {
                const pCat = (p.category || '').toLowerCase();
                const cId = category.id.toLowerCase();
                return pCat === cId || (category.originalId && pCat === category.originalId.toLowerCase());
              });
              // Only show category if it has products
              if (categoryProducts.length === 0) return null;
              
              return (
                <CategoryCarousel 
                  key={category.id}
                  category={category}
                  products={categoryProducts.slice(0, 13)}
                  handleAddToCart={handleAddToCart}
                />
              );
            })}
            {/* Dedicated FNL Juices Showcase at the bottom of categories */}
            {(() => {
              const juiceProducts = products.filter(p => {
                const pCat = (p.category || '').toLowerCase();
                return pCat === 'fnl juices' || pCat === 'fnl juice';
              });
              
              if (juiceProducts.length === 0) return null;
              
              const juiceCategory = {
                id: 'fnl juices',
                name: 'FNL Juices 🍹',
                tagline: '100% Raw Cold Pressed Nectars',
                discount: 'Zero Sugar'
              };
              
              return (
                <CategoryCarousel 
                  key="fnl-juices-showcase"
                  category={juiceCategory}
                  products={juiceProducts}
                  handleAddToCart={handleAddToCart}
                />
              );
            })()}
          </div>

        </motion.div>
      </section>

      {/* Modern Bento Value Proposition Section */}
      <section className="w-full bg-secondary border-y border-border/40 py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="glass-pill">Core Powerhouse</span>
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase tracking-tight text-foreground mt-4">SUPPLY CHAIN WITH PURPOSE</h2>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider leading-relaxed">
              Building a healthier, greener, and more responsible food ecosystem from farm to doorstep.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-8">
            {/* Card 1: COLD CHAIN SUPPLY */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Snowflake className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">COLD CHAIN SUPPLY</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Temperature-controlled handling from sourcing to delivery, preserving freshness, texture, and nutritional value throughout the journey.
                </p>
              </div>
            </motion.div>

            {/* Card 2: LEADING SUPPLIER FOR HORECA */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">LEADING SUPPLIER FOR HORECA</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Trusted by hotels, restaurants, cafés, cloud kitchens, and premium food businesses across Surat for consistent quality and reliable supply.
                </p>
              </div>
            </motion.div>

            {/* Card 3: WASTE MANAGEMENT */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Recycle className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">RESPONSIBLE WASTE MANAGEMENT</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  We minimize food waste through efficient inventory planning, surplus redistribution, and sustainable operational practices.
                </p>
              </div>
            </motion.div>

            {/* Card 4: ECO-FRIENDLY PACKAGING */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <PackageCheck className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">ECO-FRIENDLY PACKAGING</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Products are packed using environmentally conscious materials that reduce plastic usage while maintaining product protection.
                </p>
              </div>
            </motion.div>

            {/* Card 5: ECO-FRIENDLY DELIVERY */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Bike className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">GREEN DELIVERY FLEET</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Local deliveries are increasingly powered by electric vehicles, helping reduce emissions and create a cleaner city.
                </p>
              </div>
            </motion.div>

            {/* Card 6: FOOD DONATION INITIATIVES */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <HeartHandshake className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">FOOD DONATION INITIATIVES</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Safe and consumable surplus produce is redirected to community support programs instead of going to waste.
                </p>
              </div>
            </motion.div>

            {/* Card 7: URBAN HEALTH FOCUSED (Symmetric full-width bento style) */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="slice-bento flex flex-col lg:flex-row items-start lg:items-center group col-span-2 lg:col-span-3 gap-4 sm:gap-6 lg:gap-8">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 shrink-0 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <HeartPulse className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">URBAN HEALTH FOCUSED</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans max-w-4xl">
                  Curating premium fruits, vegetables, and healthy essentials that help modern families maintain a nutritious lifestyle.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Beautiful bottom banner resembling slice dynamic launch screens */}
      <section className="w-full bg-primary text-white py-20 px-4 text-center relative overflow-hidden">
        <div className="absolute top-[-300px] left-[-300px] w-[600px] h-[600px] bg-white/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-300px] right-[-300px] w-[600px] h-[600px] bg-black/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="max-w-xl mx-auto space-y-6 z-10 relative">
          <h2 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase tracking-tight leading-none text-white">
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
