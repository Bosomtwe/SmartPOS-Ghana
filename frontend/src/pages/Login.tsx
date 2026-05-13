// src/pages/Login.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/Button';
import { PhoneIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { SmartPOSLogo } from '../components/SmartPOSLogo';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(phone, password);
      navigate('/');
    } catch (err: any) {
      let message =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        '';

      // Fallback if none of the above worked
      if (!message) {
        message = 'Phone number or password is incorrect.';
      }

      // Override any generic "No active account" message
      if (
        message.toLowerCase().includes('no active account') ||
        message.toLowerCase().includes('not found')
      ) {
        message = 'Phone number or password is incorrect.';
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Clear the error as soon as the user starts typing
  const clearError = () => {
    if (error) setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-green/5 via-white to-primary-green/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
          <div className="text-center mb-8">
            <SmartPOSLogo className="h-12 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 font-display">
              Welcome back
            </h1>
            <p className="text-gray-500 mt-2">Sign in to your shop</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Phone field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearError(); }}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10 transition-shadow"
                  placeholder="024XXXXXXX"
                  required
                />
              </div>
            </div>

            {/* Password field with toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary-green hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  className="w-full h-12 pl-11 pr-12 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10 transition-shadow"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message – always same height to avoid layout shift */}
            <div className="min-h-[52px]">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm border border-red-200 flex items-center gap-2 animate-fade-in">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </div>

            <Button type="submit" fullWidth size="lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <p className="text-center text-sm text-gray-600 pt-2">
              Don't have a shop?{' '}
              <Link
                to="/signup"
                className="font-semibold text-primary-green hover:underline"
              >
                Create one now
              </Link>
            </p>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">
          SmartPOS Ghana — Trusted by small businesses
        </p>
      </div>
    </div>
  );
}