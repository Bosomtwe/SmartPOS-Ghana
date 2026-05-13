// src/stores/customerStore.ts
import { create } from 'zustand';
import { db, type Customer, type CreditTransaction } from '../lib/dexie';
import api from '../services/api';
import { useAuthStore } from './authStore';
import { useUIStore } from './uiStore';
import { useSalesStore } from './saleStore';
import type { Sale } from '../lib/dexie';

interface CustomerState {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  manuallySyncing: boolean;
  fetchCustomers: () => Promise<void>;
  createCustomer: (data: Partial<Customer>) => Promise<void>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  recordPayment: (customerId: string, amount: number, note?: string, saleId?: string) => Promise<any>;
  syncCreditPayments: () => Promise<void>;
  refreshLocalBalances: () => Promise<void>;
}

const parseCustomerFromApi = (raw: any): Customer => ({
  id: raw.id,
  name: raw.name,
  phone: raw.phone || '',
  totalCredit: Number(raw.total_credit),
  creditLimit: raw.credit_limit !== null ? Number(raw.credit_limit) : undefined,
  shopId: raw.shop,
});

const toCamelSale = (raw: any): Sale => ({
  id: raw.id,
  shopId: raw.shop,
  userId: raw.user,
  customerId: raw.customer || undefined,
  totalAmount: parseFloat(raw.total_amount),
  discount: parseFloat(raw.discount || 0),
  paymentMethod: raw.payment_method,
  momoNumber: raw.momo_number || undefined,
  status: raw.status,
  voidReason: raw.void_reason || undefined,
  createdAt: new Date(raw.created_at),
  items: (raw.items || []).map((item: any) => ({
    productId: item.product,
    quantity: item.quantity,
    unitPrice: parseFloat(item.unit_price),
    total: parseFloat(item.total),
  })),
  synced: true,
  totalPaid: parseFloat(raw.total_paid || 0),
  balance: parseFloat(raw.balance || 0),
  idempotencyKey: '',
});

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  loading: false,
  error: null,
  manuallySyncing: false,

  fetchCustomers: async () => {
    set({ loading: true, error: null });
    const shop = useAuthStore.getState().shop;
    if (!shop) {
      set({ loading: false, customers: [] });
      return;
    }

    try {
      // 1. Show cached customers for current shop
      const allCached = await db.customers.toArray();
      const shopCached = allCached.filter(c => c.shopId === shop.id);
      set({ customers: shopCached, loading: false });

      // 2. Fetch fresh data from server if online and not in restore mode
      if (navigator.onLine && localStorage.getItem('skipNextOnlineFetch') !== 'true') {
        const allTxs = await db.creditTransactions.toArray();
        const hasUnsynced = allTxs.some(tx => !tx.synced);
        const response = await api.get('/customers/');
        const parsed: Customer[] = response.data.map(parseCustomerFromApi);

        if (!hasUnsynced) {
          await db.customers.bulkPut(parsed);
          set({ customers: parsed, loading: false });
        } else {
          // Merge local balances with fresh server list to preserve unsynced payments
          const merged = parsed.map((customer) => {
            const local = shopCached.find(c => c.id === customer.id);
            if (local && local.totalCredit !== customer.totalCredit) {
              return { ...customer, totalCredit: local.totalCredit };
            }
            return customer;
          });
          await db.customers.bulkPut(merged);
          set({ customers: merged, loading: false });
        }
      }
    } catch (err: any) {
      const current = get().customers;
      if (current.length === 0) {
        set({ error: err.message || 'Failed to load customers', loading: false });
      } else {
        set({ loading: false });
      }
    }
  },

  createCustomer: async (data) => {
    const shop = useAuthStore.getState().shop;
    if (navigator.onLine) {
      const response = await api.post('/customers/', {
        name: data.name,
        phone: data.phone,
        credit_limit: data.creditLimit,
      });
      const newCust = parseCustomerFromApi(response.data);
      await db.customers.put(newCust);
      set((state) => ({ customers: [...state.customers, newCust] }));
    } else {
      const id = crypto.randomUUID();
      const cust: Customer = {
        id,
        name: data.name!,
        phone: data.phone || '',
        totalCredit: 0,
        creditLimit: data.creditLimit ?? undefined,
        shopId: shop?.id || '',
      };
      await db.customers.put(cust);
      set((state) => ({ customers: [...state.customers, cust] }));
    }
  },

  updateCustomer: async (id, data) => {
    if (navigator.onLine) {
      const response = await api.patch(`/customers/${id}/`, {
        name: data.name,
        phone: data.phone,
        credit_limit: data.creditLimit,
      });
      const updated = parseCustomerFromApi(response.data);
      await db.customers.put(updated);
      set((state) => ({
        customers: state.customers.map((c) => (c.id === id ? updated : c)),
      }));
    } else {
      const existing = get().customers.find((c) => c.id === id);
      if (!existing) throw new Error('Customer not found');
      const merged = { ...existing, ...data };
      await db.customers.put(merged);
      set((state) => ({
        customers: state.customers.map((c) => (c.id === id ? merged : c)),
      }));
    }
  },

  deleteCustomer: async (id) => {
    if (navigator.onLine) {
      await api.delete(`/customers/${id}/`);
    }
    await db.customers.delete(id);
    set((state) => ({
      customers: state.customers.filter((c) => c.id !== id),
    }));
  },

  recordPayment: async (customerId, amount, note, saleId) => {
    // ... (unchanged, already correct) ...
    set({ manuallySyncing: true });

    const timestamp = new Date();
    const localTxId = crypto.randomUUID();

    const tx: CreditTransaction = {
      id: localTxId,
      customerId,
      type: 'PAYMENT',
      amount: -amount,
      balanceAfter: 0,
      note: note || 'Payment',
      createdAt: timestamp,
      synced: false,
      saleId: saleId || undefined,
    };
    await db.creditTransactions.add(tx);

    const customer = get().customers.find((c) => c.id === customerId);
    if (!customer) {
      set({ manuallySyncing: false });
      throw new Error('Customer not found');
    }

    if (!navigator.onLine) {
      const newBalance = Math.max(0, customer.totalCredit - amount);
      const updated = get().customers.map((c) =>
        c.id === customerId ? { ...c, totalCredit: newBalance } : c
      );
      set({ customers: updated, manuallySyncing: false });
      await db.customers.update(customerId, { totalCredit: newBalance });
      useUIStore.getState().addToast({
        message: `Payment of GHS ${amount.toFixed(2)} recorded (offline)`,
        type: 'success',
      });
      return;
    }

    try {
      const payload: any = {
        amount,
        note,
        idempotency_key: localTxId,
      };
      if (saleId) payload.sale_id = saleId;

      const response = await api.post(`/customers/${customerId}/record_payment/`, payload);
      const newBalance = response.data.new_balance;

      await db.creditTransactions.update(localTxId, {
        synced: true,
        balanceAfter: newBalance,
      });

      set((state) => ({
        customers: state.customers.map((c) =>
          c.id === customerId ? { ...c, totalCredit: newBalance } : c
        ),
      }));
      await db.customers.update(customerId, { totalCredit: newBalance });

      useSalesStore.getState().fetchSales().catch(console.error);

      if (saleId) {
        (async () => {
          try {
            const saleResponse = await api.get(`/sales/${saleId}/`);
            const apiSale = toCamelSale(saleResponse.data);
            const localSale = await db.sales.get(saleId);
            if (localSale?.idempotencyKey) {
              apiSale.idempotencyKey = localSale.idempotencyKey;
            }
            await db.sales.put(apiSale);
            useSalesStore.setState((state) => ({
              sales: state.sales.map((s) => (s.id === saleId ? apiSale : s)),
            }));
          } catch (err) {
            console.error('Failed to update sale after payment', err);
          }
        })();
      }

      return response.data;
    } catch (err: any) {
      const newBalance = Math.max(0, customer.totalCredit - amount);
      const updated = get().customers.map((c) =>
        c.id === customerId ? { ...c, totalCredit: newBalance } : c
      );
      set({ customers: updated, manuallySyncing: false });
      await db.customers.update(customerId, { totalCredit: newBalance });

      useUIStore.getState().addToast({
        message: `Payment recorded locally (sync failed: ${err.message})`,
        type: 'warning',
      });
      throw err;
    } finally {
      set({ manuallySyncing: false });
    }
  },

  syncCreditPayments: async () => {
    // ... (unchanged, keep existing implementation) ...
    if (!navigator.onLine) return;
    if (get().manuallySyncing) return;

    const allTxs = await db.creditTransactions.toArray();
    const unsynced = allTxs.filter((tx) => !tx.synced && tx.type === 'PAYMENT');

    if (unsynced.length === 0) return;

    let success = 0;
    for (const tx of unsynced) {
      try {
        const absAmount = Math.abs(tx.amount);
        const payload: any = {
          amount: absAmount,
          note: tx.note,
          idempotency_key: tx.id,
        };
        if (tx.saleId) payload.sale_id = tx.saleId;

        const response = await api.post(
          `/customers/${tx.customerId}/record_payment/`,
          payload
        );

        const newBalance = response.data.new_balance;
        await db.creditTransactions.update(tx.id, {
          synced: true,
          balanceAfter: newBalance,
        });
        set((state) => ({
          customers: state.customers.map((c) =>
            c.id === tx.customerId ? { ...c, totalCredit: newBalance } : c
          ),
        }));
        await db.customers.update(tx.customerId, { totalCredit: newBalance });
        success++;
      } catch (err) {
        console.error(`Failed to sync payment ${tx.id}`, err);
      }
    }

    try {
      useSalesStore.getState().fetchSales().catch(console.error);
    } catch (e) {
      console.error('Failed to refresh sales after syncing payments', e);
    }

    if (success > 0) {
      useUIStore.getState().addToast({
        message: `${success} payment(s) synced`,
        type: 'success',
      });
    }
    if (success < unsynced.length) {
      useUIStore.getState().addToast({
        message: `${unsynced.length - success} payment(s) failed, will retry later`,
        type: 'error',
      });
    }
  },

  refreshLocalBalances: async () => {
    if (!navigator.onLine) return;
    try {
      const response = await api.get('/customers/');
      const fresh: Customer[] = response.data.map(parseCustomerFromApi);
      await db.customers.bulkPut(fresh);
      set({ customers: fresh });
    } catch (err) {
      console.error('Failed to refresh balances', err);
    }
  },
}));