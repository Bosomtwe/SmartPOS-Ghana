// src/components/BackupRestore.tsx
import { useState } from 'react';
import { Button } from './Button';
import { ConfirmModal } from './ConfirmModal';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { db } from '../lib/dexie';
import { createBackup, parseBackup } from '../lib/backupUtils';
import {
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

function reviveDates(data: any): any {
  if (Array.isArray(data)) return data.map(reviveDates);
  if (data !== null && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      if (
        typeof data[key] === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data[key])
      ) {
        data[key] = new Date(data[key]);
      } else if (typeof data[key] === 'object') {
        data[key] = reviveDates(data[key]);
      }
    }
  }
  return data;
}

export function BackupRestore() {
  const { shop } = useAuthStore();
  const { addToast } = useUIStore();

  const [backupLoading, setBackupLoading] = useState(false);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupPreview, setBackupPreview] = useState<{
    products: number;
    customers: number;
    sales: number;
    creditTxs: number;
    timestamp: string;
  } | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<{
    products: number;
    customers: number;
    sales: number;
    creditTxs: number;
  } | null>(null);

  // ───────────────────────────────────────
  // EXPORT BACKUP
  // ───────────────────────────────────────
  const handleBackup = async () => {
    if (!shop) return;
    setBackupLoading(true);
    try {
      const blob = await createBackup(shop.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartpos_${shop.name.replace(/\s/g, '_')}_${new Date()
        .toISOString()
        .slice(0, 19)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast({ message: 'Backup created successfully', type: 'success' });
    } catch (err: any) {
      addToast({ message: `Backup failed: ${err.message}`, type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  // ───────────────────────────────────────
  // PREVIEW BACKUP
  // ───────────────────────────────────────
  const handleFileSelect = async (file: File) => {
    setRestoreFile(file);
    try {
      const backup = await parseBackup(file);

      // ❌ Block foreign backups
      if (!shop || backup.metadata.shopId !== shop.id) {
        addToast({
          message: 'This backup belongs to a different shop and cannot be restored here.',
          type: 'error',
        });
        setRestoreFile(null);
        setBackupPreview(null);
        return;
      }

      setBackupPreview({
        products: backup.products.length,
        customers: backup.customers.length,
        sales: backup.sales.length,
        creditTxs: backup.creditTransactions.length,
        timestamp: backup.metadata.timestamp,
      });
    } catch (err: any) {
      addToast({ message: `Invalid backup file: ${err.message}`, type: 'error' });
      setRestoreFile(null);
    }
  };

  // ───────────────────────────────────────
  // RESTORE CONFIRMATION & EXECUTION
  // ───────────────────────────────────────
  const handleRestoreClick = () => {
    if (!restoreFile || !backupPreview) return;
    setShowConfirm(true);
  };

  const confirmRestore = async () => {
    setShowConfirm(false);
    setRestoring(true);
    try {
      if (!restoreFile) throw new Error('No file selected');
      if (!shop) throw new Error('Not logged in');

      // 1. Safety backup
      addToast({ message: 'Creating safety backup…', type: 'info' });
      const safetyBlob = await createBackup(shop.id);
      const url = URL.createObjectURL(safetyBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartpos_SAFETY_BACKUP_${new Date().toISOString().slice(0, 19)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 2. Parse
      const data = await parseBackup(restoreFile);
      const shopId = shop.id;

      // 3. Normalise every entity with the current shop ID
      addToast({ message: 'Writing products…', type: 'info' });
      const products = reviveDates(data.products).map((p: any) => ({
        ...p,
        shopId,
        lowStockThreshold: p.lowStockThreshold ?? 5,
        isActive: p.isActive ?? true,
        currentStock: p.currentStock != null ? Number(p.currentStock) : 0,
        costPrice: Number(p.costPrice) || 0,
        sellingPrice: Number(p.sellingPrice) || 0,
      }));

      addToast({ message: 'Writing customers…', type: 'info' });
      const customers = reviveDates(data.customers).map((c: any) => ({
        ...c,
        shopId,
        totalCredit: Number(c.totalCredit) || 0,
        creditLimit: c.creditLimit != null ? Number(c.creditLimit) : undefined,
      }));

      addToast({ message: 'Writing sales…', type: 'info' });
      const sales = reviveDates(data.sales).map((s: any) => ({
        ...s,
        shopId,
        synced: true,              // these came from a backup; they already exist on server
        totalPaid: Number(s.totalPaid) || 0,
        balance: Number(s.balance) || 0,
        discount: Number(s.discount) || 0,
        totalAmount: Number(s.totalAmount) || 0,
      }));

      addToast({ message: 'Writing credit transactions…', type: 'info' });
      const creditTxs = reviveDates(data.creditTransactions).map((tx: any) => ({
        ...tx,
        synced: true,
        amount: Number(tx.amount) || 0,
        balanceAfter: Number(tx.balanceAfter) || 0,
      }));

      // 4. Replace local database
      await db.transaction(
        'rw',
        db.products,
        db.customers,
        db.sales,
        db.creditTransactions,
        async () => {
          await db.products.clear();
          await db.customers.clear();
          await db.sales.clear();
          await db.creditTransactions.clear();

          await db.products.bulkAdd(products);
          await db.customers.bulkAdd(customers);
          await db.sales.bulkAdd(sales);
          await db.creditTransactions.bulkAdd(creditTxs);
        }
      );

      // 5. Prevent online sync from overwriting restored data for 30 minutes
      localStorage.setItem('skipNextOnlineFetch', 'true');
      localStorage.setItem('skipNextOnlineFetch_timestamp', Date.now().toString());

      // 6. Show success
      setRestoreSuccess({
        products: products.length,
        customers: customers.length,
        sales: sales.length,
        creditTxs: creditTxs.length,
      });
    } catch (err: any) {
      addToast({ message: `Restore failed: ${err.message}`, type: 'error' });
    } finally {
      setRestoring(false);
      setRestoreFile(null);
      setBackupPreview(null);
    }
  };

  const handleReloadAfterRestore = () => {
    window.location.reload();
  };

  // ───────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────
  return (
    <>
      {/* Backup Section */}
      <div className="p-4 bg-gray-50 rounded-xl mb-4">
        <div className="flex items-start gap-3">
          <DocumentArrowDownIcon className="h-5 w-5 text-gray-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-gray-900 text-sm">Offline Backup</h3>
            <p className="text-xs text-gray-500 max-w-md">
              Export all data as a versioned JSON file. Works offline.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={handleBackup}
          disabled={backupLoading}
          className="mt-3"
        >
          {backupLoading ? 'Creating...' : 'Export Backup'}
        </Button>
      </div>

      {/* Restore Section */}
      <div className="p-4 border border-red-200 rounded-xl bg-red-50">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800 text-sm">Restore from Backup</h3>
            <p className="text-xs text-red-600 mt-1">
              Warning: This will permanently replace ALL current local data.
              A safety backup will be downloaded before restoring.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              else setRestoreFile(null);
            }}
            className="flex-1 text-sm border border-red-300 rounded-lg p-2 bg-white file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-sm hover:file:bg-red-700"
          />
          <Button
            variant="danger"
            onClick={handleRestoreClick}
            disabled={!restoreFile || restoring}
            className="shrink-0"
          >
            {restoring ? 'Restoring…' : 'Restore Data'}
          </Button>
        </div>

        {backupPreview && (
          <div className="mt-3 bg-white p-3 rounded-md text-xs text-gray-700">
            <p className="font-medium mb-1">Backup preview:</p>
            <p>
              Date: {new Date(backupPreview.timestamp).toLocaleString()} •
              Products: {backupPreview.products} •
              Customers: {backupPreview.customers} •
              Sales: {backupPreview.sales} •
              Credits: {backupPreview.creditTxs}
            </p>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {showConfirm && (
        <ConfirmModal
          title="Restore Backup"
          message="⚠️ This will permanently overwrite ALL current local data. A safety backup will be downloaded first. The app will reload after restore. Continue?"
          confirmLabel="Yes, Restore Data"
          loading={restoring}
          variant="danger"
          onConfirm={confirmRestore}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Success Modal */}
      {restoreSuccess && (
        <ConfirmModal
          title="✅ Restore Successful"
          message={
            `Local data has been replaced with:\n\n` +
            `• ${restoreSuccess.products} products\n` +
            `• ${restoreSuccess.customers} customers\n` +
            `• ${restoreSuccess.sales} sales\n` +
            `• ${restoreSuccess.creditTxs} credit transactions\n\n` +
            `📌 This snapshot is **local only**. Your server data has **not** been changed.\n` +
            `📱 The app will now reload to show the restored data.\n` +
            `🔒 A safety backup of your previous data was saved to your downloads.`
          }
          confirmLabel="Reload Now"
          loading={false}
          variant="primary"
          onConfirm={handleReloadAfterRestore}
          onCancel={handleReloadAfterRestore}
        />
      )}
    </>
  );
}