// src/stores/subscriptionStore.ts
import { create } from 'zustand';
import { db } from '../lib/dexie';
import api from '../services/api';
import { useAuthStore } from './authStore';

export interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
}

interface CurrentSubscription {
  id: string;
  plan_name: string;
  end_date: string;
  is_active: boolean;
  is_trial: boolean;
}

interface SubscriptionState {
  plans: Plan[];
  current: CurrentSubscription | null;
  loading: boolean;
  error: string | null;
  fetchPlans: () => Promise<void>;
  fetchCurrent: () => Promise<void>;
  startTrial: () => Promise<void>;
  initializePayment: (planId: string) => Promise<string>;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  plans: [],
  current: null,
  loading: false,
  error: null,

  fetchPlans: async () => {
    set({ loading: true, error: null });

    try {
      const cached = await db.subscriptionPlans.toArray();
      if (cached.length) {
        set({ plans: cached, loading: false });
      }
    } catch (e) {
      console.warn('Failed to load cached plans', e);
    }

    if (navigator.onLine) {
      try {
        const res = await api.get('/subscriptions/plans/');
        const fresh = res.data;
        await db.subscriptionPlans.bulkPut(fresh);
        set({ plans: fresh, loading: false });
      } catch (err: any) {
        console.error('Failed to fetch plans', err);
        set({ error: err.message, loading: false });
      }
    } else if (get().plans.length === 0) {
      set({ loading: false, error: 'Offline – no cached plans available' });
    }
  },

  fetchCurrent: async () => {
    set({ loading: true, error: null });

    // 1. Load cached
    try {
      const cached = await db.currentSubscription.toArray();
      if (cached.length) {
        set({ current: cached[0], loading: false });
      }
    } catch (e) {
      console.warn('Failed to load cached subscription', e);
    }

    // 2. Fetch fresh if online
    if (navigator.onLine) {
      try {
        const res = await api.get('/subscriptions/current/');
        let fresh = res.data;

        // ✅ Guard: if fresh is null, undefined, empty string, or empty array -> treat as no subscription
        if (
          fresh === null ||
          fresh === undefined ||
          (typeof fresh === 'string' && fresh.trim() === '') ||
          (Array.isArray(fresh) && fresh.length === 0)
        ) {
          // Clear the cache and set current to null
          await db.currentSubscription.clear();
          set({ current: null, loading: false });
          return;
        }

        // ✅ Ensure fresh is an object (and not an array)
        if (typeof fresh !== 'object' || Array.isArray(fresh)) {
          console.warn('Invalid subscription data received, clearing cache');
          await db.currentSubscription.clear();
          set({ current: null, loading: false });
          return;
        }

        // ✅ Ensure the object has an id (use shop.id if missing)
        if (!fresh.id) {
          const shop = useAuthStore.getState().shop;
          fresh.id = shop?.id || crypto.randomUUID();
        }

        await db.currentSubscription.put(fresh);
        set({ current: fresh, loading: false });
      } catch (err: any) {
        console.error('Failed to fetch current subscription', err);
        set({ error: err.message, loading: false });
      }
    } else if (!get().current) {
      set({ loading: false, error: 'Offline – no cached subscription data' });
    }
  },

  startTrial: async () => {
    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem('offline_subscription_queue') || '[]');
      queue.push({ type: 'START_TRIAL', timestamp: Date.now() });
      localStorage.setItem('offline_subscription_queue', JSON.stringify(queue));
      set({ error: 'You are offline. Trial activation will happen when you reconnect.' });
      return;
    }
    try {
      await api.post('/subscriptions/trial/');
      await get().fetchCurrent();
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to start trial' });
      throw err;
    }
  },

  initializePayment: async (planId: string) => {
    if (!navigator.onLine) {
      set({ error: 'You are offline. Please connect to the internet to subscribe.' });
      throw new Error('Offline');
    }
    const res = await api.post('/subscriptions/initialize/', { plan_id: planId });
    return res.data.authorization_url;
  },
}));