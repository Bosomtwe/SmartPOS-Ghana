import { useEffect, useState } from 'react';
import { db } from '../lib/dexie';

export function DebugOffline() {
  const [counts, setCounts] = useState({ products: 0, customers: 0, sales: 0 });

  useEffect(() => {
    const load = async () => {
      const products = await db.products.toArray();
      const customers = await db.customers.toArray();
      const sales = await db.sales.toArray();
      setCounts({
        products: products.length,
        customers: customers.length,
        sales: sales.length,
      });
      console.log('IndexedDB content (first product):', products[0]);
    };
    load();
  }, []);

  return (
    <div className="fixed bottom-4 left-4 bg-black text-white text-xs p-2 rounded z-50">
      Products: {counts.products} | Customers: {counts.customers} | Sales: {counts.sales}
    </div>
  );
}