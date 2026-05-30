// src/pages/Subscription.tsx
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useSubscriptionStore } from '../stores/subscriptionStore';

export default function Subscription() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const location = useLocation();
  const { plans, current, loading, error, fetchPlans, fetchCurrent, startTrial, initializePayment } = useSubscriptionStore();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [activatingTrial, setActivatingTrial] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('activated') === 'true') {
      addToast({ message: 'Your subscription is now active! 🎉', type: 'success', duration: 5000 });
      window.history.replaceState({}, '', '/subscription');
    }
  }, [location.search, addToast]);

  useEffect(() => {
    fetchPlans();
    fetchCurrent();
  }, [fetchPlans, fetchCurrent]);

  if (user?.role === 'CASHIER') {
    return (
      <div className="p-4 text-center">
        <p className="text-red-600">Access denied. Only shop owners can manage subscriptions.</p>
        <Link to="/" className="text-green-600 underline mt-2 inline-block">Go to Dashboard</Link>
      </div>
    );
  }

  const handleStartTrial = async () => {
    setActivatingTrial(true);
    try {
      await startTrial();
      addToast({ message: 'Free trial started! Enjoy all features for 14 days.', type: 'success' });
    } catch (err: any) {
      addToast({ message: err.message || 'Failed to start trial', type: 'error' });
    } finally {
      setActivatingTrial(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    setLoadingPlanId(planId);
    try {
      const url = await initializePayment(planId);
      window.location.href = url;
    } catch (err: any) {
      addToast({ message: err.message || 'Payment initiation failed', type: 'error' });
      setLoadingPlanId(null);
    }
  };

  const getDaysRemaining = (endDateStr: string): number | null => {
    try {
      const end = new Date(endDateStr);
      if (isNaN(end.getTime())) return null;
      const diff = end.getTime() - Date.now();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const isPaidActive = current?.is_active && !current?.is_trial;
  const refreshData = () => {
    fetchPlans();
    fetchCurrent();
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link to="/settings" className="inline-flex items-center text-sm text-gray-600 hover:text-green-600">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Settings
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">Subscription Plans</h1>
      <p className="text-gray-600 mb-6">Choose a plan that fits your business. All plans include every feature with no limits.</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">
          {error} <button onClick={refreshData} className="underline ml-2">Retry</button>
        </div>
      )}

      {current && (
        <div className={`mb-8 p-4 rounded-xl border ${current.is_trial ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <h2 className="font-bold text-lg">
            {current.is_trial ? '🔔 Free Trial Active' : '✅ Current Subscription'}
          </h2>
          <p className="mt-1">
            <strong>Plan:</strong> {current.plan_name}<br />
            <strong>Expires:</strong> {new Date(current.end_date).toLocaleDateString()}
          </p>
          {(() => {
            const daysLeft = getDaysRemaining(current.end_date);
            if (daysLeft !== null && daysLeft > 0) {
              const isLow = daysLeft <= 7;
              return (
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isLow ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
                  </span>
                </div>
              );
            } else if (daysLeft !== null && daysLeft <= 0) {
              return (
                <div className="mt-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Expired
                  </span>
                </div>
              );
            }
            return null;
          })()}
          {current.is_trial && (
            <p className="text-sm mt-2 text-yellow-700">
              Your trial is active. Choose a paid plan below to continue after the trial ends.
            </p>
          )}
          {isPaidActive && (
            <p className="text-sm mt-2 text-green-700">
              Your subscription is active. You can upgrade or change your plan below.
            </p>
          )}
          <button
            onClick={refreshData}
            className="mt-3 text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            Refresh status
          </button>
        </div>
      )}

      {!current && !loading && (
        <div className="mb-8 p-4 border rounded-xl bg-blue-50">
          <h2 className="font-bold">🚀 Try SmartPOS free for 14 days</h2>
          <p className="text-sm mb-3">No credit card required. All features included during trial.</p>
          <button
            onClick={handleStartTrial}
            disabled={activatingTrial}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {activatingTrial ? 'Starting...' : 'Start Free Trial'}
          </button>
        </div>
      )}

      {plans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.id} className="border rounded-2xl p-6 shadow-sm hover:shadow-md transition">
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-black">{plan.price} GHS</span>
                <span className="text-gray-500">
                  {plan.duration_days === 30 ? '/month' :
                   plan.duration_days === 90 ? '/quarter' : '/year'}
                </span>
              </div>
              <div className="text-sm text-gray-600 mb-6">
                <p className="font-medium text-green-700 mb-2">✓ All features included</p>
                <ul className="space-y-1">
                  <li>• Unlimited users</li>
                  <li>• Unlimited products</li>
                  <li>• Credit sales</li>
                  <li>• Bulk product import</li>
                  <li>• Audit logs</li>
                  <li>• Analytics dashboard</li>
                  <li>• 24/7 support</li>
                </ul>
              </div>
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loadingPlanId !== null}
                className="w-full bg-green-600 text-white py-2 rounded-xl hover:bg-green-700 disabled:opacity-50"
              >
                {loadingPlanId === plan.id ? 'Processing...' : 'Subscribe Now'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        !error && <div className="text-center py-8 text-gray-500">Loading plans...</div>
      )}

      <p className="text-center text-gray-400 text-xs mt-8">
        Secure payment via Paystack. Subscriptions auto-renew unless cancelled.
      </p>
    </div>
  );
}