import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, Leaf, Truck, ShieldCheck, Sparkles, TrendingUp, Zap, HelpCircle, ChevronLeft, ChevronRight, Snowflake, Building2, Recycle, PackageCheck, Bike, HeartHandshake, HeartPulse } from 'lucide-react';
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
  { id: 'exotic vegetables', name: 'Exotic Vegetables', tagline: 'Pristine organic broccoli & bell peppers', discount: 'Best Seller' },
  { id: 'herbs & seasoning', name: 'Herbs & Seasoning', tagline: 'Aromatic basil, mint & rosemary', discount: 'Freshly Cut' },
  { id: 'fresh & hygenic cut fruits and vegetables', name: 'Clean Cuts', tagline: 'Pre-washed, chopped & ready to cook', discount: 'Super Safe' },
  { id: 'imported / super exotic vegetables', name: 'Imported Veggies', tagline: 'Direct from premium international farms', discount: 'Exclusive' },
  { id: 'leafy greens', name: 'Leafy Greens', tagline: 'Hydroponic crisp kale, spinach & lettuce', discount: '100% Organic' },
  { id: 'frozen items', name: 'Frozen Premium', tagline: 'Snap-frozen berries & sweet corn', discount: 'Long Shelf life' },
  { id: 'mushrooms', name: 'Mushrooms', tagline: 'Fresh oyster, button & exotic funghi', discount: 'Earthy Fresh' }
];

function CategoryCarousel({ category, products, handleAddToCart }: { key?: React.Key | null | undefined; category: any; products: Product[]; handleAddToCart: (product: Product) => void }) {
  const isJuice = category.id === 'fnl juices';
  const linkDest = isJuice ? '/juice' : `/shop?category=${encodeURIComponent(category.id)}`;

  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-4 sm:mb-6 px-2">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-foreground">
          {category.name}
        </h2>
        <Link to={linkDest} className="text-[10px] sm:text-xs font-bold text-primary flex items-center hover:underline uppercase tracking-wider shrink-0">
          View All <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 ml-0.5" />
        </Link>
      </div>
      
      <div className="w-full pb-6 overflow-hidden flex group">
        <div 
          className="flex animate-marquee w-max group-hover:[animation-play-state:paused]"
          style={{ '--marquee-duration': `${Math.max(10, products.length * 5)}s` } as React.CSSProperties}
        >
          {[0, 1, 2].map((setIndex) => (
            <div key={setIndex} className="flex gap-3 sm:gap-4 md:gap-6 pr-3 sm:pr-4 md:pr-6">
              {products.map(product => (
                <div key={`${setIndex}-${product.id}`} className="w-[140px] sm:w-[160px] md:w-[180px] lg:w-[200px] shrink-0 flex">
                  <div className="w-full">
                    <ProductCard 
                      product={product}
                      onAddToCart={handleAddToCart}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const { categoryImages, productCategories, loading: settingsLoading } = useSettings();
  const [spotlightsConfig, setSpotlightsConfig] = useState<Record<string, {image: string}>>({});
  const [spotlightsLoading, setSpotlightsLoading] = useState(true);

  const activeCategories = React.useMemo(() => {
    if (!productCategories || productCategories.length === 0) return CATEGORIES;
    
    return productCategories.map(catName => {
      const match = CATEGORIES.find(c => 
        c.name.toLowerCase() === catName.toLowerCase() || 
        c.id.toLowerCase() === catName.toLowerCase() ||
        (catName.toLowerCase() === 'exotics' && c.id.includes('imported')) ||
        (catName.toLowerCase() === 'clean cuts' && c.id.includes('hygenic'))
      );
      
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
        discount: ''
      };
    });
  }, [productCategories]);

  const { products, fetchProducts, hydrateFromIDB } = useProducts();
  const { addItem, items } = useCart();
  
  useEffect(() => {
    async function init() {
      await hydrateFromIDB();
      fetchProducts();
    }
    init();
  }, [fetchProducts, hydrateFromIDB]);

  const handleAddToCart = (product: Product) => {
    const currentQty = items.find(item => item.product.id === product.id)?.quantity || 0;
    addItem(product);
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
      
      {/* Hero Section */}
      <section className="w-full mx-auto pt-8 md:pt-24 pb-16 md:pb-20 flex flex-col gap-10 lg:gap-12 items-center relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 md:w-96 md:h-96 bg-primary/5 rounded-full blur-[80px] md:blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 md:w-80 md:h-80 bg-primary/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none animate-pulse"></div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-4 md:space-y-6 z-10 flex flex-col items-start lg:items-center text-left lg:text-center w-full max-w-7xl px-4 md:px-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-primary/10 text-primary text-[9px] md:text-[10px] uppercase tracking-[0.2em] font-extrabold border border-primary/20 self-start lg:self-center">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary animate-ping"></span>
            Redefining freshness in Surat
          </div>
          
          <h1 className="title-display text-3xl sm:text-4xl md:text-5xl lg:text-[7rem] leading-[1.1] sm:leading-[1] md:leading-[0.9] font-black tracking-tight uppercase w-full">
            Freshness <br className="lg:hidden" />
            <span className="text-foreground">Sliced Simple.</span>
          </h1>

          <p className="text-xs sm:text-sm md:text-base text-muted-foreground w-full max-w-[300px] sm:max-w-md lg:max-w-2xl mx-0 lg:mx-auto leading-relaxed font-sans font-medium text-left lg:text-center">
            Zero hassle. Ultra-pure quality. Experience Surat's premier tech-driven order bringing crisp, handpicked, local harvests & exotic fruits right to your modern kitchen.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-4 md:pt-6 justify-start lg:justify-center w-full sm:w-auto">
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

          <div className="flex flex-wrap justify-start lg:justify-center gap-4 sm:gap-6 md:gap-12 items-center pt-6 md:pt-8 border-t border-border/60 w-full lg:max-w-3xl mt-8 md:mt-10 mx-auto">
            <div className="text-left lg:text-center flex-1 min-w-[30%]">
              <p className="text-lg sm:text-xl md:text-2xl font-black text-foreground p-0 leading-none">IN 24 HRS</p>
              <p className="text-[7px] sm:text-[8px] md:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5 truncate">Guaranteed Delivery</p>
            </div>
            <div className="w-px h-8 md:h-10 bg-border/60"></div>
            <div className="text-left lg:text-center flex-1 min-w-[30%]">
              <p className="text-lg sm:text-xl md:text-2xl font-black text-foreground p-0 leading-none">100%</p>
              <p className="text-[7px] sm:text-[8px] md:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5 truncate">Farmer Traceability</p>
            </div>
            <div className="hidden sm:block w-px h-8 md:h-10 bg-border/60"></div>
            <div className="text-left lg:text-center flex-1 min-w-[30%] mt-2 sm:mt-0">
              <p className="text-lg sm:text-xl md:text-2xl font-black text-foreground p-0 leading-none">0 FEES</p>
              <p className="text-[7px] sm:text-[8px] md:text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground mt-1.5 truncate">No Platform Taxes</p>
            </div>
          </div>
        </motion.div>
        
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
                    className="flex flex-col items-center group cursor-pointer"
                  >
                    <div className="w-full aspect-square rounded-2xl bg-sky-50/50 dark:bg-sky-950/20 overflow-hidden flex items-center justify-center mb-2 sm:mb-3 transition-transform duration-300 group-hover:-translate-y-1 shadow-sm group-hover:shadow-md relative">
                      {(spotlightsLoading || settingsLoading) ? (
                        <div className="w-full h-full bg-border/20 rounded-2xl animate-pulse" />
                      ) : spotlightsConfig[cat.id]?.image || getCategoryImage(cat.name, categoryImages, false) ? (
                        <img
                          src={spotlightsConfig[cat.id]?.image || getCategoryImage(cat.name, categoryImages, false) || undefined}
                          alt={cat.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 drop-shadow-sm"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-secondary/80 rounded-2xl">
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
                will-change: transform;
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
                  products={categoryProducts.slice(0, 5)}
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
            <div className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Snowflake className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">COLD CHAIN SUPPLY</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Temperature-controlled handling from sourcing to delivery, preserving freshness, texture, and nutritional value throughout the journey.
                </p>
              </div>
            </div>

            {/* Card 2: LEADING SUPPLIER FOR HORECA */}
            <div className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">LEADING SUPPLIER FOR HORECA</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Trusted by hotels, restaurants, cafés, cloud kitchens, and premium food businesses across Surat for consistent quality and reliable supply.
                </p>
              </div>
            </div>

            {/* Card 3: WASTE MANAGEMENT */}
            <div className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Recycle className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">RESPONSIBLE WASTE MANAGEMENT</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  We minimize food waste through efficient inventory planning, surplus redistribution, and sustainable operational practices.
                </p>
              </div>
            </div>

            {/* Card 4: ECO-FRIENDLY PACKAGING */}
            <div className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <PackageCheck className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">ECO-FRIENDLY PACKAGING</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Products are packed using environmentally conscious materials that reduce plastic usage while maintaining product protection.
                </p>
              </div>
            </div>

            {/* Card 5: ECO-FRIENDLY DELIVERY */}
            <div className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <Bike className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">GREEN DELIVERY FLEET</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Local deliveries are increasingly powered by electric vehicles, helping reduce emissions and create a cleaner city.
                </p>
              </div>
            </div>

            {/* Card 6: FOOD DONATION INITIATIVES */}
            <div className="slice-bento flex flex-col items-start group">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 mb-4 sm:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <HeartHandshake className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">FOOD DONATION INITIATIVES</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans">
                  Safe and consumable surplus produce is redirected to community support programs instead of going to waste.
                </p>
              </div>
            </div>

            {/* Card 7: URBAN HEALTH FOCUSED (Symmetric full-width bento style) */}
            <div className="slice-bento flex flex-col lg:flex-row items-start lg:items-center group col-span-2 lg:col-span-3 gap-4 sm:gap-6 lg:gap-8">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary border border-primary/20 shrink-0 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <HeartPulse className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs sm:text-base md:text-lg font-black uppercase text-foreground tracking-tight mb-1 sm:mb-2">URBAN HEALTH FOCUSED</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed font-sans max-w-4xl">
                  Curating premium fruits, vegetables, and healthy essentials that help modern families maintain a nutritious lifestyle.
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
