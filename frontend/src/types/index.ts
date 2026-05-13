// src/types/index.ts
export interface Product {
  id: string;
  shop: string;
  name: string;
  sku: string | null;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shop {
  id: string;
  name: string;
  address: string;
}

export interface User {
  id: string;
  phone: string;
  role: 'OWNER' | 'CASHIER';
  shop: string;
  isActive: boolean;
}