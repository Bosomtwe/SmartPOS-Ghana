// src/App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSyncStore } from './stores/syncStore';
import { useSubscriptionStore } from './stores/subscriptionStore';
import { useProductMutationStore } from './stores/productMutationStore';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';
import ForgotPassword from './pages/ForgotPassword';
import LogoutPage from './pages/Logout';
import Pos from './pages/Pos';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import SalesHistory from './pages/SalesHistory';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import AdminSubscriptions from './pages/AdminSubscriptions';
import { BottomNav } from './components/BottomNav';
import { Sidebar } from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import AnalyticsPage from './pages/AnalyticsPage';
import { processOfflineSubscriptionQueue } from './lib/subscriptionSync';

function PrivateRoute({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((state) => state.token);
  return token ? children : <Navigate to="/login" replace />;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="lg:ml-64 pb-16 lg:pb-0">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const refreshPendingCount = useSyncStore((state) => state.refreshPendingCount);
  const { token, user } = useAuthStore();
  const { fetchCurrent, fetchPlans } = useSubscriptionStore();

  // Refresh pending sales count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Background subscription caching for offline use
  useEffect(() => {
    if (token && user && !user.is_superuser && user.role === 'OWNER') {
      if (navigator.onLine) {
        fetchCurrent().catch(console.warn);
        fetchPlans().catch(console.warn);
      }
    }
  }, [token, user, fetchCurrent, fetchPlans]);

  // Process queued subscription actions when coming online
  useEffect(() => {
    const handleOnline = () => {
      processOfflineSubscriptionQueue();
    };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) {
      processOfflineSubscriptionQueue();
    }
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Auto‑sync product mutations when online
  useEffect(() => {
    const handleOnline = () => {
      useProductMutationStore.getState().syncMutations();
    };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) {
      handleOnline();
    }
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:uidb64/:token" element={<ResetPassword />} />
          <Route path="/logout" element={<LogoutPage />} />

          {/* Protected routes */}
          <Route path="/" element={<PrivateRoute><AppLayout><Dashboard /></AppLayout></PrivateRoute>} />
          <Route path="/pos" element={<PrivateRoute><AppLayout><Pos /></AppLayout></PrivateRoute>} />
          <Route path="/inventory" element={<PrivateRoute><AppLayout><Inventory /></AppLayout></PrivateRoute>} />
          <Route path="/customers" element={<PrivateRoute><AppLayout><Customers /></AppLayout></PrivateRoute>} />
          <Route path="/sales" element={<PrivateRoute><AppLayout><SalesHistory /></AppLayout></PrivateRoute>} />
          <Route path="/reports" element={<PrivateRoute><AppLayout><Reports /></AppLayout></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><AppLayout><Settings /></AppLayout></PrivateRoute>} />
          <Route path="/analytics" element={<PrivateRoute><AppLayout><AnalyticsPage /></AppLayout></PrivateRoute>} />

          {/* ✅ Subscription route – only owners can access; cashiers redirected to dashboard */}
          <Route
            path="/subscription"
            element={
              <PrivateRoute>
                {user?.role === 'OWNER' ? (
                  <Subscription />
                ) : (
                  <Navigate to="/" replace />
                )}
              </PrivateRoute>
            }
          />

          {/* ✅ Admin subscriptions – only superusers can access */}
          <Route
            path="/admin/subscriptions"
            element={
              <PrivateRoute>
                {user?.is_superuser ? (
                  <AdminSubscriptions />
                ) : (
                  <Navigate to="/" replace />
                )}
              </PrivateRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}