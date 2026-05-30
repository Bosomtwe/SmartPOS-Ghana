// src/lib/subscriptionSync.ts
import api from '../services/api';
import { useSubscriptionStore } from '../stores/subscriptionStore';

export async function processOfflineSubscriptionQueue() {
  if (!navigator.onLine) return;

  const queue = JSON.parse(localStorage.getItem('offline_subscription_queue') || '[]');
  if (queue.length === 0) return;

  for (const action of queue) {
    try {
      if (action.type === 'START_TRIAL') {
        await api.post('/subscriptions/trial/');
        await useSubscriptionStore.getState().fetchCurrent();
      }
    } catch (err) {
      console.error('Failed to sync offline subscription action', action, err);
      // Keep in queue for next retry
      continue;
    }
  }
  // Clear processed actions
  localStorage.setItem('offline_subscription_queue', '[]');
}