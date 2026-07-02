// src/services/offlineUsers.ts
import api from './api';
import { useAuthStore } from '../stores/authStore';

const CACHE_KEY = 'cashierListCache';

/**
 * Fetch the list of cashiers (plus owner).
 * When online, fetch from server and cache in localStorage.
 * When offline, return cached data.
 */
export async function getCashierList(): Promise<{ id: string; phone: string }[]> {
  const user = useAuthStore.getState().user;

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
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: list,
        ts: Date.now(),
      }));

      return list;
    } catch (err) {
      console.error('[getCashierList] Failed to fetch cashiers, trying cache...', err);
      // Fall through to offline path
    }
  }

  // Offline – use cached data
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { data } = JSON.parse(cached);
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {}
  }

  // No cache – return empty array (will show no users, but “All Users” still works)
  return [];
}