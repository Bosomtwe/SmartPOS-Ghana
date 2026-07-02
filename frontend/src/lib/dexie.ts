// src/lib/dexie.ts
import Dexie from 'dexie';
import type { Table } from 'dexie';

export interface Product {
  id: string;
  name: string;
  sku?: string;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  lowStockThreshold: number;
  isActive: boolean;
  shopId: string;
  customFields: Record<string, any>;
  initialStock?: number;
  synced?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  totalCredit: number;
  creditLimit?: number;
  shopId: string;
}

export interface Sale {
  id: string;
  shopId: string;
  userId: string;
  userPhone?: string;          // ✅ Cashier's phone at time of sale
  customerId?: string;
  totalAmount: number;
  discount: number;
  paymentMethod: 'CASH' | 'MOMO' | 'CREDIT';
  momoNumber?: string;
  status: 'COMPLETED' | 'VOIDED';
  voidReason?: string;
  createdAt: Date;
  synced: boolean;
  syncError?: string | null;
  items: SaleItem[];
  totalPaid?: number;
  balance?: number;
  idempotencyKey: string;
  isBackdated?: boolean;
  originalCreatedAt?: Date | null;
}

export interface SaleItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  name?: string;
}

export interface CreditTransaction {
  id: string;
  customerId: string;
  saleId?: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  balanceAfter: number;
  note?: string;
  createdAt: Date;
  synced: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  max_users: number;
  max_products: number;
  allow_credit_sales: boolean;
  allow_bulk_import: boolean;
  allow_audit_logs: boolean;
  allow_analytics: boolean;
}

export interface CachedSubscription {
  id: string;
  plan_name: string;
  end_date: string;
  is_active: boolean;
  is_trial: boolean;
}

export interface ProductMutation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'STOCK_ADJUST';
  productId?: string;
  data: any;
  createdAt: Date;
  synced: boolean;
  syncError?: string | null;
}

export class SmartPosDB extends Dexie {
  products!: Table<Product>;
  customers!: Table<Customer>;
  sales!: Table<Sale>;
  creditTransactions!: Table<CreditTransaction>;
  subscriptionPlans!: Table<SubscriptionPlan>;
  currentSubscription!: Table<CachedSubscription>;
  productMutations!: Table<ProductMutation>;

  constructor() {
    super('SmartPosDB');

    this.version(1).stores({
      products: 'id, shopId, name, sku, customFields',
      customers: 'id, name, phone, shopId',
      sales: 'id, createdAt, synced, shopId',
      creditTransactions: 'id, customerId, createdAt, synced',
    });

    this.version(2).upgrade(async (tx) => {
      const salesTable = tx.table('sales');
      await salesTable.toCollection().modify((sale) => {
        if (sale.synced === undefined || sale.synced === null) sale.synced = false;
        if (sale.syncError === undefined) sale.syncError = null;
        if (sale.idempotencyKey === undefined) sale.idempotencyKey = '';
      });
    });

    this.version(3).stores({
      creditTransactions: 'id, customerId, saleId, createdAt, synced, [saleId+type]',
    });

    this.version(4).upgrade(async (tx) => {
      const productsTable = tx.table('products');
      await productsTable.toCollection().modify((product) => {
        if (product.lowStockThreshold === undefined || product.lowStockThreshold === null) product.lowStockThreshold = 5;
        if (product.isActive === undefined || product.isActive === null) product.isActive = true;
        if (typeof product.currentStock !== 'number') product.currentStock = Number(product.currentStock) || 0;
        if (typeof product.costPrice !== 'number') product.costPrice = Number(product.costPrice) || 0;
        if (typeof product.sellingPrice !== 'number') product.sellingPrice = Number(product.sellingPrice) || 0;
        if (product.customFields === undefined) product.customFields = {};
      });
    });

    this.version(5).stores({
      subscriptionPlans: 'id, name',
      currentSubscription: 'id',
    });

    this.version(6).stores({
      productMutations: 'id, type, productId, synced, createdAt',
    });
  }
}

export const db = new SmartPosDB();

(window as any).__db = db;