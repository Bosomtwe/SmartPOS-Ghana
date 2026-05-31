// src/pages/AdminSubscriptions.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import api from '../services/api';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ArrowPathIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

interface Shop {
  id: string;
  name: string;
  owner_phone?: string | null;
  is_active: boolean;
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
  max_users: number;
  max_products: number;
  allow_credit_sales: boolean;
  allow_bulk_import: boolean;
  allow_audit_logs: boolean;
  allow_analytics: boolean;
  is_active: boolean;
  is_trial_plan: boolean;
}

type Tab = 'subscriptions' | 'plans' | 'shops';

export default function AdminSubscriptions() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<Tab>('subscriptions');

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ plan_id: '', days: 30, is_trial: false });
  const [targetShopId, setTargetShopId] = useState<string | null>(null);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Plan management state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<Partial<Plan>>({
    name: '',
    duration_days: 30,
    price: 0,
    max_users: 9999,
    max_products: 999999,
    allow_credit_sales: true,
    allow_bulk_import: true,
    allow_audit_logs: true,
    allow_analytics: true,
    is_active: true,
    is_trial_plan: false,
  });
  const [planLoading, setPlanLoading] = useState(false);

  if (!user?.is_superuser) return <div className="p-4 text-center">Access denied. Superuser only.</div>;

  const fetchSubscriptions = async (showRefreshState = false) => {
    if (showRefreshState) setRefreshing(true);
    else setLoading(true);
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
    } catch (err) {
      addToast({ message: 'Failed to load plans', type: 'error' });
    }
  };

  const fetchShops = async () => {
    try {
      const res = await api.get('/admin/shops/');
      setShops(res.data);
    } catch (err) {
      addToast({ message: 'Failed to load shops', type: 'error' });
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    fetchPlans();
    fetchShops();
  }, []);

  const handleRefresh = () => {
    if (refreshing) return;
    fetchSubscriptions(true);
    fetchPlans();
    fetchShops();
  };

  const handleEdit = (sub: Subscription) => {
    setSelectedSub(sub);
    const daysRemaining = Math.ceil((new Date(sub.end_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    setFormData({
      plan_id: sub.plan?.id || '',
      days: daysRemaining > 0 ? daysRemaining : 30,
      is_trial: sub.is_trial,
    });
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
      await api.patch(`/admin/subscriptions/${selectedSub.id}/`, {
        plan: formData.plan_id,
        end_date: newEndDate.toISOString(),
        is_trial: formData.is_trial,
      });
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

  const handleCreatePlan = () => {
    setEditingPlan(null);
    setPlanForm({
      name: '',
      duration_days: 30,
      price: 0,
      max_users: 9999,
      max_products: 999999,
      allow_credit_sales: true,
      allow_bulk_import: true,
      allow_audit_logs: true,
      allow_analytics: true,
      is_active: true,
      is_trial_plan: false,
    });
    setShowPlanModal(true);
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setPlanForm(plan);
    setShowPlanModal(true);
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Delete this plan? This may affect existing subscriptions.')) return;
    try {
      await api.delete(`/admin/plans/${planId}/`);
      addToast({ message: 'Plan deleted', type: 'success' });
      fetchPlans();
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Delete failed', type: 'error' });
    }
  };

  const savePlan = async () => {
    if (!planForm.name) {
      addToast({ message: 'Plan name is required', type: 'error' });
      return;
    }
    setPlanLoading(true);
    try {
      if (editingPlan) {
        await api.patch(`/admin/plans/${editingPlan.id}/`, planForm);
        addToast({ message: 'Plan updated', type: 'success' });
      } else {
        await api.post('/admin/plans/create/', planForm);
        addToast({ message: 'Plan created', type: 'success' });
      }
      setShowPlanModal(false);
      fetchPlans();
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Save failed', type: 'error' });
    } finally {
      setPlanLoading(false);
    }
  };

  // ✅ FIXED: Optimistic update + response sync, no extra GET to revert
  const toggleShopActive = async (shopId: string, currentActive: boolean) => {
    try {
      // Immediate optimistic update
      setShops(prev =>
        prev.map(shop =>
          shop.id === shopId ? { ...shop, is_active: !currentActive } : shop
        )
      );

      // Send PATCH request
      const response = await api.patch(`/admin/shops/${shopId}/`, { is_active: !currentActive });
      const { is_active: newStatus } = response.data;

      // Ensure local state matches server response
      setShops(prev =>
        prev.map(shop =>
          shop.id === shopId ? { ...shop, is_active: newStatus } : shop
        )
      );

      addToast({ message: `Shop ${newStatus ? 'activated' : 'deactivated'} successfully`, type: 'success' });

      // Refresh subscriptions list (but not shops list to avoid overwrite)
      await fetchSubscriptions();
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Update failed', type: 'error' });
      // Revert optimistic update by re-fetching shops only on error
      await fetchShops();
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-4">
        <Link to="/" className="inline-flex items-center text-sm text-gray-600 hover:text-green-600">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Subscription Management</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">Updated: {lastUpdated.toLocaleTimeString()}</span>
          )}
          <Button onClick={handleRefresh} variant="secondary" disabled={refreshing} className="inline-flex items-center gap-2">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`pb-2 px-1 text-sm font-medium ${
              activeTab === 'subscriptions'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Shop Subscriptions
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className={`pb-2 px-1 text-sm font-medium ${
              activeTab === 'plans'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Manage Plans
          </button>
          <button
            onClick={() => { setActiveTab('shops'); fetchShops(); }}
            className={`pb-2 px-1 text-sm font-medium ${
              activeTab === 'shops'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Manage Shops
          </button>
        </nav>
      </div>

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <>
          {loading && !refreshing ? (
            <div className="text-center py-8">Loading subscriptions...</div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-xl shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium">{sub.shop?.name || 'Unknown'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{sub.shop?.owner_phone || '—'}</td>
                      <td className="px-6 py-4 text-sm">{sub.plan?.name || sub.plan_name}</td>
                      <td className="px-6 py-4 text-sm">{sub.end_date ? formatDate(sub.end_date) : '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${sub.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {sub.is_active ? 'Active' : 'Expired'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => handleEdit(sub)} className="text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => handleActivate(sub.shop.id)} className="text-green-600 hover:underline">Activate</button>
                      </td>
                    </tr>
                  ))}
                  {subscriptions.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No subscriptions found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={handleCreatePlan} className="inline-flex items-center gap-1">
              <PlusIcon className="h-4 w-4" /> Add Plan
            </Button>
          </div>
          <div className="overflow-x-auto bg-white rounded-xl shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price (GHS)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trial?</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{plan.name}</td>
                    <td className="px-6 py-4 text-sm">{plan.duration_days} days</td>
                    <td className="px-6 py-4 text-sm">{plan.price}</td>
                    <td className="px-6 py-4 text-sm">{plan.is_trial_plan ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4 text-sm">{plan.is_active ? '✅' : '❌'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => handleEditPlan(plan)} className="text-blue-600 hover:underline">
                        <PencilIcon className="h-4 w-4 inline" /> Edit
                      </button>
                      <button onClick={() => handleDeletePlan(plan.id)} className="text-red-600 hover:underline ml-3">
                        <TrashIcon className="h-4 w-4 inline" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No plans created yet. Click "Add Plan".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shops Tab */}
      {activeTab === 'shops' && (
        <div className="overflow-x-auto bg-white rounded-xl shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {shops.map((shop) => (
                <tr key={shop.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium">{shop.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{shop.owner_phone || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${shop.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {shop.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => toggleShopActive(shop.id, shop.is_active)}
                      className={`px-3 py-1 text-sm rounded ${
                        shop.is_active
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {shop.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No shops found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Subscription">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              value={formData.plan_id}
              onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
              className="w-full p-2 border rounded-lg"
            >
              {plans.filter(p => !p.is_trial_plan).map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name} – GHS {plan.price}</option>
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

      <Modal isOpen={showActivateModal} onClose={() => setShowActivateModal(false)} title="Activate Subscription">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              value={formData.plan_id}
              onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
              className="w-full p-2 border rounded-lg"
            >
              {plans.filter(p => !p.is_trial_plan).map((plan) => (
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

      <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title={editingPlan ? 'Edit Plan' : 'Create Plan'}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1">Plan Name *</label>
            <input
              type="text"
              value={planForm.name || ''}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration (days)</label>
            <input
              type="number"
              value={planForm.duration_days || 30}
              onChange={(e) => setPlanForm({ ...planForm, duration_days: parseInt(e.target.value) })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price (GHS)</label>
            <input
              type="number"
              step="0.01"
              value={planForm.price || 0}
              onChange={(e) => setPlanForm({ ...planForm, price: parseFloat(e.target.value) })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Users</label>
            <input
              type="number"
              value={planForm.max_users || 0}
              onChange={(e) => setPlanForm({ ...planForm, max_users: parseInt(e.target.value) })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Products</label>
            <input
              type="number"
              value={planForm.max_products || 0}
              onChange={(e) => setPlanForm({ ...planForm, max_products: parseInt(e.target.value) })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={planForm.allow_credit_sales || false}
                onChange={(e) => setPlanForm({ ...planForm, allow_credit_sales: e.target.checked })}
              />
              <span>Allow Credit Sales</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={planForm.allow_bulk_import || false}
                onChange={(e) => setPlanForm({ ...planForm, allow_bulk_import: e.target.checked })}
              />
              <span>Allow Bulk Import</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={planForm.allow_audit_logs || false}
                onChange={(e) => setPlanForm({ ...planForm, allow_audit_logs: e.target.checked })}
              />
              <span>Allow Audit Logs</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={planForm.allow_analytics || false}
                onChange={(e) => setPlanForm({ ...planForm, allow_analytics: e.target.checked })}
              />
              <span>Allow Analytics</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={planForm.is_active || false}
                onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })}
              />
              <span>Active (visible to shops)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={planForm.is_trial_plan || false}
                onChange={(e) => setPlanForm({ ...planForm, is_trial_plan: e.target.checked })}
              />
              <span>Trial Plan (special)</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowPlanModal(false)}>Cancel</Button>
            <Button onClick={savePlan} disabled={planLoading}>{planLoading ? 'Saving...' : 'Save Plan'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}