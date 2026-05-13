import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/Button';
import {
  BuildingStorefrontIcon,
  PhoneIcon,
  LockClosedIcon,
  MapPinIcon,
  EnvelopeIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { SmartPOSLogo } from '../components/SmartPOSLogo';

export default function Signup() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [form, setForm] = useState({
    shop_name: '',
    phone: '',
    email: '',
    password: '',
    confirm_password: '',
    address: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Simple password strength estimation (0–4)
  const getPasswordStrength = (password: string): number => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const strength = getPasswordStrength(form.password);
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'];

  const extractErrorMessage = (errorData: any): string => {
    if (!errorData) return 'Registration failed. Please try again.';
    if (typeof errorData === 'string') return errorData;

    const messages: string[] = [];
    Object.values(errorData).forEach((value) => {
      if (Array.isArray(value)) {
        messages.push(...value);
      } else if (typeof value === 'string') {
        messages.push(value);
      } else if (typeof value === 'object') {
        messages.push(JSON.stringify(value));
      }
    });
    return messages.length > 0 ? messages.join(' ') : 'Registration failed. Please try again.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (form.password !== form.confirm_password) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/register/', {
        shop_name: form.shop_name,
        phone: form.phone,
        email: form.email.trim() || undefined,
        password: form.password,
        address: form.address,
      });
      const { access, refresh, user, shop } = response.data;
      setAuth(access, refresh, user, shop);
      navigate('/');
    } catch (err: any) {
      const errorData = err.response?.data;
      const message = extractErrorMessage(errorData);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-green/5 via-white to-primary-green/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
          <div className="text-center mb-6">
            <SmartPOSLogo className="h-10 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 font-display">
              Start your shop
            </h1>
            <p className="text-gray-500 mt-2">Free forever during beta</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Shop name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Shop Name *
              </label>
              <div className="relative">
                <BuildingStorefrontIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="shop_name"
                  value={form.shop_name}
                  onChange={handleChange}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                  required
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Your Phone Number *
              </label>
              <div className="relative">
                <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                  placeholder="024XXXXXXX"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password *
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  className="w-full h-12 pl-11 pr-12 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
              {/* Password strength bar */}
              {form.password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full ${
                          level <= strength ? strengthColors[strength - 1] : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {strength > 0 ? strengthLabels[strength - 1] : 'Too short'}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password *
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirm_password"
                  value={form.confirm_password}
                  onChange={handleChange}
                  className="w-full h-12 pl-11 pr-12 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
              {/* match indicator */}
              {form.confirm_password.length > 0 && (
                <p className={`text-xs mt-1 ${form.password === form.confirm_password ? 'text-green-600' : 'text-red-500'}`}>
                  {form.password === form.confirm_password ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>

            {/* Email (optional) – moved after passwords */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email <span className="text-gray-400 font-normal">(optional, for password recovery)</span>
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Shop Address (optional)
              </label>
              <div className="relative">
                <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 focus:border-primary-green focus:ring-4 focus:ring-primary-green/10"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100">
                {error}
              </div>
            )}

            <Button type="submit" fullWidth size="lg" disabled={loading}>
              {loading ? 'Creating your shop...' : 'Create Shop & Start Selling'}
            </Button>

            <p className="text-center text-sm text-gray-600 pt-2">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-primary-green hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}