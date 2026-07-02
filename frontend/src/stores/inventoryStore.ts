// src/stores/inventoryStore.ts
import { create } from 'zustand';
import api from '../services/api';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  low_stock_threshold: number;
  is_active: boolean;
}

interface InventoryState {
  products: Product[];
  loading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  createProduct: (data: Partial<Product>) => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  adjustStock: (id: string, quantity: number, reason: string) => Promise<void>;
  clearProducts: () => void;   // ✅ MUST be here
}

const extractList = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  console.warn('Unexpected API response format', data);
  return [];
};

export const useInventoryStore = create<InventoryState>((set) => ({
  products: [],
  loading: false,
  error: null,

  fetchProducts: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/products/');
      set({ products: extractList(res.data), loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.detail || 'Failed to load products',
        loading: false,
      });
    }
  },

  createProduct: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/products/', data);
      set((state) => ({ products: [res.data, ...state.products], loading: false }));
    } catch (err: any) {
      set({
        error: err.response?.data?.detail || 'Failed to create product',
        loading: false,
      });
      throw err;
    }
  },

  updateProduct: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await api.patch(`/products/${id}/`, data);
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? res.data : p)),
        loading: false,
      }));
    } catch (err: any) {
      set({
        error: err.response?.data?.detail || 'Failed to update product',
        loading: false,
      });
      throw err;
    }
  },

  deleteProduct: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/products/${id}/`);
      set((state) => ({
        products: state.products.filter((p) => p.id !== id),
        loading: false,
      }));
    } catch (err: any) {
      set({
        error: err.response?.data?.detail || 'Failed to delete product',
        loading: false,
      });
      throw err;
    }
  },

  adjustStock: async (id, quantity, reason) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/products/${id}/stock/`, { quantity, reason });
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? res.data : p)),
        loading: false,
      }));
    } catch (err: any) {
      set({
        error: err.response?.data?.detail || 'Failed to adjust stock',
        loading: false,
      });
      throw err;
    }
  },

  // ✅ NEW: Clear all products from the store
  clearProducts: () => {
    set({ products: [] });
  },
}));