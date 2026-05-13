interface OverviewCardsProps {
  data: any;
}

export const OverviewCards = ({ data }: OverviewCardsProps) => {
  if (!data) return null;

  const cards = [
    { title: 'Total Shops', value: data.total_shops },
    { title: 'Total Users', value: data.total_users },
    { title: 'Active Shops (7d)', value: data.active_shops_7d },
    { title: 'GMV', value: `GHS ${data.gmv}` },
    { title: 'Avg Sale', value: `GHS ${data.avg_sale_amount}` },
    { title: 'Total Sales', value: data.total_sales_count },
    { title: 'Owners / Cashiers', value: `${data.total_owners} / ${data.total_cashiers}` },
    { title: 'Products', value: data.total_products },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.title} className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">{card.title}</p>
          <p className="text-2xl font-bold mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
};