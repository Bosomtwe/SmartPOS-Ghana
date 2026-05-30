// src/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';
import { db } from '../lib/dexie';

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
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  shop: Shop | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (token: string, refreshToken: string, user: User, shop: Shop) => void;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      shop: null,

      login: async (phone, password) => {
        console.log('[authStore] login called');
        const response = await api.post('/auth/login/', { phone, password });
        const { access, refresh } = response.data;

        api.defaults.headers.common['Authorization'] = `Bearer ${access}`;

        const userResponse = await api.get('/users/me/');
        const user = userResponse.data;

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

        const prevShopId = get().shop?.id;
        if (prevShopId && shop.id !== prevShopId) {
          await db.products.clear();
          await db.customers.clear();
          await db.sales.clear();
          await db.creditTransactions.clear();
        }

        localStorage.setItem('shopId', shop.id);
        console.log('[authStore] shopId saved to localStorage:', shop.id);

        set({ token: access, refreshToken: refresh, user, shop });
      },

      logout: async () => {
        await db.products.clear();
        await db.customers.clear();
        await db.sales.clear();
        await db.creditTransactions.clear();
        localStorage.removeItem('shopId');
        set({ token: null, refreshToken: null, user: null, shop: null });
        delete api.defaults.headers.common['Authorization'];
        console.log('[authStore] logged out, shopId removed');
      },

      setAuth: (token, refreshToken, user, shop) => {
        localStorage.setItem('shopId', shop.id);
        set({ token, refreshToken, user, shop });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log('[authStore] setAuth, shopId saved:', shop.id);
      },

      setAccessToken: (token) => {
        set({ token });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      },
    }),
    { name: 'auth-storage' }
  )
);