import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, User, LogIn, Menu, LogOut, ShieldCheck, X, Sparkles, Navigation, MapPin, Phone, Mail, Heart, ChefHat, Search, Building2 } from 'lucide-react';
import { useAuth, signOut } from '../lib/firebase';
import { useCart } from '../store/useCart';
import { useSettings } from '../store/useSettings';
import { useProducts } from '../store/useProducts';
import { useHorecaPrices } from '../store/useHorecaPrices';
import { AuthModal } from './AuthModal';
import { AdminNotifier } from './AdminNotifier';
import { StickyMiniCartBar } from './StickyMiniCartBar';
import { DeliveryLocationBadge } from './DeliveryLocationBadge';
import { LocationSelectorModal } from './LocationSelectorModal';
import { notifySignOutSuccess } from '../lib/authNotifications';
import { motion, AnimatePresence } from 'motion/react';

export function Layout() {
  const { user, loading } = useAuth();
  const isHorecaUser = user?.role === 'horeca' || user?.role === 'horeca_admin';
  const { faviconUrl, productCategories, categoryVisibility, fetchCategoryImages } = useSettings();
  const { products } = useProducts();
  const { loadPrices } = useHorecaPrices();
  const [logoError, setLogoError] = useState(false);
  const cartItemsCount = useCart((state) => state.items.reduce((acc, item) => acc + item.quantity, 0));
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  
  React.useEffect(() => {
    const handleOpenAuth = () => setIsAuthModalOpen(true);
    window.addEventListener('open-auth-modal', handleOpenAuth);
    return () => window.removeEventListener('open-auth-modal', handleOpenAuth);
  }, []);
  
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [localSearch, setLocalSearch] = useState('');

  // Reset logoError when faviconUrl changes (e.g. when loaded asynchronously from Firestore)
  React.useEffect(() => {
    setLogoError(false);
  }, [faviconUrl]);

  // Fetch settings / categories on mount
  React.useEffect(() => {
    fetchCategoryImages();
  }, [fetchCategoryImages]);

  // Load HoReCa pricing globally once when user is logged in
  React.useEffect(() => {
    if (isHorecaUser && (user?.uid || user?.email)) {
      loadPrices(user.uid, user.email || undefined);
    }
  }, [isHorecaUser, user?.uid, user?.email, loadPrices]);

  // Sync local search when URL changes
  React.useEffect(() => {
    if (location.pathname === '/shop') {
      setLocalSearch(searchParams.get('q') || '');
    } else {
      setLocalSearch('');
    }
  }, [location.pathname, searchParams]);

  // Compute dynamic footer categories based on store settings & product catalog
  const footerCategories = React.useMemo(() => {
    const allCats: string[] = [];
    
    // Add all categories from configured productCategories list
    if (productCategories && productCategories.length > 0) {
      productCategories.forEach((cat) => {
        if (cat && typeof cat === 'string' && !allCats.some(c => c.toLowerCase().trim() === cat.toLowerCase().trim())) {
          allCats.push(cat.trim());
        }
      });
    }

    // Also include any newly added categories directly from product catalog
    if (products && products.length > 0) {
      products.forEach((p) => {
        if (p.category && typeof p.category === 'string') {
          const trimmed = p.category.trim().replace(' font-bold', '');
          if (trimmed && !allCats.some(c => c.toLowerCase().trim() === trimmed.toLowerCase().trim())) {
            allCats.push(trimmed);
          }
        }
      });
    }

    // Filter by visibility settings and exclude separate juice link
    return allCats.filter((cat) => {
      const lower = cat.toLowerCase();
      if (lower === 'fnl juices' || lower === 'fnl juice' || lower === 'cold pressed juices') return false;
      const vis = categoryVisibility[cat] || categoryVisibility[cat.trim()] || {};
      if (isHorecaUser) {
        return vis.horeca !== false;
      }
      return vis.retail !== false;
    });
  }, [productCategories, products, categoryVisibility, isHorecaUser]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    if (location.pathname === '/shop') {
      navigate(`/shop?q=${encodeURIComponent(val)}`, { replace: true });
    } else if (val.trim().length > 0) {
      navigate(`/shop?q=${encodeURIComponent(val)}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-white w-full max-w-full box-border overflow-x-clip">
      {/* Top Premium Announcement Bar */}
      {/* Top Banner */}
      <div className="bg-primary text-white text-[9px] min-[360px]:text-[10px] sm:text-[11px] tracking-wider uppercase font-black py-2 px-2 text-center select-none flex items-center justify-center gap-1.5 relative z-50">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0"></span>
        <span className="leading-tight">
          SURAT'S PREMIUM FRESH DELIVERY ENGINE - FREE DELIVERY ABOVE ₹1000/-
        </span>
      </div>

      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl shadow-xs border-b border-border/50">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-4 md:px-8 h-14 sm:h-18 flex items-center justify-between gap-1.5 w-full box-border">
          <div className="flex items-center gap-1.5 sm:gap-3 z-10 min-w-0">
            <Link to="/" className="flex items-center gap-1 sm:gap-2 group shrink-0">
              {faviconUrl && !logoError && (
                <motion.img 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  src={faviconUrl} 
                  alt="Logo" 
                  onError={() => setLogoError(true)}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 sm:w-9 sm:h-9 object-contain rounded-full shrink-0" 
                />
              )}
              <span className="font-sans font-black text-xs min-[360px]:text-sm sm:text-xl tracking-tighter uppercase text-foreground flex items-center gap-0.5 shrink-0">
                FreshNLocal<span className="text-primary font-black">.CO</span>
              </span>
            </Link>

            {/* Vertical separator & Location Badge */}
            <div className="pl-1.5 sm:pl-3 border-l border-border/80 flex items-center h-6 min-w-0 shrink-0">
              <DeliveryLocationBadge />
            </div>
            
            <nav className="hidden lg:flex items-center gap-4 xl:gap-6 ml-3 xl:ml-6 text-[10px] xl:text-[11px] uppercase tracking-wider font-extrabold text-[#506053] shrink-0">
              <Link to="/" className="nav-link-underline hover:text-primary transition-colors hover:scale-105 transform duration-150 shrink-0 whitespace-nowrap">Home</Link>
              <Link to="/shop" className="nav-link-underline hover:text-primary transition-colors hover:scale-105 transform duration-150 shrink-0 whitespace-nowrap">Catalog</Link>
              <Link to="/fnl-recipes" className="nav-link-underline text-primary hover:text-primary transition-colors hover:scale-105 transform duration-150 flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                FNL Recipes
                <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                  <ChefHat className="w-3 h-3 text-primary" />
                </div>
              </Link>
              <Link to="/juice" className="nav-link-underline hover:text-orange-500 transition-colors hover:scale-105 transform duration-150 text-orange-600 font-black shrink-0 whitespace-nowrap">FNL Juice 🍹</Link>
              <Link to="/about" className="nav-link-underline hover:text-primary transition-colors hover:scale-105 transform duration-150 shrink-0 whitespace-nowrap">Story</Link>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 shrink-0">
            {/* Wishlist Button (Desktop/Laptop only) */}
            <Link to="/wishlist" title="Wishlist" className="hidden md:flex relative items-center justify-center w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full border border-border hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500 transition-all group">
              <Heart className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-foreground group-hover:text-red-500 transition-colors" />
            </Link>

            {/* Cart Button with Counter Badge */}
            <Link to="/cart" title="Shopping Cart" className="relative flex items-center justify-center w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full border border-border hover:border-primary/50 hover:bg-primary/5 transition-all">
              <ShoppingBag className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-foreground" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-background shadow-xs">
                  {cartItemsCount}
                </span>
              )}
            </Link>

            {!loading && (
              <>
                {user ? (
                  <div className="flex items-center gap-1.5 sm:gap-2.5">
                    {(user.role === 'admin' || user.role === 'horeca_admin') && (
                      <Link to="/admin" title="Admin Panel" className="text-[10px] uppercase tracking-wider font-extrabold text-primary hidden xl:block border border-primary/25 hover:border-primary bg-primary/5 px-3 py-1.5 rounded-full transition-all shrink-0 whitespace-nowrap">
                        {user.role === 'horeca_admin' ? 'HoReCa Desk' : 'Admin Portal'}
                      </Link>
                    )}
                    <div className="relative group flex items-center gap-1.5 sm:gap-2">
                      {(user.role === 'horeca' || user.role === 'horeca_admin') && (
                        <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/25 rounded-full cursor-help shadow-2xs shrink-0" title="Verified HoReCa B2B Wholesale Partner">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span className="text-[9px] uppercase font-black tracking-widest text-primary">B2B Partner</span>
                        </div>
                      )}
                      {user.points !== undefined && (
                        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full cursor-pointer hover:bg-primary/20 transition-colors shrink-0">
                           <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                           <span className="text-[10px] uppercase font-black tracking-widest text-primary">{user.points} PTS</span>
                        </div>
                      )}
                      <span className="text-[10px] uppercase tracking-wider font-black hidden 2xl:block text-[#506053] group-hover:text-primary cursor-pointer transition-colors shrink-0">
                        {user.displayName?.split(' ')[0] || 'User'}
                      </span>
                      <Link to="/profile" className="relative flex items-center justify-center w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full border border-border hover:border-primary/50 hover:bg-secondary/40 transition-all">
                        {(user.role === 'horeca' || user.role === 'horeca_admin') ? (
                          <ChefHat className="w-4 h-4 text-orange-600" />
                        ) : (
                          <User className="w-4 h-4 text-foreground" />
                        )}
                      </Link>
                      <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                        <Link to="/profile" className="block px-4 py-3 text-[10px] uppercase tracking-widest font-extrabold rounded-xl hover:bg-primary hover:text-white text-foreground transition-all">My Profile</Link>
                        <Link to="/orders" className="block px-4 py-3 text-[10px] uppercase tracking-widest font-extrabold rounded-xl hover:bg-primary hover:text-white text-foreground transition-all">My Orders</Link>
                        <Link to="/profile?tab=recipes" className="block px-4 py-3 text-[10px] uppercase tracking-widest font-extrabold rounded-xl hover:bg-primary hover:text-white text-foreground transition-all">Saved Recipes</Link>
                        {(user.role === 'admin' || user.role === 'horeca_admin') && (
                          <Link to="/admin" className="block lg:hidden px-4 py-3 text-[10px] uppercase tracking-widest font-extrabold rounded-xl hover:bg-primary hover:text-white text-primary transition-all">
                            {user.role === 'horeca_admin' ? 'HoReCa Desk' : 'Admin Portal'}
                          </Link>
                        )}
                        <hr className="my-2 border-border" />
                        <button onClick={async () => { await signOut(); notifySignOutSuccess(); }} className="w-full text-left px-4 py-3 text-[10px] uppercase tracking-widest font-extrabold rounded-xl hover:bg-red-600/10 hover:text-red-500 text-red-500 transition-all flex items-center gap-2 cursor-pointer">
                          <LogOut className="w-3.5 h-3.5" /> Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setIsAuthModalOpen(true)} className="flex items-center justify-center w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full border border-border hover:border-primary/50 hover:bg-primary/5 transition-all">
                    <LogIn className="w-4 h-4 text-foreground" />
                  </button>
                )}
              </>
            )}

            <button 
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)} 
              className="md:hidden flex items-center justify-center w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full border border-border hover:bg-secondary transition-colors text-foreground shrink-0"
              aria-label="Toggle Menu"
            >
              {isMobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMobileNavOpen && (
          <>
            {/* Backdrop with subtle blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileNavOpen(false)}
              className="fixed inset-0 bg-black/35 backdrop-blur-xs z-40 md:hidden"
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            {/* Frosted Glass Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white/80 backdrop-blur-2xl border-l border-white/50 z-50 md:hidden p-7 flex flex-col justify-between shadow-[0_20px_60px_rgba(0,0,0,0.12)]"
              style={{ position: 'fixed', top: 0, bottom: 0, right: 0 }}
            >
              <div>
                <div className="flex items-center justify-between pb-5 border-b border-black/5 mb-6">
                  <span className="font-sans font-black uppercase text-xs tracking-[0.2em] text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Navigation
                  </span>
                  <button 
                    onClick={() => setIsMobileNavOpen(false)}
                    className="w-9 h-9 rounded-full bg-white/80 border border-black/5 backdrop-blur-md flex items-center justify-center hover:bg-white text-foreground shadow-2xs transition-colors cursor-pointer"
                    aria-label="Close navigation"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <nav className="flex flex-col gap-4 text-[13px] uppercase tracking-[0.18em] font-extrabold text-foreground">
                  <Link 
                    to="/" 
                    onClick={() => setIsMobileNavOpen(false)} 
                    className="px-3 py-2.5 rounded-xl hover:bg-white/70 hover:text-primary transition-all flex justify-between items-center"
                  >
                    <span>Home</span> <span className="text-muted-foreground/50">→</span>
                  </Link>
                  <Link 
                    to="/shop" 
                    onClick={() => setIsMobileNavOpen(false)} 
                    className="px-3 py-2.5 rounded-xl hover:bg-white/70 hover:text-primary transition-all flex justify-between items-center"
                  >
                    <span>Shop All</span> <span className="text-muted-foreground/50">→</span>
                  </Link>
                  <Link 
                    to="/fnl-recipes" 
                    onClick={() => setIsMobileNavOpen(false)} 
                    className="px-3 py-2.5 rounded-xl hover:bg-white/70 text-primary transition-all flex justify-between items-center font-black"
                  >
                    <span className="flex items-center gap-2">
                      FNL Recipes
                      <div className="w-6 h-6 bg-primary/15 backdrop-blur-xs rounded-full flex items-center justify-center shrink-0">
                        <ChefHat className="w-3.5 h-3.5 text-primary" />
                      </div>
                    </span> 
                    <span className="text-primary/50">→</span>
                  </Link>
                  <Link 
                    to="/juice" 
                    onClick={() => setIsMobileNavOpen(false)} 
                    className="px-3 py-2.5 rounded-xl hover:bg-white/70 text-orange-600 hover:text-orange-700 transition-all flex justify-between items-center font-black"
                  >
                    <span>FNL Juice 🍹</span> <span className="text-orange-400">→</span>
                  </Link>
                  <Link 
                    to="/about" 
                    onClick={() => setIsMobileNavOpen(false)} 
                    className="px-3 py-2.5 rounded-xl hover:bg-white/70 hover:text-primary transition-all flex justify-between items-center"
                  >
                    <span>Our story</span> <span className="text-muted-foreground/50">→</span>
                  </Link>
                  <Link 
                    to="/wishlist" 
                    onClick={() => setIsMobileNavOpen(false)} 
                    className="px-3 py-2.5 rounded-xl hover:bg-white/70 hover:text-red-500 transition-all flex justify-between items-center text-red-500 font-extrabold"
                  >
                    <span>Wishlist</span>
                    <Heart className="w-4 h-4 fill-red-500" />
                  </Link>
                  
                  {user && (
                    <>
                      <Link 
                        to="/profile" 
                        onClick={() => setIsMobileNavOpen(false)} 
                        className="px-3 py-2.5 rounded-xl hover:bg-white/70 hover:text-primary transition-all flex justify-between items-center"
                      >
                        <span>My Profile</span> <span className="text-muted-foreground/50">→</span>
                      </Link>
                      <Link 
                        to="/orders" 
                        onClick={() => setIsMobileNavOpen(false)} 
                        className="px-3 py-2.5 rounded-xl hover:bg-white/70 hover:text-primary transition-all flex justify-between items-center"
                      >
                        <span>My Orders</span> <span className="text-muted-foreground/50">→</span>
                      </Link>
                      <Link 
                        to="/profile?tab=recipes" 
                        onClick={() => setIsMobileNavOpen(false)} 
                        className="px-3 py-2.5 rounded-xl hover:bg-white/70 hover:text-primary transition-all flex justify-between items-center"
                      >
                        <span>Saved Recipes</span> <span className="text-muted-foreground/50">→</span>
                      </Link>
                      {(user.role === 'admin' || user.role === 'horeca_admin') && (
                        <Link 
                          to="/admin" 
                          onClick={() => setIsMobileNavOpen(false)} 
                          className="px-3 py-2.5 rounded-xl hover:bg-white/70 text-primary transition-all flex justify-between items-center font-black"
                        >
                          <span>{user.role === 'horeca_admin' ? 'HoReCa Desk' : 'Admin Portal'}</span> <span className="text-primary/60">★</span>
                        </Link>
                      )}
                    </>
                  )}
                </nav>
              </div>

              <div className="pt-5 border-t border-black/5 mt-auto">
                {user ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-white/70 backdrop-blur-md rounded-2xl border border-black/5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-extrabold">
                        Signed In As:
                        <span className="text-foreground block font-bold text-xs mt-0.5 truncate">{user.displayName || user.email}</span>
                        {(user.role === 'horeca' || user.role === 'horeca_admin') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-2 bg-orange-500/10 border border-orange-500/20 rounded-md">
                            <ChefHat className="w-3.5 h-3.5 text-orange-600" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-orange-600">Partner</span>
                          </span>
                        )}
                      </p>
                    </div>
                    <button 
                      onClick={async () => {
                        await signOut();
                        notifySignOutSuccess();
                        setIsMobileNavOpen(false);
                      }} 
                      className="w-full py-3.5 bg-red-600/90 hover:bg-red-600 text-white rounded-2xl text-[10px] uppercase tracking-widest font-extrabold text-center transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sign Out
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => {
                      setIsMobileNavOpen(false);
                      setIsAuthModalOpen(true);
                    }} 
                    className="slice-btn-primary w-full py-4 rounded-2xl shadow-md cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" /> Access Accounts
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col">
          <Outlet />
        </div>
      </main>

      <footer className="bg-secondary border-t border-border/60 py-16 sm:py-20 md:py-24 mt-20 text-[10px] uppercase tracking-[0.2em] font-extrabold text-[#506053]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 grid grid-cols-1 md:grid-cols-12 gap-8 sm:gap-10 lg:gap-12 text-[#2c3e30]">
          {/* Brand & Contact Info */}
          <div className="md:col-span-5 lg:col-span-4 space-y-6">
            <h3 className="font-sans font-black text-foreground text-2xl tracking-tighter uppercase normal-case flex items-center gap-3">
              {faviconUrl && !logoError && (
                <motion.img 
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  src={faviconUrl} 
                  alt="Logo" 
                  onError={() => setLogoError(true)}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-contain rounded-lg shadow-xs" 
                />
              )}
              <span>FreshNLocal<span className="text-primary">.CO</span></span>
            </h3>
            <p className="text-muted-foreground max-w-sm leading-relaxed normal-case tracking-normal text-xs font-sans font-medium">
              Surat's finest technology-driven fresh delivery order. Bringing fully vetted, hand-harvested fresh crops, local seasonal fruits, and premium exotics straight to your micro-kitchen.
            </p>
            <div className="text-muted-foreground space-y-3 normal-case tracking-normal text-xs font-sans font-semibold">
              <p className="flex items-start gap-2.5">
                <MapPin className="text-primary w-4 h-4 mt-0.5 shrink-0" /> 
                <span>Gr Floor Hall, Reva Dham Apartment, Uma Bhawan Crossroad, Opp. Ashirwad Palace, Bhatar, Surat, Gujarat</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="text-primary w-4 h-4 shrink-0" /> 
                <a href="tel:+917284000881" className="hover:text-primary transition-colors">+91 7284000881</a>
              </p>
              <p className="flex items-center gap-2.5">
                <Mail className="text-primary w-4 h-4 shrink-0" /> 
                <a href="mailto:freshnlocalco@gmail.com" className="hover:text-primary transition-colors border-b border-border/40">freshnlocalco@gmail.com</a>
              </p>
              <div className="flex items-center gap-3.5 pt-2">
                <a href="https://www.instagram.com/freshnlocalco?igsh=MWlrcWFoNjBjYnh2Yg==" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:border-primary hover:text-primary transition-all shadow-xs" aria-label="Instagram">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                </a>
                <a href="https://m.facebook.com/freshnlocalco/" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:border-blue-500 hover:text-blue-500 transition-all shadow-xs" aria-label="Facebook">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
              </div>
            </div>
          </div>

          {/* Dynamic Collections Grid (2-column layout on tablet/desktop to stay compact & balanced) */}
          <div className="md:col-span-4 lg:col-span-5">
            <h4 className="font-sans font-black tracking-[0.25em] text-foreground opacity-90 border-b border-border pb-2.5">
              Collections
            </h4>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-xs font-sans font-medium normal-case tracking-normal">
              <div className="col-span-1 sm:col-span-2 flex flex-col sm:flex-row gap-2 sm:gap-4 pb-1">
                <Link to="/shop" className="hover:text-primary font-bold text-foreground hover:translate-x-1 inline-flex items-center gap-1 transition-all duration-200">
                  Shop All Products →
                </Link>
                <Link to="/juice" className="hover:text-orange-500 text-orange-600 font-extrabold hover:translate-x-1 inline-flex items-center gap-1 transition-all duration-200">
                  🍹 Cold-Pressed Juices
                </Link>
              </div>
              {footerCategories.map((catName) => (
                <Link 
                  key={catName}
                  to={`/shop?category=${encodeURIComponent(catName)}`} 
                  className="text-muted-foreground hover:text-primary hover:translate-x-1 transition-all duration-200 capitalize truncate block py-0.5"
                  title={catName}
                >
                  {catName}
                </Link>
              ))}
            </div>
          </div>

          {/* Information & Policies */}
          <div className="md:col-span-3 lg:col-span-3">
            <h4 className="font-sans font-black tracking-[0.25em] text-foreground opacity-90 border-b border-border pb-2.5">
              Information
            </h4>
            <ul className="space-y-3 mt-5 text-xs font-sans font-medium normal-case tracking-normal">
              <li><Link to="/about" className="text-muted-foreground hover:text-primary hover:translate-x-1 inline-block transition-all duration-200">Our Story & Mission</Link></li>
              <li><Link to="#" className="text-muted-foreground hover:text-primary hover:translate-x-1 inline-block transition-all duration-200">Privacy Policy</Link></li>
              <li><Link to="#" className="text-muted-foreground hover:text-primary hover:translate-x-1 inline-block transition-all duration-200">Terms of Service</Link></li>
              <li><Link to="/returns" className="text-muted-foreground hover:text-primary hover:translate-x-1 inline-block transition-all duration-200">Returns & Refund Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-16 pt-6 border-t border-border/70 flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] text-muted-foreground">
          <p>© {new Date().getFullYear()} FreshNLocal.CO Vetted fresh farming, delivered cold in Surat.</p>
          <p className="font-serif italic lowercase tracking-normal text-xs text-muted-foreground/80">sliced with precision engineering</p>
        </div>
      </footer>

      <AdminNotifier />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <LocationSelectorModal />
      <StickyMiniCartBar />
    </div>
  );
}
