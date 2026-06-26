import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
import { Cart } from './pages/Cart';
import { AdminDashboard } from './pages/AdminDashboard';
import { Profile } from './pages/Profile';
import { ProductDetail } from './pages/ProductDetail';
import { Orders } from './pages/Orders';
import { About } from './pages/About';
import { FNLJuice } from './pages/FNLJuice';
import { Wishlist } from './pages/Wishlist';
import { Returns } from './pages/Returns';

import { useSettings } from './store/useSettings';
import { useProducts } from './store/useProducts';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
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
  const { fetchCategoryImages } = useSettings();
  useEffect(() => {
    fetchCategoryImages();
  }, [fetchCategoryImages]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
