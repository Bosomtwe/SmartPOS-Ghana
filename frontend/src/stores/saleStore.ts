// src/stores/saleStore.ts
import { create } from 'zustand';
import { db, type Sale } from '../lib/dexie';
import api from '../services/api';
import { useAuthStore } from './authStore';

// ---------- Helper to always get a valid shopId ----------
// IMPORTANT: this intentionally does NOT fall back to reading a shopId off
// a cached IndexedDB record. logout() preserves db.sales for offline use,
// so between a logout and the next login completing, useAuthStore.shop is
// null and localStorage 'shopId' has been cleared — falling back to "the
// first sale in the DB" would silently resolve to the PREVIOUS session's
// shop and leak its data into whatever triggers a fetch during that gap.
// Returning null here is correct: it means "no authenticated shop yet",
// and callers already handle that by bailing out.
const getShopId = async (): Promise<string | null> => {
  const shop = useAuthStore.getState().shop;
  if (shop?.id) return shop.id;
  const stored = localStorage.getItem('shopId');
  if (stored) return stored;
  return null;
};

// ---------- Async converter with shopId fallback ----------
export const toCamelSale = async (raw: any): Promise<Sale> => {
  let shopId = raw.shop;
  if (!shopId) {
    shopId = await getShopId() || '';
  }
  return {
    id: raw.id,
    shopId,
    userId: raw.user,
    userPhone: raw.user_phone || raw.cashier_phone || '',
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
    isBackdated: raw.is_backdated || false,
    originalCreatedAt: raw.original_created_at ? new Date(raw.original_created_at) : null,
  };
};

interface SalesState {
  sales: Sale[];
  loading: boolean;
  error: string | null;
  nextPageUrl: string | null;
  previousPageUrl: string | null;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  fetchSales: (startDate?: string, endDate?: string, page?: number, userId?: string) => Promise<void>;
  fetchNextPage: () => Promise<void>;
  fetchPreviousPage: () => Promise<void>;
  getSaleById: (id: string) => Promise<Sale | undefined>;
  voidSale: (saleId: string, reason: string) => Promise<void>;
  filterSales: (query: string, paymentMethod?: string, customerId?: string) => Sale[];
  clearSales: () => void;
}

let saleFetchPromise: Promise<void> | null = null;

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  loading: false,
  error: null,
  nextPageUrl: null,
  previousPageUrl: null,
  totalCount: 0,
  currentPage: 1,
  pageSize: 50,

  clearSales: () => {
    set({ sales: [], totalCount: 0 });
  },

  // 🔧 NEW: Reset the fetch lock so the next shop's fetch can start immediately
  __resetLock: () => {
    saleFetchPromise = null;
  },

  fetchSales: async (startDate, endDate, page = 1, userId) => {
    const shopIdAtStart = await getShopId();
    if (!shopIdAtStart) {
      set({ loading: false, sales: [] });
      return;
    }
   
    if (saleFetchPromise) {
      console.log('[saleStore] Skipping duplicate fetch – one already in progress');
      return saleFetchPromise;
    }

    saleFetchPromise = (async () => {
      console.log('[saleStore] fetchSales called with:', { startDate, endDate, page, userId });

      set({ loading: true, error: null });

      const shopId = await getShopId();
      if (!shopId) {
        set({ loading: false, sales: [] });
        return;
      }

      const currentUser = useAuthStore.getState().user;
      let effectiveUserId = userId;
      if (currentUser?.role === 'CASHIER' && !effectiveUserId) {
        effectiveUserId = currentUser.id;
      }

      const hasFilter = !!(startDate || endDate || effectiveUserId);
      const isOnline = navigator.onLine;

      // ==================== OFFLINE PATH ====================
      if (!isOnline) {
        console.log('[saleStore] Offline – loading all local sales for shop', shopId);
        
        // Start with current in‑memory sales
        let baseSales = get().sales.length > 0 ? [...get().sales] : [];

        // Load only sales for THIS shop from IndexedDB – no fallback to all sales 
        let cached: Sale[] = [];
        try {
          cached = await db.sales.where('shopId').equals(shopId).toArray();
        } catch (e) {
          console.error('[saleStore] IndexedDB load failed', e);
        }
        console.log(`[saleStore] IndexedDB has ${cached.length} sales for shop ${shopId}`);

        // Merge cached sales that belong to this shop into base array
        const existingIds = new Set(baseSales.map(s => s.id));
        const toAdd = cached.filter(s => !existingIds.has(s.id) && s.shopId === shopId);
        baseSales = [...baseSales, ...toAdd];

        // Filter out any sales that do NOT belong to the current shop (safety net)
        baseSales = baseSales.filter(s => s.shopId === shopId);

        baseSales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // ✅ Apply date filter (offline)
        let filteredByDate = baseSales;
        if (startDate || endDate) {
          const start = startDate ? new Date(startDate) : null;
          const end = endDate ? new Date(endDate) : null;
          if (start) start.setHours(0, 0, 0, 0);
          if (end) end.setHours(23, 59, 59, 999);

          filteredByDate = baseSales.filter(s => {
            const saleDate = new Date(s.createdAt);
            if (start && saleDate < start) return false;
            if (end && saleDate > end) return false;
            return true;
          });
        }

        // Persist to IndexedDB. IMPORTANT: this must be a pure upsert, never
        // preceded by a clear()/delete(). bulkPut only adds/updates the rows
        // it's given, keyed by `id` — it can never remove other rows. The
        // previous version did `db.sales.clear()` (unscoped, wiping every
        // shop's cached sales) before re-inserting only `baseSales`. If
        // baseSales was ever computed as narrower than what was actually on
        // disk — e.g. a subtle shopId format mismatch silently dropping
        // records from the `toAdd` merge above — that narrower set became
        // the ONLY sales left in the entire table, permanently, for every
        // shop. Never precede this write with a clear/delete of any scope.
        try {
          await db.sales.bulkPut(baseSales);
          console.log(`[saleStore] Persisted ${baseSales.length} sales to IndexedDB`);
        } catch (e) {
          console.warn('[saleStore] Failed to sync IndexedDB offline', e);
        }

        // Apply user filter for display (if a specific user is selected)
        //let displaySales = baseSales;
        let displaySales = filteredByDate;
        if (effectiveUserId) {
          //displaySales = baseSales.filter(s => s.userId === effectiveUserId);
          displaySales = displaySales.filter(s => s.userId === effectiveUserId);
        }

        set({
          //sales: baseSales,
          sales: displaySales,      // ✅ now uses the filtered list
          loading: false,
          //totalCount: baseSales.length,
          totalCount: displaySales.length,   // ← also update totalCount
          currentPage: 1,
          nextPageUrl: null,
          previousPageUrl: null,
        });
        return;
      }

      // ==================== ONLINE PATH ====================
      // Load from IndexedDB for instant display – only current shop
      let cached: Sale[] = [];
      try {
        cached = await db.sales.where('shopId').equals(shopId).toArray();
      } catch (e) { /* ignore */ }
      console.log(`[saleStore] Loaded ${cached.length} sales from IndexedDB for shop ${shopId}`);

      // If store is empty, prime it with shop‑filtered cached sales
      if (cached.length > 0 && get().sales.length === 0) {
        set({ sales: cached.filter(s => s.shopId === shopId) });
      }

      if (hasFilter) {
        set({ sales: [], loading: true, totalCount: 0 });
      } else {
        set({ loading: true });
      }

      try {
        console.log(`[saleStore] Requesting sales for shop ${shopId}, user: ${effectiveUserId || 'all'}`);
        const params: any = { page_size: get().pageSize, page };
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (effectiveUserId) params.user_id = effectiveUserId;

        const response = await api.get('/sales/list/', { params });

        // 🔧 OPTIMIZATION: Discard if shop changed
        const currentShopId = await getShopId();
        if (currentShopId !== shopIdAtStart) {
          console.log('[saleStore] Shop changed – discarding stale response');
          return;
        }

        const salesData = await Promise.all(response.data.results.map(toCamelSale));
        console.log(`[saleStore] Received ${salesData.length} sales from server`);

        let finalSales: Sale[];
        if (hasFilter) {
          finalSales = salesData.filter(s => s.shopId === shopId);
        } else {
          // Start from current in‑memory sales (which already belong to this shop)
          let currentSales = get().sales.filter(s => s.shopId === shopId);
          const merged = [...currentSales];

          for (const serverSale of salesData) {
            if (serverSale.shopId !== shopId) continue; // skip foreign shop sales
            const existingIndex = merged.findIndex(s => s.id === serverSale.id);
            const localSale = existingIndex !== -1 ? merged[existingIndex] : null;

            if (localSale) {
              if (localSale.isBackdated) {
                serverSale.isBackdated = true;
                serverSale.createdAt = localSale.createdAt;
                serverSale.originalCreatedAt = localSale.originalCreatedAt || null;
              } else {
                serverSale.isBackdated = false;
                serverSale.originalCreatedAt = null;
              }
              merged[existingIndex] = serverSale;
            } else {
              if (!serverSale.isBackdated) {
                serverSale.isBackdated = false;
                serverSale.originalCreatedAt = null;
              }
              merged.push(serverSale);
            }
          }

          finalSales = merged
            .filter(s => s.shopId === shopId)
            .filter((s, idx, self) => idx === self.findIndex(t => t.id === s.id));
        }

        console.log(`[saleStore] Final sales count: ${finalSales.length}`);

        if (!hasFilter) {
          // Clear only current shop's sales and repopulate
          await db.sales.where('shopId').equals(shopId).delete();
          await db.sales.bulkPut(finalSales);
          const verifyCount = await db.sales.where('shopId').equals(shopId).count();
          console.log(`[saleStore] After sync, IndexedDB has ${verifyCount} sales for shop ${shopId}`);
        }

        set({
          sales: finalSales,
          loading: false,
          nextPageUrl: response.data.next,
          previousPageUrl: response.data.previous,
          totalCount: response.data.count,
          currentPage: page,
        });
      } catch (err: any) {
        console.error('[saleStore] Failed to fetch from server', err);
        // Fallback – only keep sales for current shop
        let fallback = get().sales.length > 0 ? [...get().sales] : cached;
        fallback = fallback.filter(s => s.shopId === shopId);
        const existingIds = new Set(fallback.map(s => s.id));
        const toAdd = cached.filter(s => !existingIds.has(s.id) && s.shopId === shopId);
        fallback = [...fallback, ...toAdd];
        fallback.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        set({
          sales: fallback,
          loading: false,
          totalCount: fallback.length,
          currentPage: 1,
          nextPageUrl: null,
          previousPageUrl: null,
          error: err.message || 'Failed to fetch from server, showing cached data.',
        });
      }
    })();

    try {
      await saleFetchPromise;
    } finally {
      saleFetchPromise = null;
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