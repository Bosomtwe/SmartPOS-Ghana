// src/services/offlineUsers.ts
import api from './api';
import { useAuthStore } from '../stores/authStore';

const CACHE_KEY_PREFIX = 'cashierListCache';

// IMPORTANT: the cache key MUST include the shop id. This list is rendered
// as a "filter by user" dropdown on Dashboard/SalesHistory — if the cache
// were shared across shops, switching accounts (especially offline, or in
// the brief window before the first online refetch resolves) would show
// the PREVIOUS shop's cashiers as filter options. Same failure mode we
// already fixed for products/sales/customers, just for this list.
const cacheKeyForShop = (shopId: string) => `${CACHE_KEY_PREFIX}:${shopId}`;

/**
 * Fetch the list of cashiers (plus owner).
 * When online, fetch from server and cache in localStorage, scoped to the
 * current shop.
 * When offline, return the cache for the current shop only.
 */
export async function getCashierList(): Promise<{ id: string; phone: string }[]> {
  const user = useAuthStore.getState().user;
  const shopId = useAuthStore.getState().shop?.id;

  if (!shopId) {
    return [];
  }

  const cacheKey = cacheKeyForShop(shopId);

  // Online – fetch fresh data and cache it
  if (navigator.onLine) {
    try {
      const res = await api.get('/users/cashiers/');
      const list: { id: string; phone: string }[] = res.data.results || [];

      // Add owner if not already present
      if (user?.id && !list.some(u => u.id === user.id)) {
        list.unshift({ id: user.id, phone: (user.phone || '') + ' (Owner)' });
      }

      // Cache the result (with a timestamp for future invalidation if desired)
      localStorage.setItem(cacheKey, JSON.stringify({
        data: list,
        ts: Date.now(),
      }));

      return list;
    } catch (err) {
      console.error('[getCashierList] Failed to fetch cashiers, trying cache...', err);
      // Fall through to offline path
    }
  }

  // Offline – use cached data for THIS shop only
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data } = JSON.parse(cached);
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {}
  }

  // No cache – return empty array (will show no users, but "All Users" still works)
  return [];
}

/** Remove every shop's cached cashier list. Call this on logout so a later
 * login can never accidentally read a stale entry (defense in depth on top
 * of the per-shop key above). */
export function clearAllCashierListCaches() {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_KEY_PREFIX + ':')) {
      toRemove.push(key);
    }
  }
  toRemove.forEach(key => localStorage.removeItem(key));
}