import { useEffect, useState, memo, useCallback } from 'react';
import { useAuditStore } from '../stores/auditStore';
import { useAuthStore } from '../stores/authStore';
import { Button } from './Button';
import { AuditSearchBar } from './AuditSearchBar';
import {
  ArrowPathIcon,
  DocumentArrowDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'SALE_CREATE', label: 'Sale Created' },
  { value: 'SALE_VOID', label: 'Sale Voided' },
  { value: 'PRICE_CHANGE', label: 'Price Changed' },
  { value: 'STOCK_ADJUST', label: 'Stock Adjusted' },
  { value: 'CREDIT_PAYMENT', label: 'Credit Payment' },
  { value: 'PRODUCT_CREATE', label: 'Product Created' },
  { value: 'PRODUCT_UPDATE', label: 'Product Updated' },
  { value: 'PRODUCT_DELETE', label: 'Product Deleted' },
  { value: 'CUSTOMER_CREATE', label: 'Customer Created' },
  { value: 'CUSTOMER_UPDATE', label: 'Customer Updated' },
  { value: 'CUSTOMER_DELETE', label: 'Customer Deleted' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'BACKUP_DOWNLOAD', label: 'Backup Downloaded' },
  { value: 'BACKUP_RESTORE', label: 'Backup Restored' },
  { value: 'INVITE_CASHIER', label: 'Cashier Invited' },
];

// Color mapping for badges
const ACTION_COLORS: Record<string, string> = {
  SALE_CREATE: 'bg-green-100 text-green-800',
  SALE_VOID: 'bg-red-100 text-red-800',
  PRICE_CHANGE: 'bg-blue-100 text-blue-800',
  STOCK_ADJUST: 'bg-yellow-100 text-yellow-800',
  PRODUCT_CREATE: 'bg-emerald-100 text-emerald-800',
  PRODUCT_UPDATE: 'bg-sky-100 text-sky-800',
  PRODUCT_DELETE: 'bg-red-100 text-red-800',
  CUSTOMER_CREATE: 'bg-indigo-100 text-indigo-800',
  CUSTOMER_UPDATE: 'bg-purple-100 text-purple-800',
  CUSTOMER_DELETE: 'bg-pink-100 text-pink-800',
  LOGIN: 'bg-gray-100 text-gray-800',
  LOGOUT: 'bg-gray-100 text-gray-600',
  BACKUP_DOWNLOAD: 'bg-teal-100 text-teal-800',
  BACKUP_RESTORE: 'bg-orange-100 text-orange-800',
  INVITE_CASHIER: 'bg-cyan-100 text-cyan-800',
  CREDIT_PAYMENT: 'bg-lime-100 text-lime-800',
};

export const AuditLogTable = memo(() => {
  const { user } = useAuthStore();
  const { logs, loading, error, total, fetchLogs } = useAuditStore();
  const [filters, setFilters] = useState({
    action: '',
    start_date: '',
    end_date: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Track which row's details are expanded
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const isOwner = user?.role === 'OWNER';

  useEffect(() => {
    if (!isOwner) return;
    fetchLogs({
      action: filters.action || undefined,
      search: searchTerm || undefined,
      start_date: filters.start_date || undefined,
      end_date: filters.end_date || undefined,
      page,
      page_size: pageSize,
    });
  }, [isOwner, filters.action, searchTerm, filters.start_date, filters.end_date, page, fetchLogs]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = useCallback(() => {
    const headers = ['Time', 'User', 'Action', 'Summary', 'IP Address', 'Path'];
    const rows = logs.map((log) => [
      new Date(log.created_at).toLocaleString(),
      log.user_display,
      log.action_display,
      log.summary,
      log.ip_address || '',
      log.request_path,
    ]);
    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  const handleRefresh = useCallback(() => {
    fetchLogs({ page, page_size: pageSize });
  }, [fetchLogs, page, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  if (!isOwner) return null;

  const FilterBar = () => (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
        <AuditSearchBar onSearch={setSearchTerm} />
      </div>
      <div className="w-48">
        <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
        <select
          value={filters.action}
          onChange={(e) => handleFilterChange('action', e.target.value)}
          className="w-full p-2 border rounded-lg"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
        <input
          type="date"
          value={filters.start_date}
          onChange={(e) => handleFilterChange('start_date', e.target.value)}
          className="p-2 border rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
        <input
          type="date"
          value={filters.end_date}
          onChange={(e) => handleFilterChange('end_date', e.target.value)}
          className="p-2 border rounded-lg"
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={handleRefresh}
          className="flex items-center gap-1"
          disabled={loading}
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button
          variant="secondary"
          onClick={handleExport}
          disabled={logs.length === 0}
          className="flex items-center gap-1"
        >
          <DocumentArrowDownIcon className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">{error}</div>
        <FilterBar />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar />

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-xl shadow border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Summary</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  Loading audit logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  No audit logs found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    {log.user_display}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {log.action_display}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">
                    {log.summary}
                  </td>
                  <td className="px-6 py-4 text-sm">{log.ip_address || '—'}</td>
                  <td className="px-6 py-4 text-right text-sm">
                    <button
                      onClick={() => toggleRowExpand(log.id)}
                      className="inline-flex items-center text-primary-green hover:underline"
                    >
                      {expandedRows.has(log.id) ? (
                        <ChevronUpIcon className="h-4 w-4" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4" />
                      )}
                      <span className="ml-1 text-xs">details</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Expanded details rows */}
        {logs.map((log) =>
          expandedRows.has(log.id) ? (
            <div key={`detail-${log.id}`} className="bg-gray-50 px-6 py-3 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                <div><span className="font-medium">Path:</span> {log.request_path || '—'}</div>
                <div><span className="font-medium">Method:</span> {log.http_method || '—'}</div>
                <div><span className="font-medium">User Agent:</span> {log.user_agent || '—'}</div>
                <div className="sm:col-span-2">
                  <span className="font-medium">Full details:</span>
                  <pre className="mt-1 whitespace-pre-wrap bg-white p-2 rounded border text-xs">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : null
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-4">
          <div className="text-sm text-gray-500">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});