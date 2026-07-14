// src/lib/subscriptionSync.ts
import api from '../services/api';
import { useSubscriptionStore } from '../stores/subscriptionStore';

export async function processOfflineSubscriptionQueue() {
  if (!navigator.onLine) return;

  const queue = JSON.parse(localStorage.getItem('offline_subscription_queue') || '[]');
  if (queue.length === 0) return;

  // Only actions that actually succeed get removed from the queue. The
  // previous version wrote `'[]'` back to localStorage unconditionally
  // after the loop — even actions that hit the `catch` block and were
  // meant to be "kept for next retry" were wiped anyway, so a single
  // transient failure permanently lost that queued action (e.g. a trial
  // activation the shop owner triggered while offline would just vanish).
  const remaining: any[] = [];

  for (const action of queue) {
    try {
      if (action.type === 'START_TRIAL') {
        await api.post('/subscriptions/trial/');
        await useSubscriptionStore.getState().fetchCurrent();
      }
      // Action succeeded (or was an unrecognized type we choose to drop
      // rather than retry forever) — don't add it to `remaining`.
    } catch (err) {
      console.error('Failed to sync offline subscription action', action, err);
      // Keep it queued for the next retry.
      remaining.push(action);
    }
  }

  localStorage.setItem('offline_subscription_queue', JSON.stringify(remaining));
}