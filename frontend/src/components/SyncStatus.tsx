// src/components/SyncStatus.tsx
import { useEffect, useState, useRef } from 'react';
import { useSyncStore } from '../stores/syncStore';
import { useCustomerStore } from '../stores/customerStore';
import { CloudIcon, CloudArrowUpIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const CloudOffIcon = ({ className }: { className?: string }) => (
  <div className={`relative inline-block ${className}`}>
    <CloudIcon className="h-full w-full" />
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-[140%] h-0.5 bg-red-700 rotate-45 transform origin-center" />
    </div>
  </div>
);

interface SyncStatusProps {
  compact?: boolean;
}

export const SyncStatus = ({ compact = false }: SyncStatusProps) => {
  const { pendingSales, isSyncing, sync, lastSyncAttempt } = useSyncStore();
  const syncCreditPayments = useCustomerStore((s) => s.syncCreditPayments);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const autoSyncTriggered = useRef(false);
  const COOLDOWN_MS = 10000; // must match syncStore

  // Online/offline listeners
  useEffect(() => {
    const hOnline = () => setIsOnline(true);
    const hOffline = () => {
      setIsOnline(false);
      autoSyncTriggered.current = false; // reset when offline
    };
    window.addEventListener('online', hOnline);
    window.addEventListener('offline', hOffline);
    return () => {
      window.removeEventListener('online', hOnline);
      window.removeEventListener('offline', hOffline);
    };
  }, []);

  // Auto-sync with debounce and once-per-online-session
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOnline && pendingSales > 0 && !isSyncing && !autoSyncTriggered.current) {
        const now = Date.now();
        if (now - lastSyncAttempt >= COOLDOWN_MS) {
          autoSyncTriggered.current = true;
          sync();
        }
      }
    }, 500); // debounce 500ms

    return () => clearTimeout(timer);
  }, [isOnline, pendingSales, isSyncing, sync, lastSyncAttempt]);

  // When pendingSales reaches 0, reset the flag so new sales can trigger sync
  useEffect(() => {
    if (pendingSales === 0) {
      autoSyncTriggered.current = false;
    }
  }, [pendingSales]);

  // Sync credit payments when coming online
  useEffect(() => {
    if (isOnline) {
      syncCreditPayments();
    }
  }, [isOnline, syncCreditPayments]);

  // Update last sync time when all done
  useEffect(() => {
    if (!isSyncing && pendingSales === 0 && isOnline) {
      setLastSyncTime(new Date());
    }
  }, [isSyncing, pendingSales, isOnline]);

  // Compact version (icon with dot)
  if (compact) {
    const statusColor = isOnline
      ? isSyncing
        ? 'bg-blue-500'
        : pendingSales > 0
          ? 'bg-yellow-500'
          : 'bg-green-500'
      : 'bg-red-500';

    return (
      <button
        onClick={() => sync()}
        disabled={isSyncing}
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition touch-manipulation"
        title={
          isOnline
            ? isSyncing
              ? 'Syncing...'
              : pendingSales > 0
                ? `${pendingSales} pending sale(s)`
                : 'All synced'
            : 'Offline'
        }
      >
        {isOnline ? (
          <CloudArrowUpIcon
            className={`h-5 w-5 ${isSyncing ? 'animate-pulse text-blue-600' : pendingSales > 0 ? 'text-yellow-600' : 'text-green-600'}`}
          />
        ) : (
          <CloudOffIcon className="h-5 w-5 text-red-600" />
        )}
        <span className={`absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white ${statusColor}`} />
      </button>
    );
  }

  // Expanded floating pill
  if (!isOnline) {
    return (
      <div className="fixed bottom-20 right-4 md:bottom-4 z-50 bg-red-100 text-red-700 px-3 py-2 rounded-full shadow-md flex items-center gap-2 text-sm">
        <CloudOffIcon className="h-4 w-4" />
        <span>Offline mode</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="fixed bottom-20 right-4 md:bottom-4 z-50 bg-blue-100 text-blue-700 px-3 py-2 rounded-full shadow-md flex items-center gap-2 text-sm">
        <CloudArrowUpIcon className="h-4 w-4 animate-pulse" />
        <span>Syncing...</span>
      </div>
    );
  }

  if (pendingSales > 0) {
    return (
      <button
        onClick={() => sync()}
        className="fixed bottom-20 right-4 md:bottom-4 z-50 bg-yellow-100 text-yellow-800 px-3 py-2 rounded-full shadow-md flex items-center gap-2 text-sm hover:bg-yellow-200 transition"
      >
        <CloudArrowUpIcon className="h-4 w-4" />
        <span>{pendingSales} pending sale(s)</span>
      </button>
    );
  }

  if (lastSyncTime) {
    return (
      <div className="fixed bottom-20 right-4 md:bottom-4 z-50 bg-green-100 text-green-700 px-3 py-2 rounded-full shadow-md flex items-center gap-2 text-sm">
        <CheckCircleIcon className="h-4 w-4" />
        <span>Synced {lastSyncTime.toLocaleTimeString()}</span>
      </div>
    );
  }

  return null;
};