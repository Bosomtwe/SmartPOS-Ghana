// src/pages/AdminSubscriptions.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import api from '../services/api';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  ArrowPathIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  KeyIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';

interface Shop {
  id: string;
  name: string;
  owner_phone?: string | null;
  owner_id?: string | null;
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

  // Edit subscription modal – using days instead of date picker
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState({ plan_id: '', days: 30, is_trial: false });
  const [submitting, setSubmitting] = useState(false);

  // Activate shop modal – using days instead of date picker
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [targetShopId, setTargetShopId] = useState<string | null>(null);
  const [activationForm, setActivationForm] = useState({ plan_id: '', days: 30, is_trial: false });

  // Plan management
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<Partial<Plan>>({});
  const [planLoading, setPlanLoading] = useState(false);

  // Plan deletion confirmation
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState(false);

  // Shop status toggle confirm
  const [shopToggle, setShopToggle] = useState<{ id: string; newActive: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);

  // Password reset states
  const [resetData, setResetData] = useState<{ phone: string; newPassword: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  if (!user?.is_superuser) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-600">Access denied. Superuser only.</p>
        <Link to="/" className="inline-block mt-4 text-green-600 underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const fetchSubscriptions = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get('/admin/subscriptions/');
      setSubscriptions(res.data);
      setLastUpdated(new Date());
    } catch {
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
    } catch {
      addToast({ message: 'Failed to load plans', type: 'error' });
    }
  };

  const fetchShops = async () => {
    try {
      const res = await api.get('/admin/shops/');
      setShops(res.data);
    } catch {
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

  // --- Edit Subscription (using days) ---
  const handleEdit = (sub: Subscription) => {
    setSelectedSub(sub);
    // Calculate remaining days (or default 30 if expired)
    const remainingDays = Math.max(
      0,
      Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / (1000 * 3600 * 24))
    );
    setEditForm({
      plan_id: sub.plan?.id || '',
      days: remainingDays > 0 ? remainingDays : 30,
      is_trial: sub.is_trial,
    });
    setShowEditModal(true);
  };

  const handleUpdateSubscription = async () => {
    if (!selectedSub || !editForm.plan_id || editForm.days <= 0) {
      addToast({ message: 'Plan and a positive number of days are required', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const newEndDate = new Date();
      newEndDate.setDate(newEndDate.getDate() + editForm.days);
      await api.patch(`/admin/subscriptions/${selectedSub.id}/`, {
        plan: editForm.plan_id,
        end_date: newEndDate.toISOString(),
        is_trial: editForm.is_trial,
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

  // --- Activate Shop Subscription (using days) ---
  const handleActivate = (shopId: string) => {
    if (!plans.length) {
      addToast({ message: 'No active plans available', type: 'error' });
      return;
    }
    setTargetShopId(shopId);
    setActivationForm({
      plan_id: plans[0]?.id || '',
      days: 30,
      is_trial: false,
    });
    setShowActivateModal(true);
  };

  const submitActivation = async () => {
    if (!targetShopId || !activationForm.plan_id || activationForm.days <= 0) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/shops/${targetShopId}/activate/`, {
        plan_id: activationForm.plan_id,
        days: activationForm.days,
        is_trial: activationForm.is_trial,
      });
      addToast({ message: 'Subscription activated', type: 'success' });
      setShowActivateModal(false);
      await fetchSubscriptions(true);
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Activation failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Shop active toggle (with confirmation) ---
  const handleToggleShopActive = (shopId: string, currentActive: boolean) => {
    setShopToggle({ id: shopId, newActive: !currentActive });
  };

  const confirmToggleShop = async () => {
    if (!shopToggle) return;
    setToggling(true);
    try {
      const response = await api.patch(`/admin/shops/${shopToggle.id}/`, {
        is_active: shopToggle.newActive,
      });
      const updatedShop = response.data;
      setShops((prev) =>
        prev.map((s) => (s.id === updatedShop.id ? { ...s, is_active: updatedShop.is_active } : s))
      );
      addToast({ message: `Shop ${updatedShop.is_active ? 'activated' : 'deactivated'}`, type: 'success' });
      await fetchSubscriptions();
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Update failed', type: 'error' });
    } finally {
      setToggling(false);
      setShopToggle(null);
    }
  };

  // --- Plan management ---
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
      is_trial_plan: true, // Now default to checked (true)
    });
    setShowPlanModal(true);
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setPlanForm({ ...plan }); // copy to avoid mutation
    setShowPlanModal(true);
  };

  // Open confirmation modal before deleting a plan
  const confirmDeletePlan = (planId: string) => {
    setPlanToDelete(planId);
  };

  const executeDeletePlan = async () => {
    if (!planToDelete) return;
    setDeletingPlan(true);
    try {
      await api.delete(`/admin/plans/${planToDelete}/`);
      addToast({ message: 'Plan deleted successfully', type: 'success' });
      fetchPlans();
    } catch (err: any) {
      addToast({ message: err.response?.data?.detail || 'Delete failed', type: 'error' });
    } finally {
      setDeletingPlan(false);
      setPlanToDelete(null);
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

  // --- Password Reset (random password) ---
  const handleResetPassword = async (userId: string, phone: string) => {
    try {
      const res = await api.post(`/admin/reset-password/${userId}/`);
      setResetData({ phone, newPassword: res.data.new_password });
      setShowResetModal(true);
    } catch (err: any) {
      addToast({ message: err.response?.data?.error || 'Reset failed', type: 'error' });
    }
  };

  const copyPassword = () => {
    if (resetData) {
      navigator.clipboard.writeText(resetData.newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // --- Send Reset Link ---
  const handleSendResetLink = async (userId: string) => {
    try {
      const res = await api.post(`/admin/send-reset-link/${userId}/`);
      setResetLink(res.data.reset_url);
      setShowLinkModal(true);
    } catch (err: any) {
      addToast({ message: err.response?.data?.error || 'Failed to send reset link', type: 'error' });
    }
  };

  const copyLink = () => {
    if (resetLink) {
      navigator.clipboard.writeText(resetLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto">
      {/* Back button */}
      <div className="mb-4">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-gray-600 hover:text-green-600 min-h-11"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Subscription Management</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-gray-400">Updated: {lastUpdated.toLocaleTimeString()}</span>}
          <Button onClick={handleRefresh} variant="secondary" disabled={refreshing} className="min-h-11">
            <ArrowPathIcon className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs - scrollable on mobile */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-4 min-w-max">
          {['subscriptions', 'plans', 'shops'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as Tab)}
              className={`pb-2 px-2 text-sm font-medium min-h-11 transition ${
                activeTab === tab
                  ? 'border-b-2 border-green-600 text-green-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'subscriptions' && 'Shop Subscriptions'}
              {tab === 'plans' && 'Manage Plans'}
              {tab === 'shops' && 'Manage Shops'}
            </button>
          ))}
        </nav>
      </div>

      {/* ========== SUBSCRIPTIONS TAB ========== */}
      {activeTab === 'subscriptions' && (
        <>
          {loading && !refreshing ? (
            <div className="text-center py-8">Loading subscriptions...</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-4">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="bg-white rounded-xl shadow p-4 border">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{sub.shop?.name || 'Unknown'}</h3>
                        <p className="text-xs text-gray-500">Owner: {sub.shop?.owner_phone || '—'}</p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          sub.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {sub.is_active ? 'Active' : 'Expired'}
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      <p>
                        <span className="text-gray-500">Plan:</span> {sub.plan?.name || sub.plan_name}
                      </p>
                      <p>
                        <span className="text-gray-500">Expires:</span> {formatDate(sub.end_date)}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleEdit(sub)}
                        className="flex-1 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg active:bg-blue-100 min-h-11"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleActivate(sub.shop.id)}
                        className="flex-1 py-2 text-sm bg-green-50 text-green-600 rounded-lg active:bg-green-100 min-h-11"
                      >
                        Activate
                      </button>
                    </div>
                  </div>
                ))}
                {subscriptions.length === 0 && <div className="text-center py-8 text-gray-400">No subscriptions found.</div>}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow">
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
                  <tbody>
                    {subscriptions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium">{sub.shop?.name}</td>
                        <td className="px-6 py-4 text-sm">{sub.shop?.owner_phone || '—'}</td>
                        <td className="px-6 py-4 text-sm">{sub.plan?.name || sub.plan_name}</td>
                        <td className="px-6 py-4 text-sm">{formatDate(sub.end_date)}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              sub.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {sub.is_active ? 'Active' : 'Expired'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => handleEdit(sub)}
                            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 min-h-11"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleActivate(sub.shop.id)}
                            className="px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 min-h-11"
                          >
                            Activate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ========== PLANS TAB ========== */}
      {activeTab === 'plans' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={handleCreatePlan} className="min-h-11">
              <PlusIcon className="h-4 w-4 mr-1" /> Add Plan
            </Button>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-white rounded-xl shadow p-4 border">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold">{plan.name}</h3>
                  <span className="text-xs text-gray-500">{plan.duration_days} days</span>
                </div>
                <div className="mt-2 text-sm">
                  <p>Price: GHS {plan.price}</p>
                  <p className="text-xs text-gray-500">
                    {plan.is_trial_plan ? 'Trial plan' : plan.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleEditPlan(plan)}
                    className="flex-1 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg min-h-11"
                  >
                    <PencilIcon className="h-4 w-4 inline mr-1" /> Edit
                  </button>
                  <button
                    onClick={() => confirmDeletePlan(plan.id)}
                    className="flex-1 py-2 text-sm bg-red-50 text-red-600 rounded-lg min-h-11"
                  >
                    <TrashIcon className="h-4 w-4 inline mr-1" /> Delete
                  </button>
                </div>
              </div>
            ))}
            {plans.length === 0 && <div className="text-center py-8 text-gray-400">No plans found. Click "Add Plan".</div>}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow">
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
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{plan.name}</td>
                    <td className="px-6 py-4 text-sm">{plan.duration_days} days</td>
                    <td className="px-6 py-4 text-sm">{plan.price}</td>
                    <td className="px-6 py-4 text-sm">{plan.is_trial_plan ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4 text-sm">{plan.is_active ? '✅' : '❌'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleEditPlan(plan)}
                        className="text-blue-600 hover:underline p-2 min-h-11"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => confirmDeletePlan(plan.id)}
                        className="text-red-600 hover:underline p-2 min-h-11"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== SHOPS TAB ========== */}
      {activeTab === 'shops' && (
        <>
          {/* Mobile cards - vertical buttons to fit 360px width */}
          <div className="md:hidden space-y-4 pb-4">
            {shops.map((shop) => (
              <div key={shop.id} className="bg-white rounded-xl shadow p-4 border overflow-visible">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{shop.name}</h3>
                    <p className="text-xs text-gray-500">Owner: {shop.owner_phone || '—'}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      shop.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {shop.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex flex-col gap-2 mt-3">
                  <button
                    onClick={() => handleToggleShopActive(shop.id, shop.is_active)}
                    className={`w-full py-2 text-sm rounded-lg min-h-11 ${
                      shop.is_active
                        ? 'bg-red-50 text-red-600'
                        : 'bg-green-50 text-green-600'
                    }`}
                  >
                    {shop.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {shop.owner_id && (
                    <>
                      <button
                        onClick={() => handleResetPassword(shop.owner_id!, shop.owner_phone || '')}
                        className="w-full py-2 text-sm bg-yellow-50 text-yellow-600 rounded-lg min-h-11 flex items-center justify-center gap-1"
                      >
                        <KeyIcon className="h-4 w-4" />
                        <span>Random Pwd</span>
                      </button>
                      <button
                        onClick={() => handleSendResetLink(shop.owner_id!)}
                        className="w-full py-2 text-sm bg-blue-50 text-blue-600 rounded-lg min-h-11 flex items-center justify-center gap-1"
                      >
                        <EnvelopeIcon className="h-4 w-4" />
                        <span>Reset Link</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {shops.length === 0 && <div className="text-center py-8 text-gray-400">No shops found.</div>}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{shop.name}</td>
                    <td className="px-6 py-4 text-sm">{shop.owner_phone || '—'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          shop.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {shop.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleToggleShopActive(shop.id, shop.is_active)}
                        className={`px-3 py-1.5 text-sm rounded-lg min-h-11 ${
                          shop.is_active
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {shop.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {shop.owner_id && (
                        <>
                          <button
                            onClick={() => handleResetPassword(shop.owner_id!, shop.owner_phone || '')}
                            className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 min-h-11"
                          >
                            Random Pwd
                          </button>
                          <button
                            onClick={() => handleSendResetLink(shop.owner_id!)}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-11"
                          >
                            Reset Link
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ========== MODALS ========== */}

      {/* Edit Subscription Modal – using number input for days */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Subscription">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              value={editForm.plan_id}
              onChange={(e) => setEditForm({ ...editForm, plan_id: e.target.value })}
              className="w-full p-3 border rounded-lg text-base"
            >
              <option value="">Select a plan</option>
              {plans.filter((p) => !p.is_trial_plan).map((plan) => (
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
              value={editForm.days}
              onChange={(e) => setEditForm({ ...editForm, days: parseInt(e.target.value) || 0 })}
              className="w-full p-3 border rounded-lg text-base"
            />
            <p className="text-xs text-gray-500 mt-1">
              Current expiry: {selectedSub ? formatDate(selectedSub.end_date) : '—'}
            </p>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editForm.is_trial}
              onChange={(e) => setEditForm({ ...editForm, is_trial: e.target.checked })}
              className="h-5 w-5"
            />
            <span className="text-sm">Is trial</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowEditModal(false)} className="min-h-11">
              Cancel
            </Button>
            <Button onClick={handleUpdateSubscription} disabled={submitting} className="min-h-11">
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Activate Shop Modal – using number input for days */}
      <Modal isOpen={showActivateModal} onClose={() => setShowActivateModal(false)} title="Activate Subscription">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              value={activationForm.plan_id}
              onChange={(e) => setActivationForm({ ...activationForm, plan_id: e.target.value })}
              className="w-full p-3 border rounded-lg text-base"
            >
              {plans.filter((p) => !p.is_trial_plan).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} – GHS {plan.price}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration (days)</label>
            <input
              type="number"
              min="1"
              value={activationForm.days}
              onChange={(e) => setActivationForm({ ...activationForm, days: parseInt(e.target.value) || 0 })}
              className="w-full p-3 border rounded-lg text-base"
            />
            <p className="text-xs text-gray-500 mt-1">Expiration will be set to today + this many days.</p>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={activationForm.is_trial}
              onChange={(e) => setActivationForm({ ...activationForm, is_trial: e.target.checked })}
              className="h-5 w-5"
            />
            <span className="text-sm">Is trial</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowActivateModal(false)} className="min-h-11">
              Cancel
            </Button>
            <Button onClick={submitActivation} disabled={submitting} className="min-h-11">
              {submitting ? 'Activating...' : 'Activate'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Plan Create/Edit Modal – with default all checkboxes true on create */}
      <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title={editingPlan ? 'Edit Plan' : 'Create Plan'}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pb-2">
          <div>
            <label className="block text-sm font-medium mb-1">Plan Name *</label>
            <input
              type="text"
              value={planForm.name || ''}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              className="w-full p-3 border rounded-lg text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration (days)</label>
            <input
              type="number"
              value={planForm.duration_days || 30}
              onChange={(e) => setPlanForm({ ...planForm, duration_days: parseInt(e.target.value) })}
              className="w-full p-3 border rounded-lg text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price (GHS)</label>
            <input
              type="number"
              step="0.01"
              value={planForm.price || 0}
              onChange={(e) => setPlanForm({ ...planForm, price: parseFloat(e.target.value) })}
              className="w-full p-3 border rounded-lg text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Users</label>
            <input
              type="number"
              value={planForm.max_users || 0}
              onChange={(e) => setPlanForm({ ...planForm, max_users: parseInt(e.target.value) })}
              className="w-full p-3 border rounded-lg text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Products</label>
            <input
              type="number"
              value={planForm.max_products || 0}
              onChange={(e) => setPlanForm({ ...planForm, max_products: parseInt(e.target.value) })}
              className="w-full p-3 border rounded-lg text-base"
            />
          </div>

          {/* Feature checkboxes – default all checked on create */}
          <div className="space-y-2 border-t pt-3 mt-1">
            {[
              { key: 'allow_credit_sales', label: 'Allow Credit Sales' },
              { key: 'allow_bulk_import', label: 'Allow Bulk Import' },
              { key: 'allow_audit_logs', label: 'Allow Audit Logs' },
              { key: 'allow_analytics', label: 'Allow Analytics' },
              { key: 'is_active', label: 'Active (visible to shops)' },
              { key: 'is_trial_plan', label: 'Trial Plan (special)' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={planForm[key as keyof Plan] === true}
                  onChange={(e) => setPlanForm({ ...planForm, [key]: e.target.checked })}
                  className="h-5 w-5"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowPlanModal(false)} className="min-h-11">
              Cancel
            </Button>
            <Button onClick={savePlan} disabled={planLoading} className="min-h-11">
              {planLoading ? 'Saving...' : 'Save Plan'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Random Password Modal */}
      <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title="Password Reset">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">New password for <strong>{resetData?.phone}</strong>:</p>
          <div className="bg-gray-50 p-3 rounded-lg flex items-center justify-between">
            <code className="font-mono text-sm">{resetData?.newPassword}</code>
            <button onClick={copyPassword} className="p-2 text-gray-500 hover:text-green-600 min-h-11" aria-label="Copy password">
              {copied ? <CheckIcon className="h-5 w-5 text-green-600" /> : <ClipboardDocumentIcon className="h-5 w-5" />}
            </button>
          </div>
          <p className="text-xs text-red-600">⚠️ Copy and share securely. The password will not be shown again.</p>
          <div className="flex justify-end">
            <Button onClick={() => setShowResetModal(false)} className="min-h-11">Close</Button>
          </div>
        </div>
      </Modal>

      {/* Reset Link Modal */}
      <Modal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)} title="Password Reset Link">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Share this link with the owner (valid for 24h):</p>
          <div className="bg-gray-50 p-3 rounded-lg break-all">
            <code className="text-xs break-all">{resetLink}</code>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={copyLink}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 min-h-11"
            >
              {linkCopied ? <CheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
              {linkCopied ? 'Copied!' : 'Copy Link'}
            </button>
            <Button variant="secondary" onClick={() => setShowLinkModal(false)} className="min-h-11">
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Plan Delete Modal */}
      {planToDelete && (
        <ConfirmModal
          title="Delete Plan"
          message="⚠️ This action cannot be undone. Deleting a plan may affect existing subscriptions that use it. Are you sure you want to delete this plan?"
          confirmLabel="Delete Plan"
          loading={deletingPlan}
          variant="danger"
          onConfirm={executeDeletePlan}
          onCancel={() => setPlanToDelete(null)}
        />
      )}

      {/* Confirm Shop Toggle Modal */}
      {shopToggle && (
        <ConfirmModal
          title={shopToggle.newActive ? 'Activate Shop' : 'Deactivate Shop'}
          message={
            shopToggle.newActive
              ? 'This shop will be reactivated. The owner will be able to log in and use SmartPOS.'
              : 'This shop will be deactivated. The owner and all cashiers will be locked out until reactivated.'
          }
          confirmLabel={shopToggle.newActive ? 'Activate' : 'Deactivate'}
          loading={toggling}
          variant={shopToggle.newActive ? 'primary' : 'danger'}
          onConfirm={confirmToggleShop}
          onCancel={() => setShopToggle(null)}
        />
      )}
    </div>
  );
}