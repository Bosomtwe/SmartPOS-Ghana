import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

interface Props {
  data: any;
}

export const SalesTrendChart = ({ data }: Props) => {
  if (!data || !data.sales_daily) return null;

  const chartData = data.sales_daily.map((item: any) => ({
    date: item.day,
    amount: parseFloat(item.amount),
    count: item.count,
  }));

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="text-lg font-semibold mb-4">Sales Trend</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke="#0F6B3E" />
          <YAxis yAxisId="right" orientation="right" stroke="#E6A817" />
          <Tooltip />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="amount" name="Amount (GHS)" stroke="#0F6B3E" strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="count" name="Number of Sales" stroke="#E6A817" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};