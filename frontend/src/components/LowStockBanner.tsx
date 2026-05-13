// src/components/LowStockBanner.tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { useProductStore } from '../stores/productStore';
import type { Product } from '../lib/dexie';

export const LowStockBanner = () => {
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const { products, fullyLoaded } = useProductStore();

  useEffect(() => {
    if (!fullyLoaded) return;
    const alerts = products.filter(
      (p) => p.currentStock <= p.lowStockThreshold && p.isActive
    );
    setLowStockProducts(alerts);
  }, [products, fullyLoaded]);

  if (!fullyLoaded) return null;

  const outOfStock = lowStockProducts.filter((p) => p.currentStock === 0);
  const lowStock = lowStockProducts.filter((p) => p.currentStock > 0);
  const totalAlerts = lowStockProducts.length;

  return (
    <AnimatePresence>
      {totalAlerts > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="mx-3 mt-2 rounded-xl overflow-hidden bg-red-50 border border-red-200"
        >
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-left focus:outline-none active:bg-red-100/50 transition-colors"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-red-500" />
              <span className="text-xs font-semibold text-red-800 truncate">
                {totalAlerts} low stock alert{totalAlerts > 1 ? 's' : ''}
              </span>
              <span className="text-[10px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full font-medium">
                {outOfStock.length > 0 && `${outOfStock.length} out`}
                {outOfStock.length > 0 && lowStock.length > 0 && ', '}
                {lowStock.length > 0 && `${lowStock.length} low`}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-red-500 flex-shrink-0 transition-transform ${
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
                  {outOfStock.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {outOfStock.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center text-[11px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                        >
                          {p.name} <span className="ml-1 font-bold">0</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {lowStock.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {lowStock.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                        >
                          {p.name}{' '}
                          <span className="ml-1 font-bold">{p.currentStock}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};