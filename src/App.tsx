import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import React, { useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
import { Cart } from './pages/Cart';
import { AdminDashboard } from './pages/AdminDashboard';
import { Profile } from './pages/Profile';
import { RecipeAI } from './pages/RecipeAI';
import { ProductDetail } from './pages/ProductDetail';
import { Orders } from './pages/Orders';
import { About } from './pages/About';
import { FNLJuice } from './pages/FNLJuice';
import { Wishlist } from './pages/Wishlist';
import { Returns } from './pages/Returns';

import { useSettings } from './store/useSettings';
import { useProducts } from './store/useProducts';
import { usePWA } from './store/usePWA';
import { useCart } from './store/useCart';

import { TestCart } from './pages/TestCart';

function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const scrollPositions = React.useRef<Record<string, number>>({});

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    let timeoutId: any;
    const handleScroll = () => {
      // Throttle scroll saving to avoid performance issues
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        scrollPositions.current[pathname] = window.scrollY;
        sessionStorage.setItem(`scroll-${pathname}`, window.scrollY.toString());
        timeoutId = null;
      }, 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pathname]);

  useEffect(() => {
    // Force instant scroll on navigation
    document.documentElement.style.scrollBehavior = 'auto';
    
    if (navigationType === 'POP') {
      const savedStr = sessionStorage.getItem(`scroll-${pathname}`);
      const savedPosition = savedStr ? parseInt(savedStr, 10) : (scrollPositions.current[pathname] || 0);
      
      // Try multiple times to account for async rendering and image loading
      window.scrollTo({ top: savedPosition, behavior: 'instant' });
      const timeouts = [10, 50, 150, 300, 500].map(ms => 
        setTimeout(() => window.scrollTo({ top: savedPosition, behavior: 'instant' }), ms)
      );
      
      setTimeout(() => { document.documentElement.style.scrollBehavior = ''; }, 600);
      return () => {
        timeouts.forEach(clearTimeout);
        document.documentElement.style.scrollBehavior = '';
      };
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const timeout = setTimeout(() => { document.documentElement.style.scrollBehavior = ''; }, 50);
      return () => {
        clearTimeout(timeout);
        document.documentElement.style.scrollBehavior = '';
      };
    }
  }, [pathname, navigationType]);

  return null;
}

function CanonicalLink() {
  const { pathname } = useLocation();

  useEffect(() => {
    const canonicalUrl = `https://www.freshnlocal.co${pathname}`;
    let link: HTMLLinkElement | null = document.querySelector("link[rel='canonical']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonicalUrl;
  }, [pathname]);

  return null;
}

function GlobalLoader() {
  const { fetchCategoryImages, fetchFavicon, faviconUrl } = useSettings();
  const { setDeferredPrompt } = usePWA();
  
  useEffect(() => {
    fetchCategoryImages();
    fetchFavicon();
  }, [fetchCategoryImages, fetchFavicon]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      console.log('beforeinstallprompt event captured');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setDeferredPrompt]);

  useEffect(() => {
    let link: HTMLLinkElement | null = document.querySelector("link[rel='manifest']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    
    if (faviconUrl) {
      const cleanUrl = encodeURIComponent(faviconUrl);
      link.href = `/manifest.json?icon=${cleanUrl}`;
    } else {
      link.href = '/manifest.json';
    }
  }, [faviconUrl]);
  
  return null;
}

function AppToaster() {
  const { items } = useCart();
  const location = useLocation();
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const validItems = items.filter((item) => item && item.product && item.quantity > 0);
  const itemCount = validItems.reduce((acc, item) => acc + (item.quantity > 0 ? 1 : 0), 0);
  const isHiddenRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/admin');
  const isCartVisible = itemCount > 0 && !isHiddenRoute;

  // Always position bottom-right so react-hot-toast places it on the right side
  const toastPosition = 'bottom-right';

  // Calculate bottom offset: float above sticky cart (96px) or keep standard padding (16px)
  const bottomOffset = isMobile 
    ? (isCartVisible ? 104 : 20) 
    : 24;

  const containerStyle: React.CSSProperties = isMobile
    ? {
        bottom: `${bottomOffset}px`,
        right: '16px',
        left: 'auto',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 9999999,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }
    : {
        bottom: '24px',
        right: '24px',
        zIndex: 9999999,
      };

  return (
    <Toaster 
      position={toastPosition} 
      containerStyle={containerStyle}
      containerClassName="single-line-toast"
      toastOptions={{
        duration: 4000,
        className: 'single-line-toast',
        style: {
          background: '#ffffff',
          color: '#1a2e1d',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: '16px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
          padding: '12px 18px',
          fontSize: '13px',
          fontWeight: '600',
          maxWidth: 'calc(100vw - 32px)',
          width: 'max-content',
          whiteSpace: 'nowrap',
          lineHeight: '1.4',
        },
        success: {
          iconTheme: {
            primary: '#00b853',
            secondary: '#ffffff',
          },
        },
        error: {
          iconTheme: {
            primary: '#e11d48',
            secondary: '#ffffff',
          },
          style: {
            background: '#fff',
            color: '#9f1239',
            border: '1px solid rgba(225, 29, 72, 0.2)',
          }
        }
      }} 
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <CanonicalLink />
      <GlobalLoader />
      <AppToaster />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="fnl-recipes" element={<RecipeAI />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="testcart" element={<TestCart />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="admin" element={<Navigate to="/admin/consignments" replace />} />
          <Route path="admin/consignments" element={<AdminDashboard />} />
          <Route path="admin/inventory" element={<AdminDashboard />} />
          <Route path="admin/spotlights" element={<AdminDashboard />} />
          <Route path="admin/categories" element={<AdminDashboard />} />
          <Route path="admin/customers" element={<AdminDashboard />} />
          <Route path="admin/reviews" element={<AdminDashboard />} />
          <Route path="admin/hero" element={<AdminDashboard />} />
          <Route path="admin/offers" element={<AdminDashboard />} />
          <Route path="admin/promotions" element={<Navigate to="/admin/offers" replace />} />
          <Route path="admin/branding" element={<AdminDashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="orders" element={<Orders />} />
          <Route path="about" element={<About />} />
          <Route path="returns" element={<Returns />} />
          <Route path="juice" element={<FNLJuice />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
