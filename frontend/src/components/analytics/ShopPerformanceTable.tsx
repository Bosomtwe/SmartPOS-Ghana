import { useState, useMemo } from 'react';

interface ShopPerformance {
  id: string;
  name: string;
  address: string;
  total_sales: number;
  sales_count: number;
  avg_sale: number;
  total_credit: number;
  credit_customers: number;
  products_count: number;
  last_activity: string | null;
}

interface Props {
  data: ShopPerformance[] | null;
}

export const ShopPerformanceTable = ({ data }: Props) => {
  const [sortKey, setSortKey] = useState<string>('total_sales');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const shops = data ?? [];

  const sortedShops = useMemo(() => {
    if (!shops.length) return [];
    return [...shops].sort((a, b) => {
      const valA = a[sortKey as keyof ShopPerformance] ?? 0;
      const valB = b[sortKey as keyof ShopPerformance] ?? 0;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      const numA = Number(valA);
      const numB = Number(valB);
      return sortDir === 'asc' ? numA - numB : numB - numA;
    });
  }, [shops, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const columns = [
    { key: 'name', label: 'Shop' },
    { key: 'total_sales', label: 'Total Sales' },
    { key: 'sales_count', label: 'Sales Count' },
    { key: 'avg_sale', label: 'Avg Sale' },
    { key: 'total_credit', label: 'Credit Outstanding' },
    { key: 'credit_customers', label: 'Credit Customers' },
    { key: 'products_count', label: 'Products' },
    { key: 'last_activity', label: 'Last Activity' },
  ];

  return (
    <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Shop Performance</h2>
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-4 py-2 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-700"
              >
                {col.label} {sortKey === col.key && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sortedShops.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
                No shop data available.
              </td>
            </tr>
          ) : (
            sortedShops.map((shop) => (
              <tr key={shop.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{shop.name}</td>
                <td className="px-4 py-2">GHS {Number(shop.total_sales).toFixed(2)}</td>
                <td className="px-4 py-2">{shop.sales_count}</td>
                <td className="px-4 py-2">GHS {Number(shop.avg_sale).toFixed(2)}</td>
                <td className="px-4 py-2">GHS {Number(shop.total_credit).toFixed(2)}</td>
                <td className="px-4 py-2">{shop.credit_customers}</td>
                <td className="px-4 py-2">{shop.products_count}</td>
                <td className="px-4 py-2">
                  {shop.last_activity
                    ? new Date(shop.last_activity).toLocaleDateString()
                    : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};