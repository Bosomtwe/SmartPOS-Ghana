// src/stores/syncStore.ts
import { create } from 'zustand';
import { db, type Sale, type CreditTransaction } from '../lib/dexie';
import api from '../services/api';
import { useUIStore } from './uiStore';
import { useCustomerStore } from './customerStore';
import { useProductStore } from './productStore';
import { useProductMutationStore } from './productMutationStore';
import { useSalesStore, toCamelSale } from './saleStore';
import { useAuthStore } from './authStore';

const BATCH_SIZE = 100;
const RETRY_COOLDOWN_MS = 10000;

interface SyncState {
  pendingSales: number;
  isSyncing: boolean;
  lastSyncAttempt: number;
  addSale: (sale: Sale) => Promise<void>;
  sync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  pendingSales: 0,
  isSyncing: false,
  lastSyncAttempt: 0,

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
          console.warn(`Credit limit exceeded for ${customer.name}. Sale will still proceed.`);
        }
      }
    }

    const saleToStore = {
      ...sale,
      synced: sale.synced ?? false,
      createdAt: sale.createdAt || new Date(),
      isBackdated: sale.isBackdated || false,
      originalCreatedAt: sale.originalCreatedAt || null,
    };

    await db.sales.add(saleToStore);

    const currentSales = useSalesStore.getState().sales;
    if (!currentSales.some(s => s.id === saleToStore.id)) {
      useSalesStore.setState({
        sales: [saleToStore, ...currentSales],
      });
    }

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
    if (!navigator.onLine) {
      console.log('[sync] Offline – skipping sync');
      return;
    }

    // Don't sync when nobody is logged in (e.g. an 'online' event fires
    // right after logout, before the next login has completed).
    const authAtStart = useAuthStore.getState();
    if (!authAtStart.token || !authAtStart.shop?.id) {
      console.log('[sync] No authenticated session – skipping sync');
      return;
    }
    const sessionKeyAtStart = `${authAtStart.user?.id || ''}:${authAtStart.shop.id}`;

    // Bails out of applying any further results if the logged-in user/shop
    // changed while this sync was awaiting a network/DB call. Without this,
    // a sync started under one account can finish writing sales/products/
    // customer balances into the stores AFTER a different account has
    // logged in, silently mixing data between sessions.
    const sessionChanged = () =>
      `${useAuthStore.getState().user?.id || ''}:${useAuthStore.getState().shop?.id || ''}` !== sessionKeyAtStart;

    if (get().isSyncing) {
      console.log('[sync] Already syncing – skipping');
      return;
    }

    const now = Date.now();
    if (now - get().lastSyncAttempt < RETRY_COOLDOWN_MS) {
      console.log('[sync] Cooldown active – skipping');
      return;
    }

    set({ isSyncing: true, lastSyncAttempt: now });

    try {
      const allSales = await db.sales.toArray();
      const needRepair = allSales.filter(s => s.synced === undefined || s.synced === null);
      if (needRepair.length) {
        await Promise.all(needRepair.map(s => db.sales.update(s.id, { synced: false })));
      }

      const synced = allSales.filter(s => s.synced);
      const unsynced = allSales.filter(s => !s.synced);
      console.log(`[sync] Synced: ${synced.length}, Unsynced: ${unsynced.length}`);

      if (unsynced.length === 0) {
        console.log('[sync] No unsynced sales – done.');
        set({ pendingSales: 0, isSyncing: false });
        localStorage.removeItem('skipNextOnlineFetch');
        return;
      }

      const duplicateIds: string[] = [];
      if (synced.length > 0) {
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
        console.log('[sync] All unsynced sales were duplicates – done.');
        set({ pendingSales: 0, isSyncing: false });
        localStorage.removeItem('skipNextOnlineFetch');
        return;
      }

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
          created_at: sale.isBackdated ? sale.createdAt.toISOString() : undefined,
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

        if (sessionChanged()) {
          console.warn('[sync] Session changed mid-sync – aborting before applying results to avoid cross-account data mixing');
          set({ isSyncing: false });
          return;
        }

        const results: any[] = response.data.results || [];

        for (const result of results) {
          const clientId = result.client_id || result.sale_id;
          console.log(`[sync] Processing result for clientId: ${clientId}`, result);
          if (!clientId) {
            errors++;
            console.warn('[sync] Result missing clientId/sale_id', result);
            continue;
          }

          if (result.status === 'success') {
            const originalSale = await db.sales.get(clientId);
            console.log(`[sync] Original sale found:`, originalSale);

            if (result.sale) {
              // ✅ Await the async toCamelSale
              const serverSale = await toCamelSale(result.sale);
              console.log(`[sync] Server sale received:`, serverSale);

              // Preserve fields that the server may not return
              if (originalSale) {
                serverSale.shopId = originalSale.shopId;
                serverSale.userId = originalSale.userId;
                serverSale.userPhone = originalSale.userPhone || '';
                serverSale.customerId = originalSale.customerId;

                if (originalSale.isBackdated && originalSale.createdAt) {
                  serverSale.createdAt = originalSale.createdAt;
                  serverSale.isBackdated = true;
                  serverSale.originalCreatedAt = originalSale.originalCreatedAt || null;
                } else {
                  serverSale.isBackdated = false;
                  serverSale.originalCreatedAt = null;
                }
              }

              serverSale.synced = true;

              // Update IndexedDB
              if (originalSale) {
                await db.sales.delete(clientId);
                console.log(`[sync] Deleted local sale ${clientId}`);
              }
              await db.sales.put(serverSale);
              console.log(`[sync] Inserted server sale ${serverSale.id} with synced=true`);

              // Update in‑memory store
              useSalesStore.setState((state) => ({
                sales: state.sales.map(s => s.id === clientId ? serverSale : s)
              }));

              set(state => ({ pendingSales: Math.max(0, state.pendingSales - 1) }));

              if (serverSale.paymentMethod === 'CREDIT') {
                const debts = await db.creditTransactions
                  .filter(tx => tx.saleId === clientId && tx.type === 'DEBT')
                  .toArray();
                console.log(`[sync] Found ${debts.length} credit debts to update`);
                for (const debt of debts) {
                  if (debt.saleId === clientId) {
                    await db.creditTransactions.update(debt.id, { saleId: serverSale.id, synced: true });
                  } else {
                    await db.creditTransactions.update(debt.id, { synced: true });
                  }
                }
              }
            } else {
              // No server sale object – fallback: mark as synced
              console.warn(`[sync] No server sale object for ${clientId}, marking as synced anyway`);
              await db.sales.update(clientId, { synced: true, syncError: null });
              useSalesStore.setState((state) => ({
                sales: state.sales.map(s => s.id === clientId ? { ...s, synced: true } : s)
              }));
              set(state => ({ pendingSales: Math.max(0, state.pendingSales - 1) }));
            }
          } else {
            // Sync failed
            const errorMsg = result.error || '';
            if (errorMsg.includes('Products not found')) {
              await db.sales.delete(clientId);
              console.warn(`[sync] Deleted local sale ${clientId} because product(s) not found on server.`);
              useSalesStore.setState((state) => ({
                sales: state.sales.filter(s => s.id !== clientId)
              }));
              set(state => ({ pendingSales: Math.max(0, state.pendingSales - 1) }));
              useUIStore.getState().addToast({
                message: `Sale ${clientId.slice(0, 8)} was removed because product(s) no longer exist.`,
                type: 'warning',
                duration: 8000,
              });
              continue;
            }

            console.warn(`[sync] Sync failed for ${clientId}: ${result.error}`);
            await db.sales.update(clientId, {
              synced: false,
              syncError: result.error || 'Unknown error',
            });
            errors++;
            useUIStore.getState().addToast({
              message: `Sale ${clientId.slice(0, 8)} failed: ${result.error} (will retry)`,
              type: 'warning',
              duration: 10000,
            });
          }
        }
      }

      if (sessionChanged()) {
        console.warn('[sync] Session changed mid-sync – skipping trailing product/customer/mutation resync');
        set({ isSyncing: false });
        return;
      }

      try {
        await useProductStore.getState().syncProducts();
        console.log('[sync] Synced products after sale sync');
      } catch (e) {
        console.error('Failed to sync products after sale sync', e);
      }

      if (sessionChanged()) {
        set({ isSyncing: false });
        return;
      }

      try {
        await useCustomerStore.getState().refreshLocalBalances();
        console.log('[sync] Refreshed customer balances');
      } catch (e) {
        console.error('Failed to refresh customer balances', e);
      }

      if (sessionChanged()) {
        set({ isSyncing: false });
        return;
      }

      try {
        await useProductMutationStore.getState().syncMutations();
        console.log('[sync] Synced product mutations');
      } catch (e) {
        console.error('Failed to sync product mutations after sale sync', e);
      }

      if (sessionChanged()) {
        console.warn('[sync] Session changed mid-sync – discarding final pending count update');
        set({ isSyncing: false });
        return;
      }

      const finalSales = await db.sales.toArray();
      const remaining = finalSales.filter(s => !s.synced).length;
      console.log(`[sync] Final unsynced count: ${remaining}`);
      set({ pendingSales: remaining, isSyncing: false });

      localStorage.removeItem('skipNextOnlineFetch');

      if (remaining === 0 && errors === 0) {
        useUIStore.getState().addToast({
          message: 'All sales synced successfully',
          type: 'success',
        });
      } else if (remaining > 0) {
        console.warn(`[sync] ${remaining} sales still unsynced after sync.`);
      }
    } catch (err: any) {
      if (
        err?.message === 'Network Error' ||
        err?.code === 'ERR_NETWORK' ||
        (err?.response === undefined && err?.request !== undefined)
      ) {
        console.log('[sync] Network unavailable – will retry when back online.');
      } else {
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
      }
    } finally {
      set({ isSyncing: false });
      await get().refreshPendingCount();
      console.log(`[sync] Sync finished. Pending count: ${get().pendingSales}`);
    }
  },
}));