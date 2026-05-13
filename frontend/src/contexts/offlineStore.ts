import { create } from 'zustand';
import { db } from '../lib/dexie';
import type { Sale } from '../lib/dexie';
import api from '../services/api';

interface OfflineState {
  pendingSales: Sale[];
  addSale: (sale: Sale) => Promise<void>;
  sync: () => Promise<void>;
}

export const useOfflineStore = create<OfflineState>((set) => ({   // removed 'get'
  pendingSales: [],
  addSale: async (sale) => {
    await db.sales.add({ ...sale, synced: false });
    set((state) => ({ pendingSales: [...state.pendingSales, sale] }));
  },
  sync: async () => {
    const unsynced = await db.sales.where('synced').equals(false as any).toArray();   // cast to any
    if (unsynced.length === 0) return;

    const payload = unsynced.map((sale) => ({
      ...sale,
      items: sale.items.map((item) => ({
        product: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.total,
      })),
      customer: sale.customerId,
      total_amount: sale.totalAmount,
      discount: sale.discount,
      payment_method: sale.paymentMethod,
    }));

    try {
      const response = await api.post('/sales/sync/', payload);
      const results = response.data.results;

      for (let i = 0; i < unsynced.length; i++) {
        const sale = unsynced[i];
        const result = results.find((r: any) => r.sale_id === sale.id);
        if (result && result.status === 'success') {
          await db.sales.update(sale.id, { synced: true });
        } else {
          console.error('Sync failed for sale', sale.id, result?.error);
        }
      }

      const stillPending = await db.sales.where('synced').equals(false as any).toArray();   // cast to any
      set({ pendingSales: stillPending });
    } catch (error) {
      console.error('Sync batch failed', error);
      throw error;
    }
  },
}));