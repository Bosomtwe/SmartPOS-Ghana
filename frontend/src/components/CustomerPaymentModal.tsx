// src/components/CustomerPaymentModal.tsx
import { useState, useEffect } from 'react';
import { Button } from './Button';
import { useCustomerStore } from '../stores/customerStore';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import { db } from '../lib/dexie';

interface Props {
  customer: { id: string; name: string; totalCredit: number };
  onClose: () => void;
  onSuccess: () => void;
}

// Accepts both strings and numbers
const formatCurrency = (amount: number | string) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `GHS ${num.toFixed(2)}`;
};

export const CustomerPaymentModal = ({ customer, onClose, onSuccess }: Props) => {
  const { recordPayment } = useCustomerStore();
  const { addToast } = useUIStore();
  const { shop } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [outstandingSales, setOutstandingSales] = useState<any[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'general' | 'specific'>('general');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [outstandingLoading, setOutstandingLoading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const loadOutstanding = async () => {
      setOutstandingLoading(true);
      try {
        if (isOnline) {
          const res = await api.get(`/customers/${customer.id}/outstanding_sales/`);
          if (!cancelled) setOutstandingSales(res.data);
        } else {
          // Offline: load from Dexie (no index needed – filter in JS)
          const allSales = await db.sales.toArray();
          const shopId = shop?.id || localStorage.getItem('shopId');
          const outstanding = allSales
            .filter(s => 
              s.customerId === customer.id &&
              s.paymentMethod === 'CREDIT' &&
              s.status !== 'VOIDED' &&
              (s.balance ?? 0) > 0 &&
              (!shopId || s.shopId === shopId)
            )
            .map(s => ({
              id: s.id,
              created_at: s.createdAt.toISOString(),
              total_amount: s.totalAmount,
              balance: s.balance ?? 0,
            }));
          if (!cancelled) setOutstandingSales(outstanding);
        }
      } catch (err) {
        console.error('Failed to load outstanding sales', err);
        if (!cancelled) setOutstandingSales([]);
      } finally {
        if (!cancelled) setOutstandingLoading(false);
      }
    };

    loadOutstanding();
    return () => { cancelled = true; };
  }, [customer.id, isOnline, shop?.id]);

  const totalOutstanding = outstandingSales.reduce(
    (sum, sale) => sum + parseFloat(sale.balance || '0'),
    0
  );

  const selectedSale = paymentMode === 'specific'
    ? outstandingSales.find(s => s.id === selectedSaleId)
    : null;

  // Max amount: online uses server data; offline falls back to total customer debt.
  const maxAmount = !isOnline
    ? customer.totalCredit
    : paymentMode === 'specific' && selectedSale
      ? parseFloat(selectedSale.balance || '0')
      : totalOutstanding;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      addToast({ message: 'Enter a valid amount.', type: 'warning' });
      return;
    }
    if (amt > maxAmount) {
      addToast({
        message: `Amount exceeds outstanding (max ${formatCurrency(maxAmount)}).`,
        type: 'warning',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await recordPayment(
        customer.id,
        amt,
        note,
        paymentMode === 'specific' ? selectedSaleId : undefined
      );

      const allocatedToSales = response?.allocated_to_sales;
      if (paymentMode === 'general' && allocatedToSales !== undefined) {
        addToast({
          message: `Payment of ${formatCurrency(amt)} distributed across ${allocatedToSales} sale(s).`,
          type: 'success',
        });
      } else if (paymentMode === 'specific' && selectedSale) {
        const saleShort = selectedSale.id.slice(0, 8);
        addToast({
          message: `Payment of ${formatCurrency(amt)} applied to Sale #${saleShort}.`,
          type: 'success',
        });
      } else {
        addToast({ message: 'Payment recorded.', type: 'success' });
      }

      onSuccess();
    } catch (err: any) {
      addToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const saleDate = (sale: any) =>
    sale.created_at ? new Date(sale.created_at).toLocaleDateString() : 'Unknown date';

  const specificSaleDisabled = !isOnline && outstandingSales.length === 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4">Record Payment – {customer.name}</h2>

        {/* Total debt info */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium">
            Current total debt: <span className="text-red-600 font-bold">{formatCurrency(customer.totalCredit)}</span>
          </p>
          {outstandingSales.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Spread across {outstandingSales.length} credit sale(s)
            </p>
          )}
          {!isOnline && (
            <p className="text-xs text-yellow-600 mt-1">
              Offline – showing locally available data.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payment mode selection */}
          <fieldset>
            <legend className="text-sm font-medium mb-2">Payment allocation</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === 'general'}
                  onChange={() => {
                    setPaymentMode('general');
                    setSelectedSaleId('');
                    setAmount('');
                  }}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium">Apply to all outstanding sales (oldest first)</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Your payment will be automatically distributed across your oldest unpaid credit sales,
                    paying them off one by one.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === 'specific'}
                  onChange={() => setPaymentMode('specific')}
                  disabled={specificSaleDisabled}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium">Apply to a specific sale</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {specificSaleDisabled
                      ? 'No offline sales available for specific allocation – use general mode.'
                      : 'The payment will only reduce the balance of the selected sale.'}
                  </p>
                </div>
              </label>
            </div>
          </fieldset>

          {/* Specific sale dropdown (only when specific mode) */}
          {paymentMode === 'specific' && (
            <div>
              {outstandingSales.length === 0 ? (
                <p className="text-sm text-yellow-600">
                  {outstandingLoading
                    ? 'Loading sales…'
                    : 'No outstanding sales available for this customer.'}
                </p>
              ) : (
                <>
                  <label className="block text-sm font-medium mb-1">Choose a sale</label>
                  <select
                    value={selectedSaleId}
                    onChange={(e) => {
                      setSelectedSaleId(e.target.value);
                      setAmount('');
                    }}
                    className="w-full p-2 border rounded-lg text-sm"
                    required
                  >
                    <option value="">-- Select a sale --</option>
                    {outstandingSales.map(sale => (
                      <option key={sale.id} value={sale.id}>
                        {saleDate(sale)} – Total: {formatCurrency(sale.total_amount)} (owing: {formatCurrency(sale.balance)})
                      </option>
                    ))}
                  </select>
                  {selectedSale && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800">
                      Sale from <strong>{saleDate(selectedSale)}</strong> ·
                      Total {formatCurrency(selectedSale.total_amount)} ·
                      Remaining {formatCurrency(selectedSale.balance)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Amount input */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Amount *
              {paymentMode === 'general' && (
                <span className="ml-1 text-gray-400" title="Auto-allocated to oldest unpaid sales">
                  ℹ️
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={maxAmount}
              className="w-full p-2 border rounded-lg"
              placeholder={`Max ${formatCurrency(maxAmount)}`}
            />
            <p className="text-xs text-gray-500 mt-1">
              {!isOnline
                ? `Total customer debt: ${formatCurrency(customer.totalCredit)}`
                : paymentMode === 'general'
                  ? `Total outstanding across all sales: ${formatCurrency(totalOutstanding)}`
                  : selectedSale
                    ? `This sale's outstanding: ${formatCurrency(parseFloat(selectedSale.balance) || 0)}`
                    : 'Select a sale to see its outstanding'}
            </p>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2 border rounded-lg"
              placeholder="e.g., Cash payment"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (paymentMode === 'specific' && !selectedSaleId)}
            >
              {loading ? 'Processing...' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};