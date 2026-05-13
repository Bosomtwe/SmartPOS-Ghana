// src/lib/backupUtils.ts
import { db } from './dexie';

const CURRENT_BACKUP_VERSION = 1;
const MIN_BACKUP_VERSION = 1;   // oldest backup format we still support
const MAX_BACKUP_VERSION = 1;   // latest backup format we understand

export interface BackupMetadata {
  version: number;
  timestamp: string;
  shopId: string;
  tables: string[];
}

export interface BackupData {
  metadata: BackupMetadata;
  products: any[];
  customers: any[];
  sales: any[];
  creditTransactions: any[];
}

/**
 * Generate a plain JSON backup file (no compression).
 * This avoids browser compatibility issues with CompressionStream.
 */
export async function createBackup(shopId: string): Promise<Blob> {
  const [products, customers, sales, creditTxs] = await Promise.all([
    db.products.toArray(),
    db.customers.toArray(),
    db.sales.toArray(),
    db.creditTransactions.toArray(),
  ]);

  const backup: BackupData = {
    metadata: {
      version: CURRENT_BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      shopId,
      tables: ['products', 'customers', 'sales', 'creditTransactions'],
    },
    products,
    customers,
    sales,
    creditTransactions: creditTxs,
  };

  const json = JSON.stringify(backup, null, 0); // compact
  return new Blob([json], { type: 'application/json' });
}

/**
 * Validate and deserialize a backup file.
 * Works with both compressed and uncompressed files for backward compatibility.
 */
export async function parseBackup(file: File): Promise<BackupData> {
  const text = await file.text();            // reads as string directly
  const data = JSON.parse(text);

  // Accept any version in the range [MIN_BACKUP_VERSION, MAX_BACKUP_VERSION]
  if (
    !data.metadata ||
    typeof data.metadata.version !== 'number' ||
    data.metadata.version < MIN_BACKUP_VERSION ||
    data.metadata.version > MAX_BACKUP_VERSION
  ) {
    throw new Error(
      `Unsupported backup version. This app supports versions ${MIN_BACKUP_VERSION}–${MAX_BACKUP_VERSION}.`
    );
  }
  if (!data.products || !data.customers || !data.sales || !data.creditTransactions) {
    throw new Error('Backup file is missing required tables');
  }
  return data;
}