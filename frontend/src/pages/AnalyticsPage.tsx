import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { OverviewCards } from '../components/analytics/OverviewCards';
import { SalesTrendChart } from '../components/analytics/SalesTrendChart';
import { FeatureUsageChart } from '../components/analytics/FeatureUsageChart';
import { UserActivityChart } from '../components/analytics/UserActivityChart';
import { ShopPerformanceTable } from '../components/analytics/ShopPerformanceTable';
import { HealthPanel } from '../components/analytics/HealthPanel';
import {
  fetchOverview,
  fetchGrowth,
  fetchHealth,
  fetchFeatureUsage,
  fetchUserActivity,
  fetchShopPerformance,
} from '../services/analyticsApi';
import { Button } from '../components/Button';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overviewData, setOverviewData] = useState<any>(null);
  const [growthData, setGrowthData] = useState<any>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [featureUsageData, setFeatureUsageData] = useState<any>(null);
  const [userActivityData, setUserActivityData] = useState<any>(null);
  const [shopPerformanceData, setShopPerformanceData] = useState<any[] | null>(null);

  const getDefaultDateRange = () => {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    return { start, end };
  };

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDefaultDateRange();
      const [overviewRes, growthRes, healthRes, featureRes, userRes, shopRes] = await Promise.all([
        fetchOverview(),
        fetchGrowth(),
        fetchHealth(),
        fetchFeatureUsage(start, end),
        fetchUserActivity(start, end),
        fetchShopPerformance(),
      ]);

      setOverviewData(overviewRes.data);
      setGrowthData(growthRes.data);
      setHealthData(healthRes.data);
      setFeatureUsageData(featureRes.data);
      setUserActivityData(userRes.data);

      const shopData = shopRes.data;
      setShopPerformanceData(
        Array.isArray(shopData) ? shopData : shopData?.results ?? []
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.is_superuser) {
      navigate('/');
      return;
    }
    loadAllData();
  }, [user, navigate, loadAllData]);

  if (!user?.is_superuser) return null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Developer Analytics Dashboard</h1>
        <Button variant="secondary" onClick={loadAllData} disabled={loading}>
          <ArrowPathIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl">{error}</div>}

      {loading && !overviewData ? (
        <div className="text-center py-12">Loading analytics...</div>
      ) : (
        <>
          <OverviewCards data={overviewData} />
          <SalesTrendChart data={growthData} />
          <FeatureUsageChart data={featureUsageData} />
          <UserActivityChart data={userActivityData} />
          <ShopPerformanceTable data={shopPerformanceData} />
          <HealthPanel data={healthData} />
        </>
      )}
    </div>
  );
}