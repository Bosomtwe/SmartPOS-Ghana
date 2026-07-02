// src/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';
import { db } from '../lib/dexie';
import { useSalesStore } from './saleStore';
import { useProductStore } from './productStore';
import { useCustomerStore } from './customerStore';
import { useInventoryStore } from './inventoryStore';

interface User {
  id: string;
  phone: string;
  email?: string | null;
  role: 'OWNER' | 'CASHIER';
  is_superuser: boolean;
  shop_id: string;
}

interface Shop {
  id: string;
  name: string;
  address: string;
  is_active?: boolean;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  shop: Shop | null;
  shops: Shop[];                    // list of owned shops
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (token: string, refreshToken: string, user: User, shop: Shop) => Promise<void>;
  setAccessToken: (token: string) => void;
  fetchShops: () => Promise<void>;
  switchShop: (shopId: string) => Promise<void>;
  createShop: (name: string, address?: string) => Promise<Shop>;
}

/**
 * Helper: persist the last active shop ID across sessions.
 * It is never removed on logout, so login can always detect a change.
 */
const setLastActiveShop = (shopId: string) => {
  localStorage.setItem('lastActiveShopId', shopId);
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      shop: null,
      shops: [],

      login: async (phone, password) => {
        console.log('[authStore] login called');
        const response = await api.post('/auth/login/', { phone, password });
        const { access, refresh } = response.data;

        api.defaults.headers.common['Authorization'] = `Bearer ${access}`;

        const userResponse = await api.get('/users/me/');
        const user = userResponse.data;
        console.log('[authStore] Role from server:', user.role);   // ← add this

        const shopResponse = await api.get('/shops/me/');
        const shop = shopResponse.data;
        console.log('[authStore] shop received:', shop);

        if (!user.is_superuser) {
          try {
            const subResponse = await api.get('/subscriptions/current/');
            const subscription = subResponse.data;
            if (!subscription || !subscription.is_active) {
              window.location.href = '/subscription';
              return;
            }
          } catch (err) {
            window.location.href = '/subscription';
            return;
          }
        }

        // ✅ Use the persistent marker to detect a real shop change
        const previousShopId = localStorage.getItem('lastActiveShopId');
        if (previousShopId && shop.id !== previousShopId) {
          // Different shop – clear all old data
          await db.products.clear();
          await db.customers.clear();
          await db.sales.clear();
          await db.creditTransactions.clear();
          console.log('[authStore] Cleared data from previous shop', previousShopId);
        }

        if (user.role !== 'OWNER') {
          await db.productMutations.clear();
          console.log('[Auth] Cleared product mutations for cashier');
        }

        useSalesStore.getState().clearSales();

        // Always keep these IDs in sync
        localStorage.setItem('shopId', shop.id);
        setLastActiveShop(shop.id);
        console.log('[authStore] shopId saved to localStorage:', shop.id);

        set({ token: access, refreshToken: refresh, user, shop });

        await get().fetchShops();
      },

      logout: async () => {
        // ✅ Keep sales for offline use – do NOT clear them here
        await db.products.clear();
        await db.customers.clear();
        // await db.sales.clear();            // removed to preserve offline data
        await db.creditTransactions.clear();
        await db.productMutations.clear();
        useSalesStore.getState().clearSales();   // only clears in‑memory store
        useInventoryStore.getState().clearProducts();   // ✅ optional but consistent

        // Clear auth-related flags, but KEEP lastActiveShopId
        localStorage.removeItem('shopId');
        localStorage.removeItem('auth-storage');
        //localStorage.removeItem('lastActiveShopId');   // ← add this

        useAuthStore.persist.clearStorage();

        set({ token: null, refreshToken: null, user: null, shop: null, shops: [] });
        delete api.defaults.headers.common['Authorization'];
        console.log('[authStore] logged out (sales preserved in IndexedDB)');
      },

      setAuth: async (token, refreshToken, user, shop) => {
        localStorage.removeItem('auth-storage');
        localStorage.setItem('shopId', shop.id);
        setLastActiveShop(shop.id);

        if (user.role !== 'OWNER') {
          await db.productMutations.clear();
        }
        useSalesStore.getState().clearSales();
        set({ token, refreshToken, user, shop });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log('[authStore] setAuth, shopId saved:', shop.id);
        await get().fetchShops();
      },

      setAccessToken: (token) => {
        set({ token });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      },

      fetchShops: async () => {
        try {
          const response = await api.get('/shops/my-shops/');
          set({ shops: response.data });
          console.log('[authStore] Fetched shops:', response.data.length);
        } catch (err) {
          console.error('[authStore] Failed to fetch shops:', err);
        }
      },

      switchShop: async (shopId: string) => {
        const { shops, user, refreshToken } = get();
        const targetShop = shops.find(s => s.id === shopId);
        if (!targetShop) throw new Error('Shop not found');
        if (user?.role !== 'OWNER') throw new Error('Only owners can switch shops');

        // Wipe in‑memory stores instantly
        useProductStore.getState().clearProducts();
        useCustomerStore.getState().clearCustomers();
        useSalesStore.getState().clearSales();
        useInventoryStore.getState().clearProducts();   // ← add this

        const response = await api.post('/shops/switch/', { shop_id: shopId });
        const { user: updatedUser, shop: updatedShop, access } = response.data;

        // ✅ Update token if server returns one; otherwise refresh manually
        if (access) {
          set({ token: access });
          api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
        } else if (refreshToken) {
          try {
            const refreshResponse = await api.post('/auth/refresh/', { refresh: refreshToken });
            const newAccess = refreshResponse.data.access;
            set({ token: newAccess });
            api.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`;
          } catch (e) {
            console.warn('[switchShop] Token refresh failed, continuing with current token');
          }
        }

        // Clear IndexedDB of old shop data
        await db.products.clear();
        await db.customers.clear();
        await db.sales.clear();
        await db.creditTransactions.clear();

        // Set the new shop – re‑renders happen with empty local DB and correct token
        set({ user: updatedUser, shop: updatedShop });
        localStorage.setItem('shopId', updatedShop.id);
        setLastActiveShop(updatedShop.id);
        console.log('[authStore] Active shopId is now:', updatedShop.id);   // ✅ LOG
        console.log('[authStore] Switched to shop:', updatedShop.name);

        // Load fresh data for the new shop
        await Promise.all([
          useProductStore.getState().fetchProducts(),
          useCustomerStore.getState().fetchCustomers(),
          useSalesStore.getState().fetchSales(),
        ]);

        await get().fetchShops();
      },

      createShop: async (name: string, address?: string) => {
        const response = await api.post('/shops/create/', { name, address });
        const newShop = response.data;

        set((state) => ({ shops: [...state.shops, newShop] }));

        console.log('[authStore] Created new shop:', newShop.name);
        return newShop;
      },
    }),
    { name: 'auth-storage' }
  )
);