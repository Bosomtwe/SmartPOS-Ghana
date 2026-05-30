// src/pages/AdminSubscriptions.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import api from '../services/api';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface Shop {
  id: string;
  name: string;
  owner_phone?: string | null;
}

interface Subscription {
  id: string;
  shop: Shop;
  plan: { id: string; name: string; duration_days: number; price: number } | null;
  plan_name: string;
  start_date: string;
  end_date: string;
  is_trial: boolean;
  is_active: boolean;
  auto_renew: boolean;
}

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
}

export default function AdminSubscriptions() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    plan_id: '',
    days: 30,
    is_trial: false,
  });
  const [targetShopId, setTargetShopId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user?.is_superuser) {
    return <div className="p-4 text-center">Access denied. Superuser only.</div>;
  }

  useEffect(() => {
    fetchSubscriptions();
    fetchPlans();
  }, []);

  useEffect(() => {
    if (showEditModal && formData.plan_id === '' && plans.length > 0) {
      setFormData(prev => ({ ...prev, plan_id: plans[0].id }));
    }
  }, [showEditModal, plans, formData.plan_id]);

  const fetchSubscriptions = async (showRefreshState = false) => {
    if (showRefreshState) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await api.get('/admin/subscriptions/');
      setSubscriptions(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      addToast({ message: 'Failed to load subscriptions', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await api.get('/admin/plans/');
      setPlans(res.data);
      console.log('[DEBUG] Available plans:', res.data.map((p: Plan) => ({ id: p.id, name: p.name })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefresh = () => {
    if (refreshing) return;
    fetchSubscriptions(true);
  };

  const handleEdit = (sub: Subscription) => {
    let planId = sub.plan?.id;
    let planName = sub.plan?.name;

    if (!planId && plans.length > 0) {
      planId = plans[0].id;
      planName = plans[0].name;
      console.warn('[DEBUG] Subscription has no plan, defaulting to first available:', planName);
    }

    setSelectedSub(sub);
    const daysRemaining = Math.ceil(
      (new Date(sub.end_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24)
    );
    const newFormData = {
      plan_id: planId || '',
      days: daysRemaining > 0 ? daysRemaining : 30,
      is_trial: sub.is_trial,
    };
    console.log('[DEBUG] Edit subscription - current plan:', {
      id: planId,
      name: planName,
      formData: newFormData
    });
    setFormData(newFormData);
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!selectedSub) return;
    if (!formData.plan_id) {
      addToast({ message: 'Please select a valid plan', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const newEndDate = new Date();
      newEndDate.setDate(newEndDate.getDate() + formData.days);
      const payload = {
        plan: formData.plan_id,
        end_date: newEndDate.toISOString(),
        is_trial: formData.is_trial,
      };
      await api.patch(`/admin/subscriptions/${selectedSub.id}/`, payload);
      addToast({ message: 'Subscription updated', type: 'success' });
      setShowEditModal(false);
      await fetchSubscriptions(true);
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Update failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = (shopId: string) => {
    if (!plans.length) {
      addToast({ message: 'No active plans available', type: 'error' });
      return;
    }
    setTargetShopId(shopId);
    setFormData({ plan_id: plans[0].id, days: 30, is_trial: false });
    setShowActivateModal(true);
  };

  const submitActivation = async () => {
    if (!targetShopId) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/shops/${targetShopId}/activate/`, formData);
      addToast({ message: 'Subscription activated successfully', type: 'success' });
      setShowActivateModal(false);
      await fetchSubscriptions(true);
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Activation failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-4">
        <Link to="/" className="inline-flex items-center text-sm text-gray-600 hover:text-green-600 transition-colors">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Subscription Management</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button
            onClick={handleRefresh}
            variant="secondary"
            disabled={refreshing}
            className="w-full sm:w-auto inline-flex items-center gap-2"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading && !refreshing ? (
        <div className="text-center py-8">Loading subscriptions...</div>
      ) : (
        <>
          {/* Mobile: Card layout */}
          <div className="md:hidden space-y-3">
            {subscriptions.length === 0 && (
              <div className="text-center py-8 text-gray-400">No subscriptions found.</div>
            )}
            {subscriptions.map((sub) => (
              <div key={sub.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{sub.shop?.name || 'Unknown Shop'}</h3>
                    <p className="text-sm text-gray-500">Owner: {sub.shop?.owner_phone || '—'}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${sub.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {sub.is_active ? 'Active' : 'Expired'}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Plan:</span>
                    <span className="font-medium">{sub.plan?.name || sub.plan_name || 'No Plan'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expires:</span>
                    <span>{sub.end_date ? formatDate(sub.end_date) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Trial:</span>
                    <span>{sub.is_trial ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleEdit(sub)}
                    className="flex-1 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg active:bg-blue-100 touch-manipulation"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleActivate(sub.shop.id)}
                    className="flex-1 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg active:bg-green-100 touch-manipulation"
                  >
                    Activate
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trial</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{sub.shop?.name || 'Unknown Shop'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{sub.shop?.owner_phone || '—'}</td>
                    <td className="px-6 py-4 text-sm">{sub.plan?.name || sub.plan_name || 'No Plan'}</td>
                    <td className="px-6 py-4 text-sm">{sub.end_date ? formatDate(sub.end_date) : '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${sub.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {sub.is_active ? 'Active' : 'Expired'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">{sub.is_trial ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => handleEdit(sub)} className="text-blue-600 hover:underline text-sm touch-manipulation">Edit</button>
                      <button onClick={() => handleActivate(sub.shop.id)} className="text-green-600 hover:underline text-sm touch-manipulation">Activate</button>
                    </td>
                  </tr>
                ))}
                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">No subscriptions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Subscription">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              value={formData.plan_id}
              onChange={(e) => {
                const newPlanId = e.target.value;
                const selectedPlan = plans.find(p => p.id === newPlanId);
                console.log('[DEBUG] Selected plan:', selectedPlan);
                setFormData({ ...formData, plan_id: newPlanId });
              }}
              className="w-full p-2 border rounded-lg"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} – GHS {plan.price}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Extend by (days)</label>
            <input
              type="number"
              min="1"
              value={formData.days}
              onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) || 0 })}
              className="w-full p-2 border rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">New expiry = today + days</p>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_trial}
              onChange={(e) => setFormData({ ...formData, is_trial: e.target.checked })}
            />
            <span className="text-sm">Is trial</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={submitting}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Activate Modal */}
      <Modal isOpen={showActivateModal} onClose={() => setShowActivateModal(false)} title="Activate Subscription">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              value={formData.plan_id}
              onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
              className="w-full p-2 border rounded-lg"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name} – GHS {plan.price}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration (days)</label>
            <input
              type="number"
              min="1"
              value={formData.days}
              onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) || 0 })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_trial}
              onChange={(e) => setFormData({ ...formData, is_trial: e.target.checked })}
            />
            <span className="text-sm">Is trial</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowActivateModal(false)}>Cancel</Button>
            <Button onClick={submitActivation} disabled={submitting}>Activate</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}