// src/pages/Dashboard.tsx (optimized)
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useProductStore } from '../stores/productStore';
import { useSalesStore } from '../stores/saleStore';
import { useUIStore } from '../stores/uiStore';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  BanknotesIcon,
  ChartBarIcon,
  ShoppingBagIcon,
  CubeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { CloudOffIcon } from '../components/icons/CloudOffIcon';
import api from '../services/api';

const toDateStr = (d: Date) => d.toISOString().split('T')[0];
const isInRange = (date: Date, start: string, end: string) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);
  return d >= s && d <= e;
};
const fm = (v: number) => `GHS ${v.toFixed(2)}`;
const fn = (v: number) => v.toLocaleString();

interface DashboardData {
  total_sales: number;
  profit: number;
  missing_cost_price: boolean;
  top_products: { name: string; total_sold: number }[];
  transaction_count: number;
  avg_sale: number;
  prev_total_sales?: number;
  prev_profit?: number;
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const { products, fetchProducts } = useProductStore();
  const { sales, fetchSales } = useSalesStore();
  const { addToast } = useUIStore();

  const [data, setData] = useState<DashboardData | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchingFresh, setFetchingFresh] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const todayStr = toDateStr(new Date());
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // 1. Load products & sales from stores (IndexedDB) as soon as possible
  useEffect(() => {
    Promise.all([fetchProducts(), fetchSales()]).finally(() => {
      setInitialLoadComplete(true);
    });
  }, [fetchProducts, fetchSales]);

  // 2. Compute offline dashboard from current products & sales (reactive)
  const offlineData = useMemo(() => {
    // If still loading and no data, return null (show skeleton)
    if (!initialLoadComplete && (products.length === 0 || sales.length === 0)) {
      return null;
    }

    const filtered = sales.filter(
      (s) => s.status === 'COMPLETED' && isInRange(new Date(s.createdAt), startDate, endDate)
    );

    let totalRevenue = 0;
    let totalCost = 0;
    let missingCostPrice = false;
    const productSales: Record<string, number> = {};

    for (const sale of filtered) {
      totalRevenue += sale.totalAmount;
      for (const item of sale.items) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod) {
          productSales[prod.name] = (productSales[prod.name] || 0) + item.quantity;
          if (prod.costPrice != null && !isNaN(prod.costPrice)) {
            totalCost += item.quantity * prod.costPrice;
          } else {
            missingCostPrice = true;
          }
        }
      }
    }

    const profit = totalRevenue - totalCost;
    const transaction_count = filtered.length;
    const avg_sale = transaction_count > 0 ? totalRevenue / transaction_count : 0;

    const top_products = Object.entries(productSales)
      .map(([name, total_sold]) => ({ name, total_sold }))
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, 5);

    return {
      total_sales: totalRevenue,
      profit,
      missing_cost_price: missingCostPrice,
      top_products,
      transaction_count,
      avg_sale,
    };
  }, [products, sales, startDate, endDate, initialLoadComplete]);

  // 3. Show cached data immediately when available
  useEffect(() => {
    if (offlineData) {
      setData(offlineData);
      setLastUpdated(new Date());
    }
  }, [offlineData]);

  // 4. Background refresh (stale-while-revalidate) – only if online
  const refreshFreshData = useCallback(async () => {
    if (!navigator.onLine) return;
    setFetchingFresh(true);
    try {
      const res = await api.get('/reports/dashboard/', { params: { start: startDate, end: endDate } });
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('[Dashboard] Fresh data fetch failed, keeping cached', err);
    } finally {
      setFetchingFresh(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (initialLoadComplete && navigator.onLine) {
      refreshFreshData();
    }
  }, [initialLoadComplete, refreshFreshData]);

  // 5. Online/offline listener
  useEffect(() => {
    const hOnline = () => {
      setIsOnline(true);
      refreshFreshData(); // refresh when coming online
    };
    const hOffline = () => setIsOnline(false);
    window.addEventListener('online', hOnline);
    window.addEventListener('offline', hOffline);
    return () => {
      window.removeEventListener('online', hOnline);
      window.removeEventListener('offline', hOffline);
    };
  }, [refreshFreshData]);

  // 6. Manual refresh
  const handleRefresh = () => {
    if (isOnline) {
      refreshFreshData();
    } else {
      addToast({ message: 'Offline – showing cached data', type: 'info' });
    }
  };

  // Derived values for UI
  const lowStockCount = products.filter(
    (p) => p.isActive && p.currentStock <= p.lowStockThreshold
  ).length;

  const salesTrend =
    data?.prev_total_sales != null && data.total_sales !== data.prev_total_sales
      ? ((data.total_sales - data.prev_total_sales) / data.prev_total_sales) * 100
      : null;
  const profitTrend =
    data?.prev_profit != null && data.profit !== data.prev_profit
      ? ((data.profit - data.prev_profit) / data.prev_profit) * 100
      : null;

  // Show skeleton only while initial data is being loaded from IndexedDB
  if (!initialLoadComplete && (products.length === 0 || sales.length === 0)) {
    return (
      <div className="p-4 space-y-5 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="h-7 w-40 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="h-10 w-28 bg-gray-200 rounded-lg" />
            <div className="h-10 w-10 bg-gray-200 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-2xl" />
          ))}
        </div>
        <div className="h-52 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  // If there is genuinely no data (empty store and no error), show a message
  if (!data && !initialLoadComplete) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading dashboard data...
      </div>
    );
  }

  const topProducts = data?.top_products ?? [];

  return (
    <div className="p-3 md:p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date(startDate).toLocaleDateString()} – {new Date(endDate).toLocaleDateString()}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-2 text-xs sm:text-sm bg-transparent outline-none min-w-0 flex-1"
            />
            <span className="text-gray-300 text-xs px-0.5">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-2 text-xs sm:text-sm bg-transparent outline-none min-w-0 flex-1"
            />
            <button
              onClick={() => {
                setStartDate(todayStr);
                setEndDate(todayStr);
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition touch-manipulation"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleRefresh}
              disabled={fetchingFresh}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-green-600 transition touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Last updated: ${lastUpdated?.toLocaleTimeString() || 'never'}`}
            >
              <ArrowPathIcon className={`h-5 w-5 ${fetchingFresh ? 'animate-spin' : ''}`} />
            </button>
            {!isOnline && (
              <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2.5 py-1.5 rounded-xl text-xs font-medium">
                <CloudOffIcon className="h-4 w-4" /> Offline
              </div>
            )}
          </div>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-400 -mt-3">Data as of {lastUpdated.toLocaleTimeString()}</p>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">Total Sales</span>
            <BanknotesIcon className="h-4 w-4 sm:h-5 sm:w-5 text-green-400" />
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
            {fm(data?.total_sales ?? 0)}
          </div>
          {salesTrend !== null && (
            <div className="flex items-center gap-1 mt-1.5 text-xs">
              {salesTrend >= 0 ? (
                <ChevronUpIcon className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5 text-red-500" />
              )}
              <span className={salesTrend >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Math.abs(salesTrend).toFixed(1)}% vs. previous
              </span>
            </div>
          )}
        </div>

        {user?.role === 'OWNER' && (
          <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">Profit</span>
              <ChartBarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
            </div>
            <div className={`text-lg sm:text-xl lg:text-2xl font-bold ${(data?.profit ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {fm(data?.profit ?? 0)}
            </div>
            {profitTrend !== null && (
              <div className="flex items-center gap-1 mt-1.5 text-xs">
                {profitTrend >= 0 ? (
                  <ChevronUpIcon className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <ChevronDownIcon className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className={profitTrend >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {Math.abs(profitTrend).toFixed(1)}% vs. previous
                </span>
              </div>
            )}
            {data?.missing_cost_price && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-yellow-600">
                <ExclamationTriangleIcon className="h-3 w-3" />
                <span>Missing cost prices</span>
              </div>
            )}
            {!isOnline && (
              <div className="text-xs text-yellow-600 mt-1">* Estimated from local data</div>
            )}
          </div>
        )}

        <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">Transactions</span>
            <ShoppingBagIcon className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400" />
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
            {fn(data?.transaction_count ?? 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1.5">
            Avg {data?.avg_sale ? fm(data.avg_sale) : '—'} per sale
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">Low Stock Items</span>
            <CubeIcon className="h-4 w-4 sm:h-5 sm:w-5 text-red-400" />
          </div>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-red-500">{lowStockCount}</div>
          <Link
            to="/inventory?filter=lowstock"
            className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline mt-1.5 touch-manipulation"
          >
            View inventory →
          </Link>
        </div>
      </div>

      {/* Top Selling Products */}
      <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">🏆 Top Selling Products</h2>
        {topProducts.length > 0 ? (
          <div className="space-y-3">
            {topProducts.map((p, idx) => {
              const max = topProducts[0].total_sold || 1;
              const percent = (p.total_sold / max) * 100;
              return (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-6 sm:w-5 flex-shrink-0 text-center">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">
                        {p.total_sold} sold
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">No sales data for the selected period</div>
        )}
      </div>
    </div>
  );
}