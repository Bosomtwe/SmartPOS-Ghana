// src/services/api.ts
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor – block all requests when offline
api.interceptors.request.use(
  (config) => {
    if (!navigator.onLine) {
      return Promise.reject(new Error('Offline – no network connection'));
    }

    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Cache-busting for GETs: a cache keyed only on URL (browser HTTP
    // cache, CDN, or a service worker with a cache-first strategy that
    // ignores Cache-Control) can otherwise serve a response fetched under
    // a different user's session for the exact same URL. This param
    // guarantees the URL itself differs per request.
    if ((config.method || 'get').toLowerCase() === 'get') {
      config.params = { ...(config.params || {}), _: Date.now() };
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // ✅ Guard against missing config
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Skip refresh for auth endpoints
    if (
      originalRequest.url?.includes('/auth/login/') ||
      originalRequest.url?.includes('/auth/refresh/')
    ) {
      return Promise.reject(error);
    }

    // 🔧 UPDATED: Handle 403 Forbidden – only redirect if error is subscription‑related
    if (error.response?.status === 403) {
      const data = error.response.data;

      // Determine if the 403 is explicitly about subscriptions
      const isSubscriptionError =
        (typeof data === 'string' && data.toLowerCase().includes('subscription')) ||
        (data?.detail && typeof data.detail === 'string' && data.detail.toLowerCase().includes('subscription')) ||
        (data?.error && typeof data.error === 'string' && data.error.toLowerCase().includes('subscription'));

      const isOnSubscriptionPage = window.location.pathname.includes('/subscription');

      // Only force‑redirect if it's a subscription issue and we're not already there
      if (isSubscriptionError && !isOnSubscriptionPage && navigator.onLine) {
        window.location.href = '/subscription';
      }

      // In all cases, reject so the calling code can handle it (e.g., show a message)
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If offline, do NOT attempt refresh or logout – just reject
    if (!navigator.onLine) {
      console.warn('[API] Offline – cannot refresh token. Keeping existing session.');
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      isRefreshing = false;
      return Promise.reject(error);
    }

    try {
      const response = await axios.post(`${BASE_URL}/auth/refresh/`, {
        refresh: refreshToken,
      });
      const { access } = response.data;
      useAuthStore.getState().setAccessToken(access);
      originalRequest.headers.Authorization = `Bearer ${access}`;
      processQueue(null, access);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      if (navigator.onLine) {
        useAuthStore.getState().logout();
      } else {
        console.warn('[API] Offline – refresh failed but keeping existing session for offline display.');
      }
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;