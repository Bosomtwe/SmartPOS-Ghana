// src/stores/saleStore.ts
import { create } from 'zustand';
import { db, type Sale } from '../lib/dexie';
import api from '../services/api';
import { useAuthStore } from './authStore';

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

interface SalesState {
  sales: Sale[];
  loading: boolean;
  error: string | null;
  nextPageUrl: string | null;
  previousPageUrl: string | null;
  totalCount: number;
  currentPage: number;
  pageSize: number;

  fetchSales: (startDate?: Date, endDate?: Date, page?: number) => Promise<void>;
  fetchNextPage: () => Promise<void>;
  fetchPreviousPage: () => Promise<void>;
  getSaleById: (id: string) => Promise<Sale | undefined>;
  voidSale: (saleId: string, reason: string) => Promise<void>;
  filterSales: (query: string, paymentMethod?: string, customerId?: string) => Sale[];
}

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  loading: false,
  error: null,
  nextPageUrl: null,
  previousPageUrl: null,
  totalCount: 0,
  currentPage: 1,
  pageSize: 50,

  fetchSales: async (startDate, endDate, page = 1) => {
    set({ loading: true, error: null });
    const shop = useAuthStore.getState().shop;
    if (!shop) {
      set({ loading: false, sales: [] });
      return;
    }

    try {
      if (navigator.onLine) {
        const params: any = {
          page_size: get().pageSize,
          page: page,
        };
        if (startDate) params.start = startDate.toISOString().split('T')[0];
        if (endDate) params.end = endDate.toISOString().split('T')[0];

        const response = await api.get('/sales/list/', { params });
        const salesData = response.data.results.map(toCamelSale);
        await db.sales.bulkPut(salesData);
        set({
          sales: salesData,
          loading: false,
          nextPageUrl: response.data.next,
          previousPageUrl: response.data.previous,
          totalCount: response.data.count,
          currentPage: page,
        });
      } else {
        // Offline: show only sales from this shop
        const allLocal = await db.sales.toArray();
        const shopSales = allLocal.filter(s => s.shopId === shop.id);
        set({
          sales: shopSales,
          loading: false,
          nextPageUrl: null,
          previousPageUrl: null,
          totalCount: shopSales.length,
          currentPage: 1,
        });
      }
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchNextPage: async () => {
    const { currentPage, totalCount, pageSize } = get();
    if (currentPage * pageSize >= totalCount) return;
    await get().fetchSales(undefined, undefined, currentPage + 1);
  },

  fetchPreviousPage: async () => {
    const { currentPage } = get();
    if (currentPage <= 1) return;
    await get().fetchSales(undefined, undefined, currentPage - 1);
  },

  getSaleById: async (id) => {
    let sale = get().sales.find(s => s.id === id);
    if (sale) return sale;
    sale = await db.sales.get(id);
    return sale;
  },

  voidSale: async (saleId, reason) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/sales/${saleId}/void/`, { reason });
      await db.sales.update(saleId, { status: 'VOIDED', voidReason: reason, synced: true });
      set((state) => ({
        sales: state.sales.map(s =>
          s.id === saleId ? { ...s, status: 'VOIDED', voidReason: reason } : s
        ),
        loading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  filterSales: (query, paymentMethod, customerId) => {
    return get().sales.filter(sale => {
      if (query) {
        const lower = query.toLowerCase();
        const idMatch = sale.id.toLowerCase().includes(lower);
        const customerMatch = sale.customerId && sale.customerId.toLowerCase().includes(lower);
        if (!idMatch && !customerMatch) return false;
      }
      if (paymentMethod && sale.paymentMethod !== paymentMethod) return false;
      if (customerId && sale.customerId !== customerId) return false;
      return true;
    });
  },
}));