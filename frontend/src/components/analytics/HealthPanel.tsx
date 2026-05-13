interface Props {
  data: any;
}

export const HealthPanel = ({ data }: Props) => {
  if (!data) return null;

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="text-lg font-semibold mb-4">System Health</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="text-xs text-red-600">Voided Sales</p>
          <p className="text-xl font-bold">{data.voided_sales}</p>
          <p className="text-xs">{(data.void_rate * 100).toFixed(2)}% of total</p>
        </div>
        <div className="p-3 bg-yellow-50 rounded-lg">
          <p className="text-xs text-yellow-700">Failed Logins</p>
          <p className="text-xl font-bold">{data.failed_logins}</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-700">Inventory Adjustments</p>
          <p className="text-xl font-bold">{data.inventory_adjustments}</p>
        </div>
      </div>
    </div>
  );
};