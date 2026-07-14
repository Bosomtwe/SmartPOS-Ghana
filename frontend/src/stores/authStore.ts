// src/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';
import { db } from '../lib/dexie';
import { useSalesStore } from './saleStore';
import { useProductStore } from './productStore';
import { useCustomerStore } from './customerStore';
import { useInventoryStore } from './inventoryStore';
import { clearAllCashierListCaches } from '../services/offlineUsers';
import { useCartStore } from './cartStore';

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
  _doLogout: () => Promise<void>;
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

// Guards against logout() being invoked twice concurrently (e.g. React
// effect double-invocation in StrictMode, or a double click). Without
// this, two overlapping logout() calls can race on the IndexedDB clears
// and leave things in an inconsistent state right before a new login.
let logoutInProgress = false;

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
          // Subscription status is per-shop and gates access to the app
          // (see the subscription check above/in switchShop) — a stale
          // cached subscription from the previous shop must not leak into
          // this one, in either direction (falsely "active" or falsely
          // "expired").
          await db.currentSubscription.clear();
          // Cashier list is also per-shop (used in Dashboard/SalesHistory
          // "filter by user" dropdowns). getCashierList() already scopes
          // its cache by shop id, but clear everything here too as
          // defense in depth.
          clearAllCashierListCaches();
          console.log('[authStore] Cleared data from previous shop', previousShopId);
        }

        if (user.role !== 'OWNER') {
          await db.productMutations.clear();
          console.log('[Auth] Cleared product mutations for cashier');
        }

        useSalesStore.getState().clearSales();
        useProductStore.getState().clearProducts();
        useCustomerStore.getState().clearCustomers();
        // Cart items hold denormalized product data (price/stock) captured
        // at add-time. cartStore is persisted to localStorage but was never
        // cleared on login/logout/switchShop — a cart left over from a
        // previous session (interrupted checkout, or a different account
        // on a shared device) could otherwise be checked out against the
        // WRONG shop's pricing/stock after this login.
        useCartStore.getState().clearCart();

        // Always keep these IDs in sync
        localStorage.setItem('shopId', shop.id);
        setLastActiveShop(shop.id);
        console.log('[authStore] shopId saved to localStorage:', shop.id);

        set({ token: access, refreshToken: refresh, user, shop });

        await get().fetchShops();
      },

      logout: async () => {
        if (logoutInProgress) {
          console.log('[authStore] logout already in progress – skipping duplicate call');
          return;
        }
        logoutInProgress = true;
        try {
          await get()._doLogout();
        } finally {
          logoutInProgress = false;
        }
      },

      // Internal implementation, only ever called through the logout() guard above.
      _doLogout: async () => {
        // ✅ Keep products/customers/creditTransactions/sales for offline
        // use – do NOT clear any of them here. A same-shop relogin
        // (including the common offline case: logout, then log back into
        // the same shop while offline) must be able to use this cache.
        // Cross-shop cache invalidation is already handled correctly in
        // login(), which clears these tables when it detects the new
        // shop.id differs from the persisted lastActiveShopId. Clearing
        // them again here — even scoped to "this" shop — would just
        // recreate the bug: it wipes the exact cache a same-shop relogin
        // needs.
        await db.productMutations.clear();
        useSalesStore.getState().clearSales();   // only clears in‑memory store
        useInventoryStore.getState().clearProducts();   // ✅ optional but consistent
        useProductStore.getState().clearProducts();     // ✅ Clear in‑memory stores
        useCustomerStore.getState().clearCustomers();   // ✅ Clear in‑memory stores
        // Unlike sales/products/customers, an in-progress cart isn't
        // offline cache worth preserving across a logout — always clear it.
        useCartStore.getState().clearCart();

        // Clear auth-related flags, but KEEP lastActiveShopId
        localStorage.removeItem('shopId');
        localStorage.removeItem('auth-storage');
        //localStorage.removeItem('lastActiveShopId');   // ← add this

        // 🔒 Signal to Login page: never auto‑resume after a manual logout
        sessionStorage.setItem('manualLogout', 'true');

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
        useCartStore.getState().clearCart();
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
        const { shops, user, refreshToken, shop: oldShop } = get();
        const targetShop = shops.find(s => s.id === shopId);
        if (!targetShop) throw new Error('Shop not found');
        if (user?.role !== 'OWNER') throw new Error('Only owners can switch shops');

        // Wipe in‑memory stores instantly
        useProductStore.getState().clearProducts();
        useCustomerStore.getState().clearCustomers();
        useSalesStore.getState().clearSales();
        useInventoryStore.getState().clearProducts();   // ← add this
        useCartStore.getState().clearCart();   // cart pricing/stock is shop-specific

        // 🔧 NEW: Wrap the switch logic in try/catch to handle failures
        try {
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
          // Same reasoning as in login(): subscription status and the
          // cashier list are per-shop and must not leak across a switch.
          await db.currentSubscription.clear();
          clearAllCashierListCaches();

          // Set the new shop – re‑renders happen with empty local DB and correct token
          set({ user: updatedUser, shop: updatedShop });
          localStorage.setItem('shopId', updatedShop.id);
          setLastActiveShop(updatedShop.id);
          console.log('[authStore] Active shopId is now:', updatedShop.id);   // ✅ LOG
          console.log('[authStore] Switched to shop:', updatedShop.name);

          // 🔧 OPTIMIZATION: Reset fetch locks so the next shop's fetches can start immediately
          // Without this, the old shop's fetch lock would block the new shop's first request.
          console.log('[switchShop] Resetting fetch locks...');
          (useProductStore.getState() as any).__resetLock?.();
          (useCustomerStore.getState() as any).__resetLock?.();  // not strictly needed (no lock), but safe
          (useSalesStore.getState() as any).__resetLock?.();

          // Load fresh data for the new shop
          await Promise.all([
            useProductStore.getState().fetchProducts(),
            useCustomerStore.getState().fetchCustomers(),
            useSalesStore.getState().fetchSales(),
          ]);

          // ✅ NEW: redirect to /subscription if the new shop has no active subscription
          if (!updatedUser.is_superuser) {
            try {
              const subRes = await api.get('/subscriptions/current/');
              const sub = subRes.data;
              if (!sub || !sub.is_active) {
                window.location.href = '/subscription';
                return;
              }
            } catch {
              window.location.href = '/subscription';
              return;
            }
          }

          await get().fetchShops();

        } catch (error) {
          // ❌ Switch failed – revert to the previous shop so the UI stays consistent
          console.error('[switchShop] Failed, reverting to previous shop', error);

          // Restore the previous shop's ID and user object
          set({ user, shop: oldShop });
          localStorage.setItem('shopId', oldShop?.id || '');
          setLastActiveShop(oldShop?.id || '');

          // Re‑fetch the old shop’s data to repopulate the UI
          await Promise.all([
            useProductStore.getState().fetchProducts(),
            useCustomerStore.getState().fetchCustomers(),
            useSalesStore.getState().fetchSales(),
          ]);

          // Re‑throw so the UI can show an error toast if desired
          throw new Error('Shop switch failed. Please try again.');
        }
      },

      createShop: async (name: string, address?: string) => {
        const response = await api.post('/shops/create/', { name, address });
        const newShop = response.data;

        set((state) => ({ shops: [...state.shops, newShop] }));

        console.log('[authStore] Created new shop:', newShop.name);
        return newShop;
      },
    }),
    
    { 
      name: 'auth-storage',
      // 🔧 NEW: Only persist essential state to avoid stale data
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user ? {
          id: state.user.id,
          phone: state.user.phone,
          email: state.user.email,
          role: state.user.role,
          is_superuser: state.user.is_superuser,
          shop_id: state.user.shop_id,
        } : null,
        shop: state.shop,
        shops: state.shops,
      }),
    }
  )
);