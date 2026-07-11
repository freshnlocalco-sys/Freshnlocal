import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProductVariant {
  unit: string;
  price: number;
  originalPrice?: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl: string;
  category: string;
  description: string;
  unit?: string;
  variants?: ProductVariant[];
  stock: number;
  inStock: boolean;
  orderIndex?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber?: string;
  userId: string;
  createdAt: number;
  updatedAt?: number;
  totalAmount: number;
  status: string;
  items: CartItem[];
  address?: string;
  phone?: string;
  shippingDetails?: {
    name?: string;
    phone?: string;
    address?: string;
  };
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  total: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, quantity = 1) => {
        if (!product || !product.id || !product.inStock) return;
        set((state) => {
          const existingItem = state.items.find((item) => item && item.product && item.product.id === product.id);
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item && item.product && item.product.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return { items: [...state.items || [], { product, quantity }] };
        });
      },
      removeItem: (productId) => {
        set((state) => ({
          items: (state.items || []).filter((item) => item && item.product && item.product.id !== productId),
        }));
      },
      updateQuantity: (productId, quantity) => {
        set((state) => ({
          items: (state.items || []).map((item) =>
            item && item.product && item.product.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
      total: () => {
        return (get().items || []).reduce((total, item) => {
          if (!item || !item.product) return total;
          return total + (item.product.price || 0) * (item.quantity || 0);
        }, 0);
      },
    }),
    {
      name: 'fresh-n-local-cart',
      onRehydrateStorage: () => (state) => {
        if (state && state.items) {
          const stringified = JSON.stringify(state.items);
          if (stringified.length > 500000) {
            console.warn("Cart state too large, clearing to prevent quota issues");
            state.items = [];
          }
        }
      }
    }
  )
);
