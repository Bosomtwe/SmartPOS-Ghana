// src/stores/customerStore.ts
import { create } from 'zustand';
import { db, type Customer, type CreditTransaction } from '../lib/dexie';
import api from '../services/api';
import { useAuthStore } from './authStore';
import { useUIStore } from './uiStore';
import { useSalesStore } from './saleStore';
import type { Sale } from '../lib/dexie';

const getShopId = async (): Promise<string | null> => {
  const shop = useAuthStore.getState().shop;
  if (shop?.id) return shop.id;
  const stored = localStorage.getItem('shopId');
  if (stored) return stored;
  const anyCustomer = await db.customers.limit(1).first();
  return anyCustomer?.shopId || null;
};

const parseCustomerFromApi = async (raw: any): Promise<Customer> => {
  let shopId = raw.shop;
  if (!shopId) {
    shopId = await getShopId() || '';
  }
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone || '',
    totalCredit: Number(raw.total_credit),
    creditLimit: raw.credit_limit !== null ? Number(raw.credit_limit) : undefined,
    shopId,
  };
};

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

const extractList = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  console.warn('Unexpected API response format', data);
  return [];
};

/** Fetch all results from a paginated endpoint. Works even if the server isn't paginated. */
const fetchAllPages = async (url: string): Promise<any[]> => {
  let results: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    // Explicitly narrow for TypeScript
    const currentUrl: string = nextUrl;
    const response = await api.get(currentUrl);
    const data = response.data;
    results = results.concat(extractList(data));
    nextUrl = data.next || null;
  }

  return results;
};

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
  clearCustomers: () => void;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  loading: false,
  error: null,
  manuallySyncing: false,

  fetchCustomers: async () => {
    console.log('[customerStore] fetchCustomers called, online:', navigator.onLine);
    set({ loading: true, error: null });

    const shopId = await getShopId();
    if (!shopId) {
      console.error('[customerStore] No shopId, returning empty');
      set({ loading: false, customers: [] });
      return;
    }
    console.log('[customerStore] Current shopId:', shopId);

    const storeCustomers = get().customers;
    const storeHasCorrectShop = storeCustomers.length > 0 && storeCustomers[0].shopId === shopId;

    const shouldLoadFromCache = !navigator.onLine || !storeHasCorrectShop;

    if (shouldLoadFromCache) {
      console.log('[customerStore] Loading from IndexedDB...');
      let cached = await db.customers.where('shopId').equals(shopId).toArray();
      console.log(`[customerStore] IndexedDB query returned ${cached.length} customers for shopId ${shopId}`);

      if (cached.length === 0) {
        const all = await db.customers.toArray();
        console.log(`[customerStore] All customers in IndexedDB: ${all.length}`);
        cached = all.filter(c => c.shopId === shopId);
        console.log(`[customerStore] After filtering, found ${cached.length} customers for shop ${shopId}`);
      }

      if (cached.length > 0) {
        set({ customers: cached, loading: false });
      } else {
        console.log(`[customerStore] No customers found for shop ${shopId} in IndexedDB`);
        set({ customers: [], loading: true });
      }
    } else {
      console.log(`[customerStore] Using existing ${get().customers.length} customers from store`);
      set({ loading: true });
    }

    if (navigator.onLine && localStorage.getItem('skipNextOnlineFetch') !== 'true') {
      try {
        console.log('[customerStore] Fetching fresh customers from server...');
        const rawCustomers = await fetchAllPages('/customers/');
        const fresh = await Promise.all(rawCustomers.map(parseCustomerFromApi));
        console.log(`[customerStore] Synced ${fresh.length} customers from server`);

        await db.customers.where('shopId').equals(shopId).delete();
        console.log(`[customerStore] Cleared customers for shop ${shopId}`);

        if (fresh.length > 0) {
          await db.customers.bulkPut(fresh);
        }

        const verifyCount = await db.customers.where('shopId').equals(shopId).count();
        console.log(`[customerStore] After sync, IndexedDB has ${verifyCount} customers for shop ${shopId}`);
        set({ customers: fresh, loading: false });
      } catch (err) {
        console.error('[customerStore] Background sync failed', err);
        if (get().customers.length === 0) {
          set({ loading: false });
        }
      }
    } else if (get().customers.length === 0) {
      set({ loading: false });
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
      const newCust = await parseCustomerFromApi(response.data);
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
      const updated = await parseCustomerFromApi(response.data);
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
    if (navigator.onLine) await api.delete(`/customers/${id}/`);
    await db.customers.delete(id);
    set((state) => ({ customers: state.customers.filter((c) => c.id !== id) }));
  },

  recordPayment: async (customerId, amount, note, saleId) => {
    console.log('[customerStore] recordPayment called, online:', navigator.onLine);
    set({ manuallySyncing: true });
    const localTxId = crypto.randomUUID();
    const timestamp = new Date();

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
      const payload: any = { amount, note, idempotency_key: localTxId };
      if (saleId) payload.sale_id = saleId;
      const response = await api.post(`/customers/${customerId}/record_payment/`, payload);
      const newBalance = response.data.new_balance;

      await db.creditTransactions.update(localTxId, { synced: true, balanceAfter: newBalance });
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
      set((state) => ({
        customers: state.customers.map((c) =>
          c.id === customerId ? { ...c, totalCredit: newBalance } : c
        ),
      }));
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
    if (!navigator.onLine) return;
    if (get().manuallySyncing) return;
    const unsynced = await db.creditTransactions.filter(tx => !tx.synced && tx.type === 'PAYMENT').toArray();
    console.log(`[customerStore] Found ${unsynced.length} unsynced payments`);
    let success = 0;
    for (const tx of unsynced) {
      try {
        const absAmount = Math.abs(tx.amount);
        const payload: any = { amount: absAmount, note: tx.note, idempotency_key: tx.id };
        if (tx.saleId) payload.sale_id = tx.saleId;
        const response = await api.post(`/customers/${tx.customerId}/record_payment/`, payload);
        const newBalance = response.data.new_balance;
        await db.creditTransactions.update(tx.id, { synced: true, balanceAfter: newBalance });
        set((state) => ({
          customers: state.customers.map(c =>
            c.id === tx.customerId ? { ...c, totalCredit: newBalance } : c
          ),
        }));
        await db.customers.update(tx.customerId, { totalCredit: newBalance });
        success++;
      } catch (err) {
        console.error(`Failed to sync payment ${tx.id}`, err);
      }
    }
    if (success > 0) {
      useUIStore.getState().addToast({ message: `${success} payment(s) synced`, type: 'success' });
      useSalesStore.getState().fetchSales().catch(console.error);
    }
  },

  refreshLocalBalances: async () => {
    if (!navigator.onLine) return;
    try {
      const shopId = await getShopId();
      if (!shopId) return;

      const rawCustomers = await fetchAllPages('/customers/');
      const fresh = await Promise.all(rawCustomers.map(parseCustomerFromApi));

      await db.customers.where('shopId').equals(shopId).delete();
      if (fresh.length > 0) {
        await db.customers.bulkPut(fresh);
      }

      set({ customers: fresh });
      console.log(`[customerStore] Refreshed balances, ${fresh.length} customers`);
    } catch (err) {
      console.error('Failed to refresh balances', err);
    }
  },

  clearCustomers: () => {
    set({ customers: [] });
  },
}));