// src/pages/Login.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { Button } from '../components/Button';
import { PhoneIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, WifiIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { SmartPOSLogo } from '../components/SmartPOSLogo';

// Local JWT helper – no external file needed
function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp > now;
  } catch {
    return false;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, shop, login } = useAuthStore();
  const { addToast } = useUIStore();
  
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [checkingOfflineSession, setCheckingOfflineSession] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Offline session resume logic
  useEffect(() => {
    const tryOfflineSession = () => {
      // ⛔ Manual logout – skip auto‑login completely
      if (sessionStorage.getItem('manualLogout') === 'true') {
        sessionStorage.removeItem('manualLogout');
        setCheckingOfflineSession(false);
        return;
      }

      if (token && user && shop) {
        const tokenValid = isTokenValid(token);
        if (tokenValid) {
          addToast({
            message: isOnline ? 'Welcome back!' : 'You are offline – resuming your last session',
            type: 'info',
            duration: 4000,
          });
          navigate('/');
          return;
        } else if (!isOnline) {
          addToast({
            message: 'Your session has expired. Please go online to log in again.',
            type: 'warning',
            duration: 6000,
          });
        }
      }
      setCheckingOfflineSession(false);
    };
    tryOfflineSession();
  }, [token, user, shop, isOnline, navigate, addToast]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const payment = params.get('payment');
    const message = params.get('message');

    if (payment === 'success') {
      const successMsg = message || 'Your subscription has been activated! Please log in to continue.';
      setPaymentSuccessMessage(successMsg);
      addToast({ message: successMsg, type: 'success', duration: 5000 });
      setTimeout(() => window.history.replaceState({}, '', '/login'), 5000);
    } else if (payment === 'error') {
      const errorMsg = message || 'Payment failed. Please try again.';
      addToast({ message: errorMsg, type: 'error', duration: 5000 });
      setTimeout(() => window.history.replaceState({}, '', '/login'), 3000);
    }
  }, [location.search, addToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 🔌 Prevent login attempts when offline – no network = no token
    if (!navigator.onLine) {
      setError('No internet connection. Please connect and try again.');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      await login(phone, password);
      navigate(paymentSuccessMessage ? '/subscription?activated=true' : '/');
    } catch (err: any) {
      let message = err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || '';
      if (!message) message = 'Phone number or password is incorrect.';
      if (message.toLowerCase().includes('no active account') || message.toLowerCase().includes('not found')) {
        message = 'Phone number or password is incorrect.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => error && setError('');

  const isExpiredOffline = !isOnline && !!token && !isTokenValid(token);
  const disableForm = loading || isExpiredOffline;

  if (checkingOfflineSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-green/5 via-white to-primary-green/10 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-primary-green mx-auto mb-4" />
          <p className="text-gray-500">Checking your session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-green/5 via-white to-primary-green/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
          <div className="text-center mb-8">
            <SmartPOSLogo className="h-12 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-gray-500 mt-2">Sign in to your shop</p>
          </div>

          {!isOnline && (
            <div className="mb-5 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2">
              <WifiIcon className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <span className="text-sm text-yellow-800">You are offline. If you have a valid session, you'll be redirected automatically.</span>
            </div>
          )}

          {isExpiredOffline && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700 font-medium">Session expired</p>
              <p className="text-xs text-red-600 mt-1">Your login has expired. Please connect to the internet to renew your session.</p>
            </div>
          )}

          {paymentSuccessMessage && (
            <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
              <CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-green-800">
                <p className="font-semibold">Payment Successful!</p>
                <p className="text-sm">{paymentSuccessMessage}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
              <div className="relative">
                <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearError(); }}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                  placeholder="024XXXXXXX"
                  required
                  disabled={isExpiredOffline}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-sm font-medium text-primary-green hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  className="w-full h-12 pl-11 pr-12 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                  required
                  disabled={isExpiredOffline}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm border border-red-200 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" disabled={disableForm}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <p className="text-center text-sm text-gray-600 pt-2">
              Don't have a shop?{' '}
              <Link to="/signup" className="font-semibold text-primary-green hover:underline">Create one now</Link>
            </p>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">SmartPOS Ghana — Trusted by small businesses</p>
      </div>
    </div>
  );
}