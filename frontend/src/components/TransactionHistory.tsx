// src/components/TransactionHistory.tsx
import { useEffect, useState } from 'react';
import api from '../services/api';
import { db } from '../lib/dexie';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { CreditTransaction } from '../lib/dexie';

interface Props {
  customer: { id: string; name: string };
  onClose: () => void;
  onViewSale?: (saleId: string) => void;
}

const parseTransactionFromApi = (raw: any): CreditTransaction => ({
  id: raw.id,
  customerId: raw.customer,
  saleId: raw.sale,
  type: raw.type,
  amount: Number(raw.amount),
  balanceAfter: Number(raw.balance_after),
  note: raw.note,
  createdAt: new Date(raw.created_at),
  synced: true,
});

export default function TransactionHistory({ customer, onClose, onViewSale }: Props) {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  const fetchTransactions = async () => {
    setLoading(true);
    setError('');
    try {
      let data: CreditTransaction[] = [];
      console.log('[TransactionHistory] Fetching transactions. Online:', isOnline);
      if (isOnline) {
        const response = await api.get(`/customers/${customer.id}/transactions/`);
        console.log('[TransactionHistory] API response:', response.data);
        data = response.data.map(parseTransactionFromApi);
      } else {
        const raw = await db.creditTransactions
          .where('customerId')
          .equals(customer.id)
          .reverse()
          .sortBy('createdAt');
        console.log('[TransactionHistory] Offline local transactions:', raw);
        data = raw as CreditTransaction[];
      }
      console.log('[TransactionHistory] Total transactions fetched:', data.length);
      setTransactions(data);
    } catch (err: any) {
      console.error('[TransactionHistory] Fetch error:', err);
      setError(err.response?.data?.detail || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [customer.id, isOnline]);

  const filtered = transactions.filter((tx) => {
    const txDate = tx.createdAt.toISOString().split('T')[0];
    if (startDate && txDate < startDate) return false;
    if (endDate && txDate > endDate) return false;
    return true;
  });

  console.log('[TransactionHistory] After filtering:', filtered.length, 'transactions');
  filtered.forEach((tx, i) => {
    console.log(`[TransactionHistory] ${i}:`, {
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      saleId: tx.saleId,
      synced: tx.synced,
    });
  });

  const format = (val: number) => `GHS ${val.toFixed(2)}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold">Transactions – {customer.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-600 flex items-center gap-1">
            From:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
          </label>
          <label className="text-xs text-gray-600 flex items-center gap-1">
            To:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
          </label>
          <button
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex justify-center py-8">
              <ArrowPathIcon className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg">{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400">No transactions found.</div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-right py-2 px-3">Amount</th>
                  <th className="text-right py-2 px-3">Balance</th>
                  <th className="text-left py-2 px-3">Note</th>
                  <th className="text-left py-2 px-3">Sale</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr key={tx.id} className="border-t">
                    <td className="py-2 px-3 whitespace-nowrap">
                      {tx.createdAt.toLocaleString()}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          tx.type === 'DEBT'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {format(Math.abs(tx.amount))}
                    </td>
                    <td className="py-2 px-3 text-right">{format(tx.balanceAfter)}</td>
                    <td className="py-2 px-3 text-gray-500 max-w-xs truncate">
                      {tx.note || '—'}
                    </td>
                    <td className="py-2 px-3 text-sm text-blue-600">
                      {tx.saleId ? (
                        <button
                          onClick={() => onViewSale && onViewSale(tx.saleId!)}
                          className="underline hover:text-blue-800"
                        >
                          {tx.saleId.slice(0, 8)}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {isOnline ? 'Online' : 'Offline'} · {filtered.length} record(s)
          </span>
          <button
            onClick={fetchTransactions}
            className="text-green-600 hover:text-green-700 text-sm flex items-center gap-1"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}