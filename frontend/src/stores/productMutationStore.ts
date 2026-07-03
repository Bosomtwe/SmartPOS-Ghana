// src/stores/productMutationStore.ts
import { create } from 'zustand';
import { db, type ProductMutation, type Product } from '../lib/dexie';
import api from '../services/api';
import { useProductStore } from './productStore';
import { useAuthStore } from './authStore';

const toCamelCaseProduct = (product: any): Product => ({
  id: product.id,
  name: product.name,
  sku: product.sku || '',
  costPrice: parseFloat(product.cost_price),
  sellingPrice: parseFloat(product.selling_price),
  currentStock: product.current_stock,
  lowStockThreshold: product.low_stock_threshold ?? 5,
  isActive: product.is_active ?? true,
  shopId: product.shop,
  customFields: product.custom_fields || {},
});

const toCamelCaseMutationData = (data: any): Partial<Product> => {
  const result: any = {};
  if (data.name !== undefined) result.name = data.name;
  if (data.sku !== undefined) result.sku = data.sku;
  if (data.cost_price !== undefined) result.costPrice = parseFloat(data.cost_price);
  if (data.selling_price !== undefined) result.sellingPrice = parseFloat(data.selling_price);
  if (data.current_stock !== undefined) result.currentStock = data.current_stock;
  if (data.low_stock_threshold !== undefined) result.lowStockThreshold = data.low_stock_threshold;
  if (data.is_active !== undefined) result.isActive = data.is_active;
  if (data.custom_fields !== undefined) result.customFields = data.custom_fields;
  // ✅ Offline accuracy: also extract initialStock from custom_fields
  if (data.custom_fields?.initial_stock !== undefined) {
    result.initialStock = data.custom_fields.initial_stock;
  }
  return result;
};

interface ProductMutationState {
  pendingCount: number;
  isSyncing: boolean;
  addMutation: (mutation: Omit<ProductMutation, 'id' | 'createdAt' | 'synced' | 'syncError'>) => Promise<void>;
  syncMutations: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const applyMutationToLocalStore = (mutation: Omit<ProductMutation, 'id' | 'createdAt' | 'synced' | 'syncError'>) => {
  const productStore = useProductStore.getState();
  const shop = useAuthStore.getState().shop;
  const shopId = shop?.id || localStorage.getItem('shopId') || '';

  if (mutation.type === 'CREATE' && mutation.data) {
    const camelData = toCamelCaseMutationData(mutation.data);
    const newProduct: Product = {
      id: mutation.data.id || crypto.randomUUID(),
      name: camelData.name || '',
      sku: camelData.sku || '',
      costPrice: camelData.costPrice ?? 0,
      sellingPrice: camelData.sellingPrice ?? 0,
      currentStock: camelData.currentStock ?? 0,
      lowStockThreshold: camelData.lowStockThreshold ?? 5,
      isActive: camelData.isActive ?? true,
      shopId: shopId,
      customFields: camelData.customFields || {},
      initialStock: camelData.initialStock ?? camelData.currentStock ?? 0,
    };
    productStore.addProductOptimistic(newProduct);
  }
  else if (mutation.type === 'UPDATE' && mutation.productId && mutation.data) {
    const camelData = toCamelCaseMutationData(mutation.data);
    productStore.updateProductOptimistic(mutation.productId, camelData);
  }
  else if (mutation.type === 'DELETE' && mutation.productId) {
    productStore.deleteProductOptimistic(mutation.productId);
  }
  else if (mutation.type === 'STOCK_ADJUST' && mutation.productId && mutation.data) {
    const { quantity, reason } = mutation.data;
    productStore.adjustStockOptimistic(mutation.productId, quantity, reason);
  }
};

export const useProductMutationStore = create<ProductMutationState>((set, get) => ({
  pendingCount: 0,
  isSyncing: false,

  refreshPendingCount: async () => {
    const unsynced = await db.productMutations.filter(m => !m.synced).count();
    set({ pendingCount: unsynced });
  },

  addMutation: async (mutation) => {
    const { user } = useAuthStore.getState();
    if (user?.role !== 'OWNER') {
      console.warn('[productMutation] Cashier cannot create mutations');
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date();

    applyMutationToLocalStore(mutation);

    await db.productMutations.add({
      id,
      ...mutation,
      createdAt: now,
      synced: false,
      syncError: null,
    });

    await get().refreshPendingCount();

    if (navigator.onLine) {
      get().syncMutations().catch(console.error);
    }
  },

  syncMutations: async () => {
    const { user } = useAuthStore.getState();
    if (user?.role !== 'OWNER') {
      console.warn('[productMutation] Cashier cannot sync mutations');
      return;
    }

    if (get().isSyncing) return;
    set({ isSyncing: true });

    try {
      const unsynced = await db.productMutations.filter(m => !m.synced).sortBy('createdAt');
      if (unsynced.length === 0) {
        set({ isSyncing: false });
        return;
      }

      for (const mutation of unsynced) {
        try {
          switch (mutation.type) {
            case 'CREATE': {
              const { id: tempId, ...productData } = mutation.data;
              const apiPayload = {
                ...productData,
                custom_fields: productData.custom_fields || {},
              };
              const response = await api.post('/products/', apiPayload);
              const serverProduct = toCamelCaseProduct(response.data);
              const productStore = useProductStore.getState();
              const finalTempId = tempId || mutation.data.id || mutation.productId;
              if (finalTempId) {
                await db.products.delete(finalTempId);
                productStore.deleteProductOptimistic(finalTempId);
              }
              productStore.addProductOptimistic(serverProduct);
              break;
            }
            case 'UPDATE': {
              const apiPayload = {
                ...mutation.data,
                custom_fields: mutation.data.custom_fields || {},
              };
              await api.patch(`/products/${mutation.productId}/`, apiPayload);
              break;
            }
            case 'DELETE': {
              await api.delete(`/products/${mutation.productId}/`);
              break;
            }
            case 'STOCK_ADJUST': {
              const { quantity, reason } = mutation.data;
              await api.post(`/products/${mutation.productId}/stock/`, { quantity, reason });
              break;
            }
          }
          await db.productMutations.update(mutation.id, { synced: true, syncError: null });
        } catch (err: any) {
          if (err.response?.status === 404) {
            // The product no longer exists – consider the mutation resolved
            await db.productMutations.update(mutation.id, { synced: true, syncError: null });
          } else {
            const errorMsg = err.response?.data?.error || err.message || 'Sync failed';
            await db.productMutations.update(mutation.id, { syncError: errorMsg });
            console.error(`Mutation ${mutation.id} failed:`, errorMsg);
          }
        }
      }
      // ✅ REMOVED: automatic syncProducts() call that was overwriting optimistic updates
    } finally {
      await get().refreshPendingCount();
      set({ isSyncing: false });
    }
  },
}));