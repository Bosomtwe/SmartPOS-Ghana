// src/pages/Settings.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useSyncStore } from '../stores/syncStore';
import { LogoutButton } from '../components/LogoutButton';
import { Button } from '../components/Button';
import SyncButton from '../components/SyncButton';
import { AuditLogTable } from '../components/AuditLogTable';
import { InviteCashierModal } from '../components/InviteCashierModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';
import { BackupRestore } from '../components/BackupRestore';
import api from '../services/api';
import { Link } from 'react-router-dom';
import {
  CloudArrowUpIcon,
  UserPlusIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  ArrowPathIcon as ResetIcon,
  UsersIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';

export default function Settings() {
  const { user, shop, token, refreshToken, setAuth } = useAuthStore();
  const { addToast } = useUIStore();
  const { pendingSales } = useSyncStore();

  // Subscription state
  const [subscription, setSubscription] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(false);

  // Invite & Cashier management state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [cashiers, setCashiers] = useState<{ id: string; phone: string; is_active: boolean }[]>([]);
  const [cashierTotal, setCashierTotal] = useState(0);
  const [cashierPage, setCashierPage] = useState(1);
  const [cashierSearch, setCashierSearch] = useState('');
  const [cashierPageSize] = useState(20);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{ phone: string; newPassword: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const [toggleId, setToggleId] = useState<string | null>(null);
  const [toggleAction, setToggleAction] = useState<'deactivate' | 'reactivate' | null>(null);
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [emailEditMode, setEmailEditMode] = useState(false);
  const [emailValue, setEmailValue] = useState(user?.email || '');
  const [emailSaving, setEmailSaving] = useState(false);

  // ==================== FETCH SUBSCRIPTION ====================
  const fetchSubscription = useCallback(async () => {
    // Only non‑superuser owners need to see subscription
    if (user?.role !== 'OWNER' || user?.is_superuser || !shop) return;
    setLoadingSub(true);
    try {
      const res = await api.get('/subscriptions/current/');
      setSubscription(res.data);
    } catch (err) {
      console.error('Failed to fetch subscription', err);
    } finally {
      setLoadingSub(false);
    }
  }, [user?.role, user?.is_superuser, shop]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // ==================== FETCH CASHIERS ====================
  const fetchCashiers = useCallback(async () => {
    if (user?.role !== 'OWNER') return;
    try {
      const params = new URLSearchParams({
        page: cashierPage.toString(),
        page_size: cashierPageSize.toString(),
      });
      if (cashierSearch.trim()) {
        params.append('search', cashierSearch.trim());
      }
      const res = await api.get(`/users/cashiers/?${params.toString()}`);
      setCashiers(res.data.results);
      setCashierTotal(res.data.count);
    } catch (err) {
      console.error('Failed to load cashiers', err);
    }
  }, [user?.role, cashierPage, cashierPageSize, cashierSearch]);

  useEffect(() => {
    fetchCashiers();
  }, [fetchCashiers]);

  useEffect(() => {
    setCashierPage(1);
  }, [cashierSearch]);

  // ==================== PASSWORD RESET ====================
  const handleResetPassword = async (cashierId: string) => {
    setResettingId(cashierId);
    try {
      const res = await api.post(`/users/cashier/${cashierId}/reset_password/`);
      setResetCredentials({
        phone: res.data.phone,
        newPassword: res.data.new_password,
      });
      setShowResetModal(true);
      addToast({ message: 'Password reset successfully', type: 'success' });
    } catch (err: any) {
      addToast({
        message: err.response?.data?.error || 'Failed to reset password',
        type: 'error',
      });
    } finally {
      setResettingId(null);
    }
  };

  const handleCopyCredentials = () => {
    if (!resetCredentials) return;
    const text = `Phone: ${resetCredentials.phone}\nPassword: ${resetCredentials.newPassword}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ==================== EMAIL UPDATE ====================
  const handleSaveEmail = async () => {
    if (!user || !token || !refreshToken || !shop) {
      addToast({ message: 'Authentication error. Please login again.', type: 'error' });
      return;
    }

    setEmailSaving(true);
    try {
      const res = await api.patch('/users/me/', { email: emailValue.trim() || null });
      const updatedUser = { ...user, email: res.data.email };
      setAuth(token, refreshToken, updatedUser, shop);
      addToast({ message: 'Email updated successfully', type: 'success' });
      setEmailEditMode(false);
    } catch (err: any) {
      const msg = err.response?.data?.email?.[0] || err.message || 'Failed to save email';
      addToast({ message: msg, type: 'error' });
    } finally {
      setEmailSaving(false);
    }
  };

  // ==================== CASHIER TOGGLE ACTIVE ====================
  const handleToggleActive = (cashierId: string, currentActive: boolean) => {
    setToggleId(cashierId);
    setToggleAction(currentActive ? 'deactivate' : 'reactivate');
    setShowToggleConfirm(true);
  };

  const confirmToggleActive = async () => {
    if (!toggleId || !toggleAction) return;
    setShowToggleConfirm(false);
    setToggling(true);
    try {
      const endpoint = toggleAction === 'deactivate'
        ? `/users/cashier/${toggleId}/deactivate/`
        : `/users/cashier/${toggleId}/reactivate/`;
      await api.post(endpoint);
      addToast({
        message: `Cashier ${toggleAction === 'deactivate' ? 'deactivated' : 'reactivated'} successfully`,
        type: 'success',
      });
      fetchCashiers();
    } catch (err: any) {
      addToast({
        message: err.response?.data?.error || 'Action failed',
        type: 'error',
      });
    } finally {
      setToggling(false);
      setToggleId(null);
      setToggleAction(null);
    }
  };

  useEffect(() => {
    if (user?.email) {
      setEmailValue(user.email);
    }
  }, [user?.email]);

  const totalCashierPages = Math.ceil(cashierTotal / cashierPageSize);

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 rounded-xl">
          <Cog6ToothIcon className="h-6 w-6 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your shop profile, data, and users</p>
        </div>
      </div>

      {/* Profile Section */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xl">
              {user?.role?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
              <p className="text-xs text-gray-500">{user?.role} account</p>
            </div>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <div>
              <dt className="text-gray-500">Shop name</dt>
              <dd className="font-medium text-gray-900">{shop?.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Phone</dt>
              <dd className="font-medium text-gray-900">{user?.phone}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Role</dt>
              <dd className="flex items-center gap-1.5">
                {user?.role === 'OWNER' && <ShieldCheckIcon className="h-4 w-4 text-green-600" />}
                <span className="font-medium text-gray-900">{user?.role}</span>
              </dd>
            </div>

            {user?.role === 'OWNER' && (
              <div>
                <dt className="text-gray-500">Email</dt>
                {emailEditMode ? (
                  <dd className="mt-1">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="email"
                          value={emailValue}
                          onChange={(e) => setEmailValue(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:border-primary-green focus:ring-2 focus:ring-primary-green/20"
                          placeholder="you@example.com"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEmail}
                          disabled={emailSaving}
                          className="text-xs px-3 py-2 bg-primary-green text-white rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap touch-manipulation"
                        >
                          {emailSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => {
                            setEmailEditMode(false);
                            setEmailValue(user?.email || '');
                          }}
                          className="text-xs px-3 py-2 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap touch-manipulation"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </dd>
                ) : (
                  <dd className="font-medium text-gray-900 flex items-center gap-2">
                    {user?.email || <span className="text-gray-400 italic">Not set</span>}
                    <button
                      onClick={() => setEmailEditMode(true)}
                      className="text-xs text-primary-green hover:underline touch-manipulation"
                    >
                      Edit
                    </button>
                  </dd>
                )}
              </div>
            )}
          </dl>
          <div className="mt-5 border-t pt-4">
            <LogoutButton />
          </div>
        </div>
      </section>

      {/* ✅ Subscription Plan Section – only for non‑superuser owners (regular shop owners) */}
      {user?.role === 'OWNER' && !user?.is_superuser && shop && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <CreditCardIcon className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">Subscription Plan</h2>
            </div>
            {loadingSub ? (
              <p className="text-sm text-gray-500">Loading subscription details...</p>
            ) : subscription ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-gray-600">Current plan:</span>
                  <span className="font-semibold text-gray-900">{subscription.plan_name}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-medium ${subscription.is_active ? 'text-green-600' : 'text-red-600'}`}>
                    {subscription.is_active ? 'Active' : 'Expired'}
                  </span>
                </div>
                {subscription.is_trial && (
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-600">Trial ends:</span>
                    <span className="text-gray-900">{new Date(subscription.end_date).toLocaleDateString()}</span>
                  </div>
                )}
                {!subscription.is_trial && (
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-600">Expires on:</span>
                    <span className="text-gray-900">{new Date(subscription.end_date).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="mt-3">
                  <Link to="/subscription">
                    <Button variant="secondary" className="w-full touch-manipulation">
                      Manage Subscription
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">No active subscription. Start a free trial or choose a paid plan.</p>
                <Link to="/subscription">
                  <Button className="w-full touch-manipulation">Start Free Trial</Button>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* User Management – Invite Cashier (Owner only) */}
      {user?.role === 'OWNER' && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <UserPlusIcon className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Invite Cashier</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Create a new cashier account. You'll receive login credentials to share manually.
            </p>
            <Button onClick={() => setShowInviteModal(true)} className="touch-manipulation">
              + Invite New Cashier
            </Button>
          </div>
        </section>
      )}

      {/* User Management – Manage Cashiers (Owner only) */}
      {user?.role === 'OWNER' && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <UsersIcon className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Manage Cashiers</h2>
            </div>

            <div className="mb-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by phone..."
                  value={cashierSearch}
                  onChange={(e) => setCashierSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl focus:border-primary-green focus:ring-2 focus:ring-primary-green/20"
                />
              </div>
            </div>

            {cashiers.length === 0 ? (
              <p className="text-sm text-gray-500">
                {cashierSearch ? 'No matching cashiers found.' : 'No cashiers added yet.'}
              </p>
            ) : (
              <>
                <ul className="divide-y divide-gray-200">
                  {cashiers.map((cashier) => (
                    <li key={cashier.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{cashier.phone}</p>
                        <p className={`text-xs font-medium ${cashier.is_active ? 'text-green-600' : 'text-red-600'}`}>
                          {cashier.is_active ? 'Active' : 'Deactivated'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResetPassword(cashier.id)}
                          disabled={resettingId === cashier.id}
                          className="flex items-center gap-1 touch-manipulation"
                        >
                          <ResetIcon className="h-4 w-4" />
                          <span className="sm:hidden">Reset</span>
                          <span className="hidden sm:inline">{resettingId === cashier.id ? 'Resetting...' : 'Reset Pwd'}</span>
                        </Button>
                        <Button
                          variant={cashier.is_active ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleActive(cashier.id, cashier.is_active)}
                          disabled={toggling && toggleId === cashier.id}
                          className="touch-manipulation"
                        >
                          {cashier.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>

                {totalCashierPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      onClick={() => setCashierPage((p) => Math.max(1, p - 1))}
                      disabled={cashierPage === 1}
                      className="p-2 rounded-lg border hover:bg-gray-100 disabled:opacity-40 touch-manipulation"
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {cashierPage} of {totalCashierPages}
                    </span>
                    <button
                      onClick={() => setCashierPage((p) => Math.min(totalCashierPages, p + 1))}
                      disabled={cashierPage === totalCashierPages}
                      className="p-2 rounded-lg border hover:bg-gray-100 disabled:opacity-40 touch-manipulation"
                    >
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Showing {cashiers.length} of {cashierTotal} cashier{cashierTotal !== 1 && 's'}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* Sync Section */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <CloudArrowUpIcon className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Sync Data</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-gray-500 mb-2">
                Manually push pending sales and updates to the cloud.
              </p>
              {pendingSales > 0 ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium w-fit">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  {pendingSales} pending sale{pendingSales > 1 && 's'}
                </div>
              ) : (
                <p className="text-xs text-green-600 font-medium">All data synced ✓</p>
              )}
            </div>
            <SyncButton />
          </div>
        </div>
      </section>

      {/* Data Management – Backup & Restore */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h2>
          <BackupRestore />
        </div>
      </section>

      {/* Audit Logs */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <ClipboardDocumentListIcon className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Audit Logs</h2>
            {user?.role !== 'OWNER' && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Owner only</span>
            )}
          </div>
          <AuditLogTable />
        </div>
      </section>

      {/* Modals */}
      <InviteCashierModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={() => {
          addToast({ message: 'Cashier added successfully', type: 'success' });
          setCashierPage(1);
          fetchCashiers();
        }}
      />

      <Modal
        isOpen={showResetModal}
        onClose={() => {
          setShowResetModal(false);
          setCopied(false);
        }}
        title="New Cashier Password"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Share these credentials with the cashier:</p>
          <div className="bg-gray-50 p-3 rounded-lg relative">
            <p><strong>Phone:</strong> {resetCredentials?.phone}</p>
            <p><strong>New Password:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{resetCredentials?.newPassword}</code></p>
            <button
              onClick={handleCopyCredentials}
              className="absolute top-2 right-2 p-2 text-gray-500 hover:text-primary transition-colors touch-manipulation"
              aria-label="Copy credentials"
            >
              {copied ? <CheckIcon className="w-4 h-4 text-green-600" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { setShowResetModal(false); setCopied(false); }} className="touch-manipulation">
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {showToggleConfirm && (
        <ConfirmModal
          title={toggleAction === 'deactivate' ? 'Deactivate Cashier' : 'Reactivate Cashier'}
          message={
            toggleAction === 'deactivate'
              ? 'This cashier will no longer be able to log in. Are you sure?'
              : 'This cashier will be able to log in again. Are you sure?'
          }
          confirmLabel={toggleAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
          loading={toggling}
          variant={toggleAction === 'deactivate' ? 'danger' : 'primary'}
          onConfirm={confirmToggleActive}
          onCancel={() => {
            setShowToggleConfirm(false);
            setToggleId(null);
            setToggleAction(null);
          }}
        />
      )}
    </div>
  );
}