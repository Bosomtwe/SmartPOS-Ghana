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
  lowStockThreshold: product.low_stock_threshold ?? 5,
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

const getShopId = async (): Promise<string | null> => {
  const shop = useAuthStore.getState().shop;
  if (shop?.id) return shop.id;
  const stored = localStorage.getItem('shopId');
  if (stored) return stored;
  const anyProduct = await db.products.limit(1).first();
  return anyProduct?.shopId || null;
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
    console.log('[productStore] fetchProducts called, online:', navigator.onLine);
    set({ loading: true, error: null, fullyLoaded: false });

    const shopId = await getShopId();
    if (!shopId) {
      console.error('[productStore] No shopId');
      set({ loading: false, products: [], fullyLoaded: true });
      return;
    }

    // 1. Load cached products (filtered)
    let cached = await db.products.where('shopId').equals(shopId).toArray();
    if (cached.length === 0) {
      const all = await db.products.toArray();
      if (all.length > 0) {
        console.warn(`[productStore] Filter returned 0, but total products: ${all.length}. Using all.`);
        cached = all;
      }
    }

    if (cached.length > 0) {
      console.log(`[productStore] Loaded ${cached.length} products from IndexedDB`);
      set({ products: cached, loading: false, fullyLoaded: true });
    } else {
      set({ products: [], loading: true, fullyLoaded: false });
    }

    // 2. Background sync if online and not in restore mode
    if (navigator.onLine && !shouldSkipOnlineFetch()) {
      try {
        const response = await api.get('/products/');
        const freshProducts = extractList(response.data).map(toCamelCase);
        console.log(`[productStore] Synced ${freshProducts.length} products from server`);
        await db.products.bulkPut(freshProducts);
        set({ products: freshProducts, loading: false, fullyLoaded: true });
      } catch (err) {
        console.error('[productStore] Background sync failed', err);
        if (cached.length === 0) set({ loading: false, fullyLoaded: true });
      }
    } else if (cached.length === 0) {
      set({ loading: false, fullyLoaded: true });
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
      console.log(`[productStore] Manual sync, ${freshProducts.length} products`);
    } catch (err) {
      console.error('[productStore] Sync failed', err);
    }
  },

  getProductById: (id) => get().products.find(p => p.id === id),
  searchProducts: (query) => {
    const lower = query.toLowerCase();
    return get().products.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      (p.sku && p.sku.toLowerCase().includes(lower))
    );
  },
  updateProductStock: (productId, delta) => {
    set((state) => ({
      products: state.products.map(p =>
        p.id === productId ? { ...p, currentStock: Math.max(0, p.currentStock + delta) } : p
      ),
    }));
    const updated = get().products.find(p => p.id === productId);
    if (updated) db.products.put(updated);
  },
  fetchLowStockAlerts: async () => get().products.filter(p => p.currentStock <= p.lowStockThreshold && p.isActive),
}));