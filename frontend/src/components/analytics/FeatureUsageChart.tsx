import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

interface DataPoint {
  date: string;
  count: number;
}

interface FeatureSeries {
  action: string;
  data: DataPoint[];
}

interface FeatureUsageResponse {
  start: string;
  end: string;
  series: FeatureSeries[];
}

interface Props {
  data: FeatureUsageResponse | null;
}

const actionLabels: Record<string, string> = {
  SALE_CREATE: 'Sales',
  PRODUCT_CREATE: 'Product Created',
  STOCK_ADJUST: 'Stock Adjusted',
  PRICE_CHANGE: 'Price Changed',
  CUSTOMER_CREATE: 'Customer Created',
  LOGIN: 'Logins',
};

const colors = ['#0F6B3E', '#E6A817', '#3B82F6', '#DC2626', '#8B5CF6', '#10B981'];

// Custom tooltip – constrained width
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow p-2 max-w-[200px] text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex justify-between gap-4">
          <span style={{ color: entry.color }}>{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export const FeatureUsageChart = ({ data }: Props) => {
  if (!data || !data.series || data.series.length === 0) return null;

  const dateMap: Record<string, Record<string, number>> = {};
  data.series.forEach((series) => {
    series.data.forEach((point) => {
      if (!dateMap[point.date]) {
        dateMap[point.date] = { date: point.date } as any;
      }
      (dateMap[point.date] as any)[series.action] = point.count;
    });
  });

  const chartData = Object.values(dateMap).sort(
    (a: any, b: any) => a.date.localeCompare(b.date)
  );

  const actionsWithData = data.series.map((s) => s.action).filter(Boolean);

  // Shorten date labels for mobile: "2026-05-01" → "May 1"
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Feature Usage (last 30 days)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            interval="preserveStartEnd"
            tick={{ fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: 10 }} />
          {actionsWithData.map((action, index) => (
            <Bar
              key={action}
              dataKey={action}
              name={actionLabels[action] || action}
              stackId="a"
              fill={colors[index % colors.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};