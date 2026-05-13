// src/stores/cartStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useUIStore } from './uiStore';
import type { Product } from '../lib/dexie';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  total: number;
  addItem: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  _recalculateTotal: () => void;
}

const getNumericPrice = (price: any): number => {
  if (typeof price === 'number') return price;
  const parsed = parseFloat(price);
  return isNaN(parsed) ? 0 : parsed;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      total: 0,

      _recalculateTotal: () => {
        const items = get().items;
        const newTotal = items.reduce((sum, item) => {
          const price = getNumericPrice(item.product.sellingPrice);
          const qty = typeof item.quantity === 'number' ? item.quantity : 1;
          return sum + price * qty;
        }, 0);
        set({ total: newTotal });
      },

      addItem: (product, quantity = 1) => {
        const currentStock = product.currentStock ?? 0;
        const lowStockThreshold = product.lowStockThreshold ?? 5;

        if (currentStock <= 0) {
          useUIStore.getState().addToast({
            message: `${product.name} is out of stock.`,
            type: 'warning',
          });
          return;
        }

        // Low stock warning
        if (currentStock <= lowStockThreshold) {
          useUIStore.getState().addToast({
            message: `Low stock: Only ${currentStock} ${product.name} left.`,
            type: 'info',
            duration: 3000,
          });
        }

        const existing = get().items.find((i) => i.product.id === product.id);
        const currentQty = existing?.quantity || 0;
        const newQuantity = currentQty + quantity;

        if (newQuantity > currentStock) {
          const available = currentStock - currentQty;
          useUIStore.getState().addToast({
            message:
              available <= 0
                ? `${product.name} is out of stock.`
                : `Only ${available} more ${product.name} available.`,
            type: 'warning',
          });
          return;
        }

        if (existing) {
          get().updateQuantity(product.id, newQuantity);
        } else {
          set((state) => ({ items: [...state.items, { product, quantity }] }));
          get()._recalculateTotal();
        }
      },

      updateQuantity: (productId, quantity) => {
        const item = get().items.find((i) => i.product.id === productId);
        if (!item) return;

        const currentStock = item.product.currentStock ?? 0;
        const lowStockThreshold = item.product.lowStockThreshold ?? 5;

        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }

        if (quantity > currentStock) {
          useUIStore.getState().addToast({
            message: `Only ${currentStock} ${item.product.name} available.`,
            type: 'warning',
          });
          return;
        }

        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId ? { ...i, quantity } : i
          ),
        }));
        get()._recalculateTotal();

        // Warn if new quantity reaches or exceeds low stock threshold
        const newItem = get().items.find(i => i.product.id === productId);
        if (newItem && currentStock - quantity <= lowStockThreshold && currentStock - quantity > 0) {
          useUIStore.getState().addToast({
            message: `Low stock: Only ${currentStock - quantity} ${item.product.name} remaining after this sale.`,
            type: 'info',
            duration: 3000,
          });
        }
      },

      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter((i) => i.product.id !== productId) }));
        get()._recalculateTotal();
      },

      clearCart: () => {
        set({ items: [], total: 0 });
      },
    }),
    {
      name: 'cart-storage',
    }
  )
);