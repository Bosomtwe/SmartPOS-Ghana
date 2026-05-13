import { useState } from 'react';
import api from '../services/api';

interface SaleReport {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  user_name: string;
  customer_name?: string;
  items: any[];
}

export default function Reports() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<SaleReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/reports/sales/', {
        params: { start: startDate, end: endDate },
      });
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!data.length) return;
    // Prepare CSV rows
    const headers = ['Sale ID', 'Date', 'Total', 'Payment Method', 'Customer', 'Items'];
    const rows = data.map((sale) => [
      sale.id,
      new Date(sale.created_at).toLocaleString(),
      sale.total_amount.toFixed(2),
      sale.payment_method,
      sale.customer_name || 'Guest',
      sale.items.map((item) => `${item.product_detail?.name} x${item.quantity}`).join('; '),
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Sales Reports</h1>

      <div className="flex gap-4 items-end mb-6">
        <div>
          <label className="block text-sm font-medium">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border p-2 rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border p-2 rounded"
          />
        </div>
        <button
          onClick={fetchReport}
          disabled={!startDate || !endDate || loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {loading ? 'Loading...' : 'Generate'}
        </button>
        {data.length > 0 && (
          <button
            onClick={downloadCSV}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Download CSV
          </button>
        )}
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">Sale ID</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Total</th>
                <th className="px-4 py-2 text-left">Payment Method</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-left">Items</th>
              </tr>
            </thead>
            <tbody>
              {data.map((sale) => (
                <tr key={sale.id} className="border-t">
                  <td className="px-4 py-2">{sale.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">{new Date(sale.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">GHS {sale.total_amount.toFixed(2)}</td>
                  <td className="px-4 py-2">{sale.payment_method}</td>
                  <td className="px-4 py-2">{sale.customer_name || 'Guest'}</td>
                  <td className="px-4 py-2">
                    {sale.items.map((item) => `${item.product_detail?.name} x${item.quantity}`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}