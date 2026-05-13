// src/stores/syncStore.ts
import { create } from 'zustand';
import { db, type Sale, type CreditTransaction } from '../lib/dexie';
import api from '../services/api';
import { useUIStore } from './uiStore';
import { useCustomerStore } from './customerStore';
import { useProductStore } from './productStore';

const BATCH_SIZE = 50;

interface SyncState {
  pendingSales: number;
  isSyncing: boolean;
  addSale: (sale: Sale) => Promise<void>;
  sync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  pendingSales: 0,
  isSyncing: false,

  refreshPendingCount: async () => {
    try {
      const allSales = await db.sales.toArray();
      const unsynced = allSales.filter(s => !s.synced).length;
      set({ pendingSales: unsynced });
    } catch (err) {
      console.error('Failed to refresh pending count', err);
    }
  },

  addSale: async (sale) => {
    if (!sale.id || !sale.shopId || !sale.userId || typeof sale.totalAmount !== 'number' || !sale.items?.length) {
      console.error('Invalid sale object', sale);
      throw new Error('Sale missing required fields');
    }

    if (sale.paymentMethod === 'CREDIT' && sale.customerId) {
      const customer = useCustomerStore.getState().customers.find(c => c.id === sale.customerId);
      if (customer && customer.creditLimit !== undefined) {
        const newTotal = customer.totalCredit + sale.totalAmount;
        if (newTotal > customer.creditLimit) {
          console.warn(`Credit limit exceeded for ${customer.name}. Sale will still proceed (server already validated).`);
        }
      }
    }

    const saleToStore = { ...sale, synced: sale.synced ?? false, createdAt: sale.createdAt || new Date() };
    await db.sales.add(saleToStore);
    
    if (!saleToStore.synced) {
      set(state => ({ pendingSales: state.pendingSales + 1 }));
    }

    const productStore = useProductStore.getState();
    for (const item of sale.items) {
      try {
        productStore.updateProductStock(item.productId, -item.quantity);
      } catch (err) {
        console.error(`Failed to update stock for product ${item.productId}`, err);
      }
    }

    if (saleToStore.paymentMethod === 'CREDIT' && saleToStore.customerId && !saleToStore.synced) {
      const now = new Date();
      const debtTx: CreditTransaction = {
        id: crypto.randomUUID(),
        customerId: saleToStore.customerId,
        saleId: saleToStore.id,
        type: 'DEBT',
        amount: saleToStore.totalAmount,
        balanceAfter: 0,
        note: `Sale ${saleToStore.id.slice(0, 8)}`,
        createdAt: now,
        synced: false,
      };
      await db.creditTransactions.put(debtTx);

      const customerState = useCustomerStore.getState();
      const customer = customerState.customers.find(c => c.id === saleToStore.customerId);
      if (customer) {
        const newBalance = customer.totalCredit + saleToStore.totalAmount;
        await db.customers.update(saleToStore.customerId, { totalCredit: newBalance });
        useCustomerStore.setState(state => ({
          customers: state.customers.map(c =>
            c.id === saleToStore.customerId ? { ...c, totalCredit: newBalance } : c
          ),
        }));
      }
    }
  },

  sync: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    try {
      const allSales = await db.sales.toArray();

      const needRepair = allSales.filter(s => s.synced === undefined || s.synced === null);
      if (needRepair.length) {
        await Promise.all(needRepair.map(s => db.sales.update(s.id, { synced: false })));
      }

      const synced = allSales.filter(s => s.synced);
      const unsynced = allSales.filter(s => !s.synced);
      console.log(`[sync] Synced: ${synced.length}, Unsynced: ${unsynced.length}`);

      const duplicateIds: string[] = [];

      for (const uSale of unsynced) {
        if (uSale.idempotencyKey) {
          const exactMatch = synced.find(s => s.idempotencyKey === uSale.idempotencyKey);
          if (exactMatch) {
            console.log(`[sync] Duplicate via idempotency key: ${uSale.id}`);
            duplicateIds.push(uSale.id);
            continue;
          }
        }

        const match = synced.find(
          s =>
            s.id !== uSale.id &&
            s.totalAmount === uSale.totalAmount &&
            s.paymentMethod === uSale.paymentMethod &&
            s.customerId === uSale.customerId &&
            Math.abs(new Date(s.createdAt).getTime() - new Date(uSale.createdAt).getTime()) <= 10000
        );
        if (match) {
          console.log(`[sync] Duplicate via heuristic: ${uSale.id}`);
          duplicateIds.push(uSale.id);
        }
      }

      if (duplicateIds.length > 0) {
        await db.sales.bulkDelete(duplicateIds);
        useUIStore.getState().addToast({
          message: `${duplicateIds.length} duplicate sale(s) cleaned up.`,
          type: 'info',
        });
      }

      const cleanUnsynced = (await db.sales.toArray()).filter(s => !s.synced);
      if (cleanUnsynced.length === 0) {
        set({ pendingSales: 0, isSyncing: false });
        localStorage.removeItem('skipNextOnlineFetch');
        return;
      }

      // Process in batches
      let errors = 0;
      for (let i = 0; i < cleanUnsynced.length; i += BATCH_SIZE) {
        const batch = cleanUnsynced.slice(i, i + BATCH_SIZE);
        const payloadArray = batch.map(sale => ({
          id: sale.id,
          shop: sale.shopId,
          user: sale.userId,
          customer: sale.customerId,
          total_amount: sale.totalAmount,
          discount: sale.discount,
          payment_method: sale.paymentMethod,
          momo_number: sale.momoNumber || '',
          status: sale.status,
          items: sale.items.map(item => ({
            product: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total: item.total,
          })),
          idempotency_key: sale.idempotencyKey,
        }));

        console.log(`[sync] Sending batch ${Math.floor(i / BATCH_SIZE) + 1} (${payloadArray.length} sales)`);
        const response = await api.post('/sales/sync/', payloadArray);
        const results: any[] = response.data.results || [];

        for (const result of results) {
          const clientId = result.client_id || result.sale_id;
          if (!clientId) {
            errors++;
            continue;
          }
          if (result.status === 'success') {
            await db.sales.update(clientId, { synced: true, syncError: null });

            const localSale = await db.sales.get(clientId);
            if (localSale?.paymentMethod === 'CREDIT') {
              const localDebts = await db.creditTransactions
                .where({ saleId: clientId, type: 'DEBT' })
                .toArray();
              for (const debt of localDebts) {
                await db.creditTransactions.update(debt.id, { synced: true });
              }
            }
          } else {
            await db.sales.update(clientId, {
              synced: true,
              syncError: result.error || 'Unknown error',
            });
            errors++;
            useUIStore.getState().addToast({
              message: `Sale ${clientId} failed: ${result.error}`,
              type: 'error',
              duration: 10000,
            });
          }
        }
      }

      try {
        await useProductStore.getState().syncProducts();
      } catch (e) {
        console.error('Failed to sync products after sale sync', e);
      }

      try {
        await useCustomerStore.getState().refreshLocalBalances();
      } catch (e) {
        console.error('Failed to refresh customer balances', e);
      }

      const finalSales = await db.sales.toArray();
      const remaining = finalSales.filter(s => !s.synced).length;
      set({ pendingSales: remaining, isSyncing: false });

      localStorage.removeItem('skipNextOnlineFetch');

      if (remaining === 0 && errors === 0) {
        useUIStore.getState().addToast({
          message: 'All sales synced successfully',
          type: 'success',
        });
      }
    } catch (err: any) {
      let message = 'Sync failed. Please try again.';
      if (err.response?.status === 400) {
        const data = err.response.data;
        if (typeof data === 'string') message = data;
        else if (Array.isArray(data)) message = data.map((e: any) => e.error || JSON.stringify(e)).join('; ');
        else if (typeof data === 'object') message = Object.values(data).flat().join(' ');
      } else if (err.message) {
        message = err.message;
      }
      console.error('[sync] Sync error:', err);
      useUIStore.getState().addToast({ message, type: 'error', duration: 8000 });
      set({ isSyncing: false });
    }
  },
}));