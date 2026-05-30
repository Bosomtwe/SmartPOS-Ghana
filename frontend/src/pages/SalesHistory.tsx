// src/pages/SalesHistory.tsx
import { useEffect, useState } from 'react';
import { useSalesStore } from '../stores/saleStore';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useCustomerStore } from '../stores/customerStore';
import { useProductStore } from '../stores/productStore'; // ✅ import product store
import { ReceiptModal } from '../components/ReceiptModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { PaginationBar } from '../components/PaginationBar';
import {
  MagnifyingGlassIcon,
  XCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import type { Sale } from '../lib/dexie';

const formatCurrency = (amount: number) => `GHS ${amount.toFixed(2)}`;

export default function SalesHistory() {
  const { sales, loading, fetchSales, voidSale } = useSalesStore();
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const { customers, fetchCustomers } = useCustomerStore();
  const { fetchProducts } = useProductStore(); // ✅ get product fetch function

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('ALL');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);

  // ✅ Pre‑fetch products when page loads (so receipts open instantly)
  useEffect(() => {
    fetchProducts();
    fetchSales();
    fetchCustomers();
  }, [fetchProducts, fetchSales, fetchCustomers]);

  const getCustomerName = (customerId?: string): string => {
    if (!customerId) return '—';
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : customerId;
  };

  const filtered = sales
    .filter(sale => {
      const matchQuery =
        !searchQuery ||
        sale.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sale.customerId && sale.customerId.includes(searchQuery)) ||
        (sale.customerId && getCustomerName(sale.customerId).toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sale.paymentMethod === 'MOMO' && sale.momoNumber && sale.momoNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchPayment = filterPayment === 'ALL' || sale.paymentMethod === filterPayment;
      return matchQuery && matchPayment;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleVoid = (saleId: string) => setVoidTarget(saleId);

  const confirmVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidSale(voidTarget, 'Voided by user');
      addToast({ message: 'Sale voided', type: 'success' });
    } catch (err: any) {
      addToast({ message: err.message || 'Void failed', type: 'error' });
    } finally {
      setVoiding(false);
      setVoidTarget(null);
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-5">Sales History</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by receipt #, customer, Momo..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          value={filterPayment}
          onChange={e => setFilterPayment(e.target.value)}
          className="border rounded-xl px-4 py-2.5 text-sm bg-white"
        >
          <option value="ALL">All Methods</option>
          <option value="CASH">Cash</option>
          <option value="MOMO">MoMo</option>
          <option value="CREDIT">Credit</option>
        </select>
      </div>

      {/* Loading / empty states */}
      {loading && <p className="text-gray-500 py-8 text-center">Loading sales...</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-gray-400 py-8 text-center">No sales found.</p>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* Mobile: card layout */}
          <div className="md:hidden space-y-3">
            {filtered.map(sale => (
              <div key={sale.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs text-gray-500">
                      {new Date(sale.createdAt).toLocaleDateString()}{' '}
                      {new Date(sale.createdAt).toLocaleTimeString()}
                    </p>
                    <p className="text-sm font-mono font-bold mt-0.5">
                      #{sale.id.slice(0, 8)}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-bold rounded-full ${
                      sale.status === 'VOIDED'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {sale.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  <span className="text-gray-500">Method:</span>
                  <span className="font-medium">{sale.paymentMethod}</span>

                  <span className="text-gray-500">Total:</span>
                  <span className="font-bold">{formatCurrency(sale.totalAmount)}</span>

                  {sale.paymentMethod === 'CREDIT' && (
                    <>
                      <span className="text-gray-500">Paid / Balance:</span>
                      <span>
                        {formatCurrency(sale.totalPaid || 0)}{' '}
                        {sale.balance && sale.balance > 0 ? (
                          <span className="text-red-600">({formatCurrency(sale.balance)})</span>
                        ) : null}
                      </span>
                    </>
                  )}

                  <span className="text-gray-500">Customer:</span>
                  <span className="truncate">
                    {sale.paymentMethod === 'CREDIT'
                      ? getCustomerName(sale.customerId)
                      : sale.paymentMethod === 'MOMO' && sale.momoNumber
                        ? `MoMo: ${sale.momoNumber}`
                        : '—'}
                  </span>
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <button
                    onClick={() => {
                      setSelectedSale(sale);
                      setShowReceipt(true);
                    }}
                    className="flex-1 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 touch-manipulation"
                  >
                    <DocumentTextIcon className="h-4 w-4 inline mr-1" />
                    Receipt
                  </button>
                  {user?.role === 'OWNER' && sale.status !== 'VOIDED' && (
                    <button
                      onClick={() => handleVoid(sale.id)}
                      className="flex-1 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 touch-manipulation"
                    >
                      <XCircleIcon className="h-4 w-4 inline mr-1" />
                      Void
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table view */}
          <div className="hidden md:block bg-white rounded-xl shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map(sale => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {new Date(sale.createdAt).toLocaleDateString()}<br />
                      <span className="text-xs text-gray-400">{new Date(sale.createdAt).toLocaleTimeString()}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{sale.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-sm">{sale.paymentMethod}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(sale.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {sale.paymentMethod === 'CREDIT' ? formatCurrency(sale.totalPaid || 0) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {sale.paymentMethod === 'CREDIT' ? (
                        <span className={sale.balance && sale.balance > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                          {formatCurrency(sale.balance || 0)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {sale.paymentMethod === 'CREDIT'
                        ? getCustomerName(sale.customerId)
                        : sale.paymentMethod === 'MOMO' && sale.momoNumber
                          ? `MoMo: ${sale.momoNumber}`
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {sale.status === 'VOIDED' ? (
                        <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">VOIDED</span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">Completed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => { setSelectedSale(sale); setShowReceipt(true); }} className="text-green-600 hover:text-green-800 touch-manipulation" title="View receipt">
                        <DocumentTextIcon className="h-5 w-5 inline" />
                      </button>
                      {user?.role === 'OWNER' && sale.status !== 'VOIDED' && (
                        <button onClick={() => handleVoid(sale.id)} className="text-red-600 hover:text-red-800 touch-manipulation" title="Void sale">
                          <XCircleIcon className="h-5 w-5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <PaginationBar />
          </div>
        </>
      )}

      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        sale={selectedSale}
      />

      {voidTarget && (
        <ConfirmModal
          title="Void Sale"
          message="Are you sure you want to void this sale? Stock will be returned."
          confirmLabel="Void"
          loading={voiding}
          variant="danger"
          onConfirm={confirmVoid}
          onCancel={() => setVoidTarget(null)}
        />
      )}
    </div>
  );
}