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

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="orders" element={<Orders />} />
          <Route path="about" element={<About />} />
          <Route path="juice" element={<FNLJuice />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
