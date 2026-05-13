// src/pages/Customers.tsx
import { useEffect, useState } from 'react';
import { useCustomerStore } from '../stores/customerStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import CustomerModal from '../components/CustomerModal';
import { CustomerPaymentModal } from '../components/CustomerPaymentModal';
import TransactionHistory from '../components/TransactionHistory';
import { ConfirmModal } from '../components/ConfirmModal';
import { Button } from '../components/Button';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { db } from '../lib/dexie'; // <-- debugging purpose

export default function Customers() {
  const { customers, loading, error, fetchCustomers, deleteCustomer } = useCustomerStore();
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Debug Dexie state (keep existing)
  useEffect(() => {
    (async () => {
      const allSales = await db.sales.toArray();
      const allTxs = await db.creditTransactions.toArray();
      console.log('[DB DUMP] All sales:', allSales);
      console.log('[DB DUMP] All credit transactions:', allTxs);
    })();
  }, []);

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search))
  );

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(deleteTarget);
      addToast({ message: 'Customer deleted', type: 'success' });
    } catch (err: any) {
      const message = err?.response?.data?.detail || err.message || 'Delete failed';
      addToast({ message, type: 'error' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const CreditBalance = ({ customer }: { customer: any }) => {
    const credit = Number(customer.totalCredit) || 0;
    const limit = customer.creditLimit !== undefined ? Number(customer.creditLimit) : null;
    return (
      <div>
        <span className={credit > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
          GHS {credit.toFixed(2)}
        </span>
        {limit && (
          <span className="text-xs text-gray-500 ml-1.5">
            (Limit: GHS {limit.toFixed(2)})
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 md:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold">Customers & Credit</h1>
        {user?.role === 'OWNER' && (
          <Button
            onClick={() => { setSelectedCustomer(null); setShowCustomerModal(true); }}
            className="touch-manipulation self-start"
          >
            + Add Customer
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 w-full p-2.5 border rounded-xl text-sm"
        />
      </div>

      {/* Loading / Error */}
      {loading && <div className="text-center py-8 text-gray-500">Loading customers...</div>}
      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

      {!loading && !error && (
        <>
          {/* ====== Mobile: card list ====== */}
          <div className="md:hidden space-y-3">
            {filteredCustomers.length === 0 && (
              <div className="text-center py-8 text-gray-400">No customers found.</div>
            )}
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="bg-white rounded-xl shadow p-4 flex flex-col gap-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                    {customer.phone && (
                      <p className="text-sm text-gray-500 mt-0.5">{customer.phone}</p>
                    )}
                  </div>
                  <CreditBalance customer={customer} />
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setShowCustomerModal(true);
                    }}
                    className="flex-1 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 touch-manipulation"
                  >
                    Edit
                  </button>
                  {user?.role === 'OWNER' && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowPaymentModal(true);
                        }}
                        className="flex-1 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 touch-manipulation"
                      >
                        Pay
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowTransactions(true);
                        }}
                        className="flex-1 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 touch-manipulation"
                      >
                        History
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id)}
                        disabled={Number(customer.totalCredit) > 0}
                        className="flex-1 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          Number(customer.totalCredit) > 0
                            ? 'Clear debt before deleting'
                            : ''
                        }
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ====== Desktop: table view ====== */}
          <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Credit Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{customer.name}</td>
                    <td className="px-6 py-4 text-gray-500">{customer.phone || '—'}</td>
                    <td className="px-6 py-4">
                      <CreditBalance customer={customer} />
                    </td>
                    <td className="px-6 py-4 space-x-2">
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowCustomerModal(true);
                        }}
                        className="text-blue-600 hover:underline touch-manipulation"
                      >
                        Edit
                      </button>
                      {user?.role === 'OWNER' && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setShowPaymentModal(true);
                            }}
                            className="text-green-600 hover:underline touch-manipulation"
                          >
                            Pay
                          </button>
                          <button
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setShowTransactions(true);
                            }}
                            className="text-purple-600 hover:underline touch-manipulation"
                          >
                            History
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id)}
                            disabled={Number(customer.totalCredit) > 0}
                            className="text-red-600 hover:underline touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                            title={
                              Number(customer.totalCredit) > 0
                                ? 'Clear debt before deleting'
                                : ''
                            }
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modals */}
      {showCustomerModal && (
        <CustomerModal
          customer={selectedCustomer}
          onClose={() => setShowCustomerModal(false)}
          onSuccess={() => { setShowCustomerModal(false); fetchCustomers(); }}
        />
      )}
      {showPaymentModal && selectedCustomer && (
        <CustomerPaymentModal
          customer={selectedCustomer}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => { setShowPaymentModal(false); fetchCustomers(); }}
        />
      )}
      {showTransactions && selectedCustomer && (
        <TransactionHistory
          customer={selectedCustomer}
          onClose={() => setShowTransactions(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Customer"
          message="Are you sure? If the customer has transaction history, deletion will be blocked. Ensure all debts are cleared."
          loading={deleting}
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}