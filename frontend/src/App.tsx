// src/App.tsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSyncStore } from './stores/syncStore';
import { useSubscriptionStore } from './stores/subscriptionStore';
import { useProductMutationStore } from './stores/productMutationStore';
import { useProductStore } from './stores/productStore';
import { useSalesStore } from './stores/saleStore';
import { useCustomerStore } from './stores/customerStore';
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
        <div className="lg:p-6">
          {children}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const { token, user } = useAuthStore();
  const refreshPendingCount = useSyncStore((state) => state.refreshPendingCount);
  const { fetchCurrent, fetchPlans } = useSubscriptionStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (token && user && !user.is_superuser && user.role === 'OWNER') {
      if (navigator.onLine) {
        fetchCurrent().catch(console.warn);
        fetchPlans().catch(console.warn);
      }
    }
  }, [token, user, fetchCurrent, fetchPlans]);

  useEffect(() => {
    const handleOnline = () => {
      processOfflineSubscriptionQueue();
      useProductMutationStore.getState().syncMutations();
    };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) {
      handleOnline();
    }
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Load core data when logged in – now depends on user?.id
  useEffect(() => {
    const loadData = async () => {
      if (token && user) {
        try {
          await Promise.all([
            useProductStore.getState().fetchProducts(),
            useSalesStore.getState().fetchSales(),
            useCustomerStore.getState().fetchCustomers(),
          ]);
        } catch (err) {
          console.warn('Failed to load initial data:', err);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    loadData();
  }, [token, user?.id]); // ✅ depend on user.id to trigger refresh on role change

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your data...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:uidb64/:token" element={<ResetPassword />} />
          <Route path="/logout" element={<LogoutPage />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                {/* ✅ Force Dashboard remount when user changes */}
                <AppLayout key={user?.id || 'no-user'}>
                  <Dashboard />
                </AppLayout>
              </PrivateRoute>
            }
          />
          <Route path="/pos" element={<PrivateRoute><AppLayout><Pos /></AppLayout></PrivateRoute>} />
          <Route path="/inventory" element={<PrivateRoute><AppLayout><Inventory /></AppLayout></PrivateRoute>} />
          <Route path="/customers" element={<PrivateRoute><AppLayout><Customers /></AppLayout></PrivateRoute>} />
          <Route path="/sales" element={<PrivateRoute><AppLayout><SalesHistory /></AppLayout></PrivateRoute>} />
          <Route path="/reports" element={<PrivateRoute><AppLayout><Reports /></AppLayout></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><AppLayout><Settings /></AppLayout></PrivateRoute>} />
          <Route path="/analytics" element={<PrivateRoute><AppLayout><AnalyticsPage /></AppLayout></PrivateRoute>} />

          <Route
            path="/subscription"
            element={
              <PrivateRoute>
                {user?.role === 'OWNER' ? <Subscription /> : <Navigate to="/" replace />}
              </PrivateRoute>
            }
          />

          <Route
            path="/admin/subscriptions"
            element={
              <PrivateRoute>
                {user?.is_superuser ? <AdminSubscriptions /> : <Navigate to="/" replace />}
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}