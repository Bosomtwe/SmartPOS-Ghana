// src/stores/productStore.ts
import { create } from 'zustand';
import { db, type Product } from '../lib/dexie';
import api from '../services/api';
import { useAuthStore } from './authStore';

const toCamelCase = (product: any): Product => ({
  id: product.id,
  name: product.name,
  sku: product.sku || '',
  costPrice: parseFloat(product.cost_price),
  sellingPrice: parseFloat(product.selling_price),
  currentStock: product.current_stock,
  lowStockThreshold: product.low_stock_threshold != null
    ? product.low_stock_threshold
    : 5,
  isActive: product.is_active,
  shopId: product.shop,
});

const extractList = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  console.warn('Unexpected API response format', data);
  return [];
};

const shouldSkipOnlineFetch = (): boolean => {
  if (!localStorage.getItem('skipNextOnlineFetch')) return false;
  const timestamp = localStorage.getItem('skipNextOnlineFetch_timestamp');
  if (timestamp) {
    const age = Date.now() - parseInt(timestamp, 10);
    const MAX_AGE_MS = 30 * 60 * 1000;
    if (age > MAX_AGE_MS) {
      localStorage.removeItem('skipNextOnlineFetch');
      localStorage.removeItem('skipNextOnlineFetch_timestamp');
      return false;
    }
  }
  return true;
};

interface ProductState {
  products: Product[];
  loading: boolean;
  fullyLoaded: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  syncProducts: () => Promise<void>;
  getProductById: (id: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  updateProductStock: (productId: string, delta: number) => void;
  fetchLowStockAlerts: () => Promise<Product[]>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,
  fullyLoaded: false,
  error: null,

  fetchProducts: async () => {
    set({ loading: true, error: null });
    const shop = useAuthStore.getState().shop;
    if (!shop) {
      set({ loading: false, products: [] });
      return;
    }

    // 1. Show cached products for THIS shop only
    let shopCached: Product[] = [];
    try {
      const allCached = await db.products.toArray();
      shopCached = allCached.filter(p => p.isActive && p.shopId === shop.id);
      set({ products: shopCached, loading: false, fullyLoaded: true });
    } catch (e) {
      console.error('Failed to load cached products', e);
      set({ loading: false });
    }

    // 2. Fetch fresh data in the background (if online & not in restore mode)
    if (navigator.onLine && !shouldSkipOnlineFetch()) {
      try {
        const response = await api.get('/products/');
        const freshProducts = extractList(response.data).map(toCamelCase);
        // Ensure only current shop's products are stored (API already returns them)
        await db.products.bulkPut(freshProducts);
        set({ products: freshProducts, loading: false, fullyLoaded: true });
      } catch (err) {
        console.error('Background product sync failed', err);
        // keep the cached shop products
        set({ loading: false });
      }
    }
  },

  syncProducts: async () => {
    if (!navigator.onLine) return;
    if (shouldSkipOnlineFetch()) return;
    try {
      const response = await api.get('/products/');
      const freshProducts = extractList(response.data).map(toCamelCase);
      await db.products.bulkPut(freshProducts);
      set({ products: freshProducts });
    } catch (err) {
      console.error('Product sync failed', err);
    }
  },

  getProductById: (id) => get().products.find(p => p.id === id),

  searchProducts: (query) => {
    const lowerQuery = query.toLowerCase();
    return get().products.filter(p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      (p.sku && p.sku.toLowerCase().includes(lowerQuery))
    );
  },

  updateProductStock: (productId, delta) => {
    set((state) => ({
      products: state.products.map((p) =>
        p.id === productId ? { ...p, currentStock: Math.max(0, p.currentStock + delta) } : p
      ),
    }));
    const updated = get().products.find(p => p.id === productId);
    if (updated) db.products.put(updated);
  },

  fetchLowStockAlerts: async () => {
    return get().products.filter(p => p.currentStock <= p.lowStockThreshold && p.isActive);
  },
}));