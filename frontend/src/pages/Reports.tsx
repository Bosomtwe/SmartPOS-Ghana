// src/pages/Reports.tsx
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import { db, type Customer } from '../lib/dexie';

interface SaleDisplay {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  customer_name?: string;
  items: { product_detail?: { name: string }; quantity: number }[];
}

interface TopProduct {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
}

// ==================== HELPER: Resolve product names from IndexedDB ====================
async function getProductNameMap(productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const products = await db.products.bulkGet(productIds);
  const map = new Map<string, string>();
  products.forEach((p, idx) => {
    if (p) map.set(productIds[idx], p.name);
  });
  return map;
}

// ==================== DEBUG: Log a sale item warning ====================
function logMissingNameWarning(saleId: string, productId: string, storedName: string | undefined, realName: string | undefined) {
  if (!storedName || storedName === 'Unknown Product') {
    console.warn(`[Reports] Sale ${saleId} item product ${productId} has stored name "${storedName}". Real product name: ${realName || 'NOT IN PRODUCTS TABLE'}`);
  }
}

export default function Reports() {
  const { token, shop } = useAuthStore();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sales, setSales] = useState<SaleDisplay[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTop, setLoadingTop] = useState(false);
  const [error, setError] = useState('');

  // Sales pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Top products pagination
  const [topPage, setTopPage] = useState(1);
  const [topTotalPages, setTopTotalPages] = useState(0);
  const [topTotalCount, setTopTotalCount] = useState(0);
  const topPageSize = 10;

  // ----- OFFLINE DATA FETCHERS (FIXED & DEBUGGED) -----
  const fetchSalesLocal = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError('');

    try {
      const shopId = shop?.id || localStorage.getItem('shopId');
      if (!shopId) throw new Error('Shop not found');

      // 1. Get all sales for this shop
      let allSales = await db.sales.where('shopId').equals(shopId).toArray();
      if (allSales.length === 0) allSales = await db.sales.toArray();
      console.log(`[DEBUG] Found ${allSales.length} sales in IndexedDB`);

      // 2. Filter by date range
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const filtered = allSales.filter(sale => {
        const saleDate = new Date(sale.createdAt);
        return saleDate >= start && saleDate <= end && sale.status === 'COMPLETED';
      });
      console.log(`[DEBUG] ${filtered.length} sales after date filter`);

      // 3. Collect all unique product IDs from these sales
      const allProductIds = new Set<string>();
      filtered.forEach(sale => {
        sale.items.forEach(item => allProductIds.add(item.productId));
      });
      console.log(`[DEBUG] Unique product IDs needed: ${Array.from(allProductIds).length}`);

      // 4. Fetch product names from IndexedDB
      const productNameMap = await getProductNameMap(Array.from(allProductIds));
      console.log(`[DEBUG] Resolved product names for ${productNameMap.size} products`);

      // 5. Fetch customers (for names)
      const allCustomers = await db.customers.toArray();
      const customerMap = new Map<string, Customer>();
      allCustomers.forEach(c => customerMap.set(c.id, c));

      // 6. Transform sales, filling missing product names from the map
      const transformed = filtered.map(sale => {
        const enrichedItems = sale.items.map(item => {
          const realName = productNameMap.get(item.productId);
          // Debug warning if stored name is missing or differs
          logMissingNameWarning(sale.id, item.productId, item.name, realName);

          return {
            product_detail: { name: realName || item.name || 'Product' },
            quantity: item.quantity,
          };
        });

        return {
          id: sale.id,
          created_at: sale.createdAt.toISOString(),
          total_amount: sale.totalAmount,
          payment_method: sale.paymentMethod,
          customer_name: sale.customerId ? customerMap.get(sale.customerId)?.name || 'Guest' : 'Guest',
          items: enrichedItems,
        };
      });

      // 7. Sort newest first
      transformed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTotalCount(transformed.length);
      setTotalPages(Math.ceil(transformed.length / pageSize));
      const startIdx = (page - 1) * pageSize;
      const paged = transformed.slice(startIdx, startIdx + pageSize);
      setSales(paged);
    } catch (err: any) {
      console.error('[DEBUG] fetchSalesLocal error:', err);
      setError(err.message || 'Failed to load local sales');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopProductsLocal = async () => {
    if (!startDate || !endDate) return;
    setLoadingTop(true);

    try {
      const shopId = shop?.id || localStorage.getItem('shopId');
      if (!shopId) throw new Error('Shop not found');

      let allSales = await db.sales.where('shopId').equals(shopId).toArray();
      if (allSales.length === 0) allSales = await db.sales.toArray();

      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const filteredSales = allSales.filter(sale => {
        const saleDate = new Date(sale.createdAt);
        return saleDate >= start && saleDate <= end && sale.status === 'COMPLETED';
      });

      // Accumulate quantities & revenue per product
      const productMap = new Map<string, { quantity: number; revenue: number; nameHint: string }>();
      for (const sale of filteredSales) {
        for (const item of sale.items) {
          const existing = productMap.get(item.productId);
          if (existing) {
            existing.quantity += item.quantity;
            existing.revenue += item.total;
          } else {
            productMap.set(item.productId, {
              quantity: item.quantity,
              revenue: item.total,
              nameHint: item.name || '',
            });
          }
        }
      }

      // Resolve real product names from the products table
      const allProductIds = Array.from(productMap.keys());
      const productNameMap = await getProductNameMap(allProductIds);

      // Build final array with correct names
      let products = Array.from(productMap.entries()).map(([id, data]) => {
        const realName = productNameMap.get(id);
        if (!realName) {
          console.warn(`[DEBUG] Top products: product ${id} not found in products table. Using stored name hint: "${data.nameHint}"`);
        }
        return {
          product_id: id,
          product_name: realName || data.nameHint || 'Unknown Product',
          total_quantity: data.quantity,
          total_revenue: data.revenue,
        };
      });

      products.sort((a, b) => b.total_quantity - a.total_quantity);

      setTopTotalCount(products.length);
      setTopTotalPages(Math.ceil(products.length / topPageSize));
      const startIdx = (topPage - 1) * topPageSize;
      const paged = products.slice(startIdx, startIdx + topPageSize);
      setTopProducts(paged);
    } catch (err: any) {
      console.error('[DEBUG] fetchTopProductsLocal error:', err);
    } finally {
      setLoadingTop(false);
    }
  };

  // ----- ONLINE DATA FETCHERS (unchanged) -----
  const fetchSalesOnline = async (resetPage = true) => {
    if (!navigator.onLine) return;
    if (!startDate || !endDate) return;
    if (resetPage) setPage(1);
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/reports/sales/json/', {
        params: {
          start_date: startDate,
          end_date: endDate,
          page: resetPage ? 1 : page,
          page_size: pageSize,
        },
      });
      setSales(res.data.results);
      setTotalCount(res.data.count);
      setTotalPages(Math.ceil(res.data.count / pageSize));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopProductsOnline = async (resetPage = true) => {
    if (!navigator.onLine) return;
    if (!startDate || !endDate) return;
    if (resetPage) setTopPage(1);
    setLoadingTop(true);
    try {
      const res = await api.get('/reports/top-products/', {
        params: {
          start_date: startDate,
          end_date: endDate,
          page: resetPage ? 1 : topPage,
          page_size: topPageSize,
        },
      });
      setTopProducts(res.data.results);
      setTopTotalCount(res.data.count);
      setTopTotalPages(Math.ceil(res.data.count / topPageSize));
    } catch (err: any) {
      console.error('Failed to load top products', err);
    } finally {
      setLoadingTop(false);
    }
  };

  // Main loader
  const loadData = (resetPage = true) => {
    if (!startDate || !endDate) return;
    if (navigator.onLine) {
      fetchSalesOnline(resetPage);
      fetchTopProductsOnline(resetPage);
    } else {
      fetchSalesLocal();
      fetchTopProductsLocal();
    }
  };

  useEffect(() => {
    if (startDate && endDate) loadData(true);
  }, [startDate, endDate]);

  useEffect(() => {
    if (startDate && endDate && navigator.onLine && page > 1) fetchSalesOnline(false);
    else if (!navigator.onLine && page) fetchSalesLocal();
  }, [page]);

  useEffect(() => {
    if (startDate && endDate && navigator.onLine && topPage > 1) fetchTopProductsOnline(false);
    else if (!navigator.onLine && topPage) fetchTopProductsLocal();
  }, [topPage]);

  const downloadCSV = async () => {
    if (!startDate || !endDate) return;
    if (!navigator.onLine) {
      setError('Cannot download CSV while offline. Please reconnect.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/v1/reports/sales/?start_date=${startDate}&end_date=${endDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_${startDate}_to_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download CSV');
    } finally {
      setLoading(false);
    }
  };

  const goToNextPage = () => { if (page < totalPages) setPage(p => p + 1); };
  const goToPrevPage = () => { if (page > 1) setPage(p => p - 1); };
  const goToNextTopPage = () => { if (topPage < topTotalPages) setTopPage(p => p + 1); };
  const goToPrevTopPage = () => { if (topPage > 1) setTopPage(p => p - 1); };

  const toNumber = (value: number | string | undefined): number => {
    if (value === undefined || value === null) return 0;
    return typeof value === 'number' ? value : parseFloat(value);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Sales Reports</h1>

      {!navigator.onLine && (
        <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-lg flex items-center gap-2">
          <span className="inline-block w-3 h-3 bg-yellow-600 rounded-full"></span>
          You are offline. Showing cached data.
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-end mb-6">
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
          onClick={downloadCSV}
          disabled={!startDate || !endDate || loading || !navigator.onLine}
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Downloading...' : 'Download CSV'}
        </button>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {!startDate || !endDate ? (
        <div className="bg-yellow-50 p-4 rounded-lg text-yellow-800">
          Please select a date range to view sales.
        </div>
      ) : (
        <>
          {/* Top Selling Products */}
          <div className="mb-8 bg-white rounded-xl shadow p-4">
            <h2 className="text-xl font-semibold mb-4">🏆 Top Selling Products</h2>
            {loadingTop ? (
              <div className="text-center py-4">Loading top products...</div>
            ) : topProducts.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No sales data for this period.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantity Sold</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Revenue (GHS)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {topProducts.map((product, idx) => {
                        const globalRank = (topPage - 1) * topPageSize + idx + 1;
                        return (
                          <tr key={product.product_id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm font-medium">{globalRank}</td>
                            <td className="px-4 py-2 text-sm">{product.product_name}</td>
                            <td className="px-4 py-2 text-sm text-right">{product.total_quantity}</td>
                            <td className="px-4 py-2 text-sm text-right">{product.total_revenue.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {topTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-2 border-t">
                    <div className="text-sm text-gray-500">
                      Showing {((topPage - 1) * topPageSize) + 1} to {Math.min(topPage * topPageSize, topTotalCount)} of {topTotalCount}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={goToPrevTopPage} disabled={topPage === 1} className="px-3 py-1 border rounded disabled:opacity-50">Previous</button>
                      <button onClick={goToNextTopPage} disabled={topPage === topTotalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sales Transactions */}
          <div className="bg-white rounded-xl shadow">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold">Sales Transactions</h2>
            </div>
            {loading && sales.length === 0 ? (
              <div className="text-center py-8">Loading sales...</div>
            ) : sales.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No sales found for this period.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-mono">{sale.id.slice(0, 8)}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            {new Date(sale.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-bold">
                            GHS {toNumber(sale.total_amount).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm">{sale.payment_method}</td>
                          <td className="px-4 py-3 text-sm">{sale.customer_name || 'Guest'}</td>
                          <td className="px-4 py-3 text-sm">
                            {sale.items.map((item, idx) => (
                              <div key={idx}>{item.product_detail?.name || 'Product'} x{item.quantity}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-sm text-gray-500">
                      Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={goToPrevPage} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50">Previous</button>
                      <button onClick={goToNextPage} disabled={page === totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}