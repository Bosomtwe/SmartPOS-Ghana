import api from './api';

export const fetchOverview = () => api.get('/analytics/overview/');
export const fetchShopPerformance = () => api.get('/analytics/shop-performance/');
export const fetchFeatureUsage = (start?: string, end?: string) =>
  api.get('/analytics/feature-usage/', { params: { start_date: start, end_date: end } });
export const fetchGrowth = () => api.get('/analytics/growth/');
export const fetchHealth = () => api.get('/analytics/health/');
export const fetchUserActivity = (start?: string, end?: string) =>
  api.get('/analytics/user-activity/', { params: { start_date: start, end_date: end } });