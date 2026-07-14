import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/Button';

export default function Logout() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  // authStore.logout() is already reentrant-safe, but guard here too so the
  // effect only ever kicks off one logout per mount (StrictMode double-
  // invokes effects in dev, and this avoids relying solely on the store's
  // internal guard).
  const hasLoggedOutRef = useRef(false);

  useEffect(() => {
    if (!hasLoggedOutRef.current) {
      hasLoggedOutRef.current = true;
      logout();
    }
    const timer = setTimeout(() => navigate('/login'), 3000);
    return () => clearTimeout(timer);
  }, [logout, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-green/5 via-white to-primary-green/10 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 text-center max-w-md w-full">
        <div className="text-6xl mb-4">👋</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          You've been logged out
        </h1>
        <p className="text-gray-600 mb-6">
          Thank you for using SmartPOS Ghana.
        </p>
        <Button onClick={() => navigate('/login')} fullWidth>
          Go to Login
        </Button>
        <p className="text-sm text-gray-400 mt-4">
          Redirecting automatically...
        </p>
      </div>
    </div>
  );
}