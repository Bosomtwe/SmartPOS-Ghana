// src/components/ExpiryBanner.tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { useProductStore } from '../stores/productStore';
import type { Product } from '../lib/dexie';
import { DEFAULT_EXPIRY_ALERT_DAYS } from '../constants';

export const ExpiryBanner = () => {
  const [expiringProducts, setExpiringProducts] = useState<Product[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const { products, fullyLoaded } = useProductStore();

  useEffect(() => {
    if (!fullyLoaded) return;
    const now = new Date();
    const expiring = products.filter((p) => {
      if (!p.customFields?.expiry || !p.isActive) return false;
      const expiryDate = new Date(p.customFields.expiry);
      const alertDays = p.customFields?.expiry_alert_days ?? DEFAULT_EXPIRY_ALERT_DAYS;
      const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= alertDays;
    });
    setExpiringProducts(expiring);
  }, [products, fullyLoaded]);

  if (!fullyLoaded || expiringProducts.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mx-3 mt-2 rounded-xl overflow-hidden bg-orange-50 border border-orange-200"
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 text-left focus:outline-none active:bg-orange-100/50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-orange-500" />
            <span className="text-xs font-semibold text-orange-800 truncate">
              ⚠️ {expiringProducts.length} product{expiringProducts.length > 1 ? 's' : ''} expiring soon!
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-orange-500 flex-shrink-0 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="max-h-[120px] overflow-y-auto px-3 pb-2">
                <div className="flex flex-wrap gap-1">
                  {expiringProducts.map((p) => {
                    const daysLeft = Math.ceil(
                      (new Date(p.customFields.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    );
                    const alertDays = p.customFields?.expiry_alert_days ?? DEFAULT_EXPIRY_ALERT_DAYS;
                    const isUrgent = daysLeft <= alertDays * 0.3; // e.g., if 30% of alert days left
                    return (
                      <span
                        key={p.id}
                        className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          isUrgent ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {p.name} <span className="ml-1 font-bold">{daysLeft}d</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};