import { db } from '../lib/dexie';
//import api from '../services/api';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useSalesStore } from '../stores/saleStore';

export async function repairAllData() {
  console.log('🔧 Starting data repair...');
  const shopId = localStorage.getItem('shopId');
  if (!shopId) {
    console.error('No shopId found. Please log in first.');
    return;
  }

  // Force re-fetch and store products
  await useProductStore.getState().syncProducts();
  // Force re-fetch and store customers
  await useCustomerStore.getState().fetchCustomers();
  // Force re-fetch and store sales
  await useSalesStore.getState().fetchSales();

  // Verify
  const products = await db.products.where('shopId').equals(shopId).toArray();
  const customers = await db.customers.where('shopId').equals(shopId).toArray();
  const sales = await db.sales.where('shopId').equals(shopId).toArray();
  console.log(`✅ Repair complete: ${products.length} products, ${customers.length} customers, ${sales.length} sales`);
}