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

function ProductDumper() {
  const { products, fetchProducts } = useProducts();
  useEffect(() => { fetchProducts(false) }, [fetchProducts]);
  useEffect(() => {
    if (products && products.length > 0) {
      fetch('/dump-products', { method: 'POST', body: JSON.stringify(products) }).catch(e=>e);
    }
  }, [products]);
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

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <CanonicalLink />
      <ProductDumper />
      <GlobalLoader />
      <Toaster position="bottom-right" toastOptions={{
        style: {
          background: '#fff',
          color: '#000',
          border: '1px solid #e5e5e5',
          borderRadius: '0px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          fontSize: '10px',
          letterSpacing: '0.1em'
        }
      }} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="fnl-recipes" element={<RecipeAI />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="admin" element={<Navigate to="/admin/consignments" replace />} />
          <Route path="admin/consignments" element={<AdminDashboard />} />
          <Route path="admin/inventory" element={<AdminDashboard />} />
          <Route path="admin/spotlights" element={<AdminDashboard />} />
          <Route path="admin/categories" element={<AdminDashboard />} />
          <Route path="admin/reviews" element={<AdminDashboard />} />
          <Route path="admin/hero" element={<AdminDashboard />} />
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
