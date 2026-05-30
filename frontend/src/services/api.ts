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

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh for auth endpoints
    if (
      originalRequest.url?.includes('/auth/login/') ||
      originalRequest.url?.includes('/auth/refresh/')
    ) {
      return Promise.reject(error);
    }

    // Handle 403 Forbidden – only redirect when online
    if (error.response?.status === 403) {
      const isOnSubscriptionPage = window.location.pathname.includes('/subscription');
      const isSubscriptionApi = originalRequest.url?.includes('/subscriptions/');
      if (!isOnSubscriptionPage && !isSubscriptionApi && navigator.onLine) {
        window.location.href = '/subscription';
      }
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
      // Only logout if online; offline we keep the session for offline detection
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