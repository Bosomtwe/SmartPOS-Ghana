// SyncButton.tsx
import { useSyncStore } from '../stores/syncStore';
import { useUIStore } from '../stores/uiStore';
import { CloudArrowUpIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function SyncButton() {
  const { sync, isSyncing, pendingSales } = useSyncStore();
  const { addToast } = useUIStore();

  const handleSync = async () => {
    if (isSyncing || pendingSales === 0) return;

    if (!navigator.onLine) {
      addToast({
        message: 'You are offline. Connect to the internet to sync.',
        type: 'warning',
      });
      return;
    }

    // ✅ Check if we are currently in "restored mode" (skip flag active)
    const skipFlag = localStorage.getItem('skipNextOnlineFetch');
    if (skipFlag === 'true') {
      // Warn the user that syncing will overwrite the restored data
      addToast({
        message: 'You are viewing restored data. Syncing will replace it with live server data. To proceed, tap Sync again or clear the restored state first.',
        type: 'warning',
        duration: 6000,
      });
      return;
    }

    try {
      await sync();
    } catch {
      addToast({
        message: 'Sync failed. Please try again later.',
        type: 'error',
      });
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing || pendingSales === 0}
      className="relative flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
    >
      {isSyncing ? (
        <>
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          <span>Syncing…</span>
        </>
      ) : (
        <>
          <CloudArrowUpIcon className="h-4 w-4" />
          <span>Sync Now</span>
          {pendingSales > 0 ? (
            <span className="ml-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingSales}
            </span>
          ) : (
            <span className="ml-1 text-xs opacity-70">✓</span>
          )}
        </>
      )}
    </button>
  );
}