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

export const UserActivityChart = ({ data }: Props) => {
  if (!data) return null;

  const ownersMap = data.active_owners || {};
  const cashiersMap = data.active_cashiers || {};
  const allDates = new Set([...Object.keys(ownersMap), ...Object.keys(cashiersMap)]);
  const chartData = Array.from(allDates).sort().map((date) => ({
    date,
    owners: ownersMap[date] || 0,
    cashiers: cashiersMap[date] || 0,
  }));

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="text-lg font-semibold mb-4">Daily Active Users</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="owners" name="Owners" stroke="#0F6B3E" strokeWidth={2} />
          <Line type="monotone" dataKey="cashiers" name="Cashiers" stroke="#E6A817" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};