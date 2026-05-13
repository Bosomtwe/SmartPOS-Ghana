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
}

export interface SaleItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  name?: string;                 // ✅ added for receipt enrichment
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

export class SmartPosDB extends Dexie {
  products!: Table<Product>;
  customers!: Table<Customer>;
  sales!: Table<Sale>;
  creditTransactions!: Table<CreditTransaction>;

  constructor() {
    super('SmartPosDB');

    // Version 1 – initial schema (kept as is, just for reference)
    this.version(1).stores({
      products: 'id, name, sku, sellingPrice, currentStock, shopId, isActive',
      customers: 'id, name, phone, shopId',
      sales: 'id, createdAt, synced, shopId',
      creditTransactions: 'id, customerId, createdAt, synced',
    });

    // Version 2 – fixes missing fields on sales
    this.version(2).upgrade(async (tx) => {
      const salesTable = tx.table('sales');
      await salesTable.toCollection().modify((sale) => {
        if (sale.synced === undefined || sale.synced === null) {
          sale.synced = false;
        }
        if (sale.syncError === undefined) {
          sale.syncError = null;
        }
        if (sale.idempotencyKey === undefined) {
          sale.idempotencyKey = '';
        }
      });
    });

    // Version 3 – adds saleId index AND the compound index [saleId+type]
    this.version(3).stores({
      creditTransactions: 'id, customerId, saleId, createdAt, synced, [saleId+type]',
    });

    // Version 4 – normalise missing product fields (lowStockThreshold, isActive, etc.)
    this.version(4).upgrade(async (tx) => {
      const productsTable = tx.table('products');
      await productsTable.toCollection().modify((product) => {
        if (product.lowStockThreshold === undefined || product.lowStockThreshold === null) {
          product.lowStockThreshold = 5;
        }
        if (product.isActive === undefined || product.isActive === null) {
          product.isActive = true;
        }
        // Ensure numeric stock and prices
        if (typeof product.currentStock !== 'number') {
          product.currentStock = Number(product.currentStock) || 0;
        }
        if (typeof product.costPrice !== 'number') {
          product.costPrice = Number(product.costPrice) || 0;
        }
        if (typeof product.sellingPrice !== 'number') {
          product.sellingPrice = Number(product.sellingPrice) || 0;
        }
      });
    });
  }
}

export const db = new SmartPosDB();

(window as any).__db = db;