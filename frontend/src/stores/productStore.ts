// src/stores/productStore.ts
import { create } from 'zustand';
import { db, type Product } from '../lib/dexie';
import api from '../services/api';
import { useAuthStore } from './authStore';

const getShopId = async (): Promise<string | null> => {
  const shop = useAuthStore.getState().shop;
  if (shop?.id) return shop.id;
  const stored = localStorage.getItem('shopId');
  if (stored) return stored;
  const anyProduct = await db.products.limit(1).first();
  return anyProduct?.shopId || null;
};

const toCamelCase = async (product: any): Promise<Product> => {
  let shopId = product.shop;
  if (!shopId) {
    shopId = await getShopId() || '';
  }
  return {
    id: product.id,
    name: product.name,
    sku: product.sku || '',
    costPrice: parseFloat(product.cost_price),
    sellingPrice: parseFloat(product.selling_price),
    currentStock: product.current_stock,
    lowStockThreshold: product.low_stock_threshold ?? 5,
    isActive: product.is_active,
    shopId,
    customFields: product.custom_fields || {},
    initialStock: product.custom_fields?.initial_stock ?? product.current_stock,
  };
};

const extractList = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  console.warn('Unexpected API response format', data);
  return [];
};

/** Fetch all results from a paginated endpoint. Works even if the server isn't paginated. */
const fetchAllPages = async (url: string): Promise<any[]> => {
  let results: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const currentUrl: string = nextUrl;
    const response = await api.get(currentUrl);
    const data = response.data;
    results = results.concat(extractList(data));
    nextUrl = data.next || null;
  }

  return results;
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
  addProductOptimistic: (product: Product) => void;
  updateProductOptimistic: (id: string, data: Partial<Product>) => void;
  deleteProductOptimistic: (id: string) => void;
  adjustStockOptimistic: (id: string, delta: number, reason?: string) => void;
  updateProductAfterSync: (localId: string, serverProduct: any) => Promise<void>;
  clearProducts: () => void;
}

// 🔁 Fetch lock – prevents overlapping requests
let productFetchPromise: Promise<void> | null = null;

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,
  fullyLoaded: false,
  error: null,

  fetchProducts: async () => {
    // ✅ Log if a duplicate fetch is skipped
    if (productFetchPromise) {
      console.log('[productStore] Skipping duplicate fetch – one already in progress');
      return productFetchPromise;
    }

    productFetchPromise = (async () => {
      console.log('[productStore] fetchProducts called, online:', navigator.onLine);
      set({ loading: true, error: null, fullyLoaded: false });

      const shopId = await getShopId();
      if (!shopId) {
        console.error('[productStore] No shopId');
        set({ loading: false, products: [], fullyLoaded: true });
        return;
      }
      console.log('[productStore] Current shopId:', shopId);

      const storeProducts = get().products;
      const storeHasCorrectShop = storeProducts.length > 0 && storeProducts[0].shopId === shopId;

      const shouldLoadFromCache = !navigator.onLine || !storeHasCorrectShop;

      if (shouldLoadFromCache) {
        console.log('[productStore] Loading from IndexedDB...');
        let cached = await db.products.where('shopId').equals(shopId).toArray();
        console.log(`[productStore] IndexedDB query returned ${cached.length} products for shopId ${shopId}`);

        if (cached.length === 0) {
          const all = await db.products.toArray();
          console.log(`[productStore] All products in IndexedDB: ${all.length}`);
          cached = all.filter(p => p.shopId === shopId);
          console.log(`[productStore] After filtering, found ${cached.length} products for shop ${shopId}`);
        }

        if (cached.length > 0) {
          set({ products: cached, loading: false, fullyLoaded: true });
        } else {
          console.log(`[productStore] No products found for shop ${shopId} in IndexedDB`);
          set({ products: [], loading: true, fullyLoaded: false });
        }
      } else {
        console.log(`[productStore] Using existing ${get().products.length} products from store`);
        set({ loading: true, fullyLoaded: true });
      }

      if (navigator.onLine && !shouldSkipOnlineFetch()) {
        console.log(`[productStore] Requesting products for shop ${shopId}`);
        try {
          console.log('[productStore] Fetching fresh products from server...');
          const rawProducts = await fetchAllPages('/products/');
          const freshProducts = await Promise.all(rawProducts.map(toCamelCase));
          console.log(`[productStore] Synced ${freshProducts.length} products from server`);

          await db.products.where('shopId').equals(shopId).delete();
          console.log(`[productStore] Cleared products for shop ${shopId}`);

          if (freshProducts.length > 0) {
            await db.products.bulkPut(freshProducts);
          }

          const verifyCount = await db.products.where('shopId').equals(shopId).count();
          console.log(`[productStore] After sync, IndexedDB has ${verifyCount} products for shop ${shopId}`);
          set({ products: freshProducts, loading: false, fullyLoaded: true });
        } catch (err) {
          console.error('[productStore] Background sync failed', err);
          if (get().products.length === 0) {
            set({ loading: false, fullyLoaded: true });
          }
        }
      } else if (get().products.length === 0) {
        set({ loading: false, fullyLoaded: true });
      }
    })();

    try {
      await productFetchPromise;
    } finally {
      productFetchPromise = null;
    }
  },

  syncProducts: async () => {
    if (!navigator.onLine) return;
    if (shouldSkipOnlineFetch()) return;
    try {
      const shopId = await getShopId();
      if (!shopId) return;

      const rawProducts = await fetchAllPages('/products/');
      const freshProducts = await Promise.all(rawProducts.map(toCamelCase));

      await db.products.where('shopId').equals(shopId).delete();
      if (freshProducts.length > 0) {
        await db.products.bulkPut(freshProducts);
      }
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

  addProductOptimistic: (product) => {
    set((state) => ({ products: [product, ...state.products] }));
    db.products.add(product).catch(console.error);
  },

  updateProductOptimistic: (id, data) => {
    set((state) => ({
      products: state.products.map(p => p.id === id ? { ...p, ...data } : p)
    }));
    db.products.update(id, data).catch(console.error);
  },

  deleteProductOptimistic: (id) => {
    set((state) => ({ products: state.products.filter(p => p.id !== id) }));
    db.products.delete(id).catch(console.error);
  },

  adjustStockOptimistic: (id, delta, _reason) => {
    set((state) => ({
      products: state.products.map(p =>
        p.id === id ? { ...p, currentStock: Math.max(0, p.currentStock + delta) } : p
      )
    }));
    const product = get().products.find(p => p.id === id);
    if (product) db.products.update(id, { currentStock: product.currentStock }).catch(console.error);
  },

  updateProductAfterSync: async (localId, serverProduct) => {
    const camelProduct = await toCamelCase(serverProduct);
    await db.products.put(camelProduct);
    set((state) => ({
      products: state.products.map(p => p.id === localId ? camelProduct : p)
    }));
  },

  clearProducts: () => {
    set({ products: [], fullyLoaded: false });
  },
}));