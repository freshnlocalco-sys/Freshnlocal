import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getUnitQuantityConfig } from '../lib/horecaUtils';

export interface ProductVariant {
  unit: string;
  quantityValue?: number;
  quantityUnit?: string;
  packSize?: string;
  price: number;
  originalPrice?: number;
  horecaPrice?: number;
  horecaUnit?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  horecaPrice?: number;
  horecaUnit?: string;
  imageUrl: string;
  category: string;
  description: string;
  metaDescription?: string;
  unit?: string;
  quantityValue?: number;
  quantityUnit?: string;
  packSize?: string;
  variants?: ProductVariant[];
  stock: number;
  inStock: boolean;
  orderIndex?: number;
  createdAt: number;
  updatedAt: number;
  useBasePricing?: boolean;
  basePrice?: number;
  baseUnit?: string;
  baseOriginalPrice?: number;
  baseHorecaPrice?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber?: string;
  userId: string;
  customerType?: string;
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
      addItem: (product, quantity) => {
        if (!product || !product.id || (!product.inStock && product.price !== 0)) return;
        const config = getUnitQuantityConfig(product.unit);
        const qtyToAdd = quantity !== undefined ? quantity : config.initialQty;

        set((state) => {
          const existingItem = state.items.find((item) => item && item.product && item.product.id === product.id);
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item && item.product && item.product.id === product.id
                  ? { ...item, quantity: Number((item.quantity + qtyToAdd).toFixed(3)) }
                  : item
              ),
            };
          }
          return { items: [...(state.items || []), { product, quantity: qtyToAdd }] };
        });
      },
      removeItem: (productId) => {
        set((state) => ({
          items: (state.items || []).filter((item) => item && item.product && item.product.id !== productId),
        }));
      },
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: (state.items || []).map((item) =>
            item && item.product && item.product.id === productId ? { ...item, quantity } : item
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
      total: () => {
        return (get().items || []).reduce((total, item) => {
          if (!item || !item.product) return total;
          const config = getUnitQuantityConfig(item.product.unit);
          const packs = config.initialQty > 0 ? (item.quantity || 0) / config.initialQty : (item.quantity || 0);
          return total + (item.product.price || 0) * packs;
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
