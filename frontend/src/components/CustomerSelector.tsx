// src/components/CustomerSelector.tsx
import { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useCustomerStore } from '../stores/customerStore';
import { useUIStore } from '../stores/uiStore';

interface CustomerSelectorProps {
  onSelect: (id: string) => void;
  selectedId?: string;
}

export const CustomerSelector = ({ onSelect, selectedId }: CustomerSelectorProps) => {
  const { customers, loading, fetchCustomers } = useCustomerStore();
  const { addToast } = useUIStore();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (customers.length === 0) {
      fetchCustomers().catch(() => {});
    }
  }, [fetchCustomers, customers.length]);

  const handleRefresh = useCallback(async () => {
    if (!navigator.onLine) {
      addToast({ message: 'You are offline. Showing cached customers.', type: 'info' });
      return;
    }
    setRefreshing(true);
    try {
      await fetchCustomers();
      addToast({ message: 'Customer list updated', type: 'success', duration: 2000 });
    } catch (error) {
      addToast({ message: 'Failed to refresh customers', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [fetchCustomers, addToast]);

  const filteredCustomers = customers.filter((c) => {
    if (!query.trim()) return true;
    const lowerQuery = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(lowerQuery) ||
      (c.phone && c.phone.includes(query))
    );
  });

  const displayedCustomers = filteredCustomers.slice(0, 20);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
          aria-label="Refresh customers"
          title="Refresh customer list"
        >
          <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y">
        {loading ? (
          <div className="p-4 text-center text-sm text-gray-400">Loading customers...</div>
        ) : displayedCustomers.length > 0 ? (
          displayedCustomers.map((c) => {
            const credit = Number(c.totalCredit) || 0;
            const limit = c.creditLimit !== undefined ? Number(c.creditLimit) : null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-green-50 ${
                  selectedId === c.id ? 'bg-green-50 text-green-700 font-bold' : 'text-gray-700'
                }`}
              >
                <div className="flex flex-col items-start">
                  <span>{c.name}</span>
                  <span className="text-xs text-gray-500 font-normal">{c.phone || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {credit > 0 ? `Debt: GHS ${credit.toFixed(2)}` : 'No debt'}
                    {limit ? ` / Limit: GHS ${limit.toFixed(2)}` : ''}
                  </span>
                  {selectedId === c.id && <div className="w-2 h-2 bg-green-600 rounded-full" />}
                </div>
              </button>
            );
          })
        ) : (
          <div className="p-4 text-center text-xs text-gray-400">
            {query ? 'No matching customers found.' : 'No customers available. Click refresh to sync.'}
          </div>
        )}
        {filteredCustomers.length > 20 && (
          <div className="p-2 text-center text-xs text-gray-400 bg-gray-50">
            Showing 20 of {filteredCustomers.length} customers. Refine your search.
          </div>
        )}
      </div>

      {!navigator.onLine && (
        <p className="text-xs text-yellow-600 flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full"></span>
          Offline – showing cached customers
        </p>
      )}
    </div>
  );
};