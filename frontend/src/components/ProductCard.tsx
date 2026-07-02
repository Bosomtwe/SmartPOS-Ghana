// src/components/ProductCard.tsx
import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useCartStore } from '../stores/cartStore';
import { useUIStore } from '../stores/uiStore';
import type { Product } from '../lib/dexie';
import { DEFAULT_EXPIRY_ALERT_DAYS } from '../constants';

interface ProductCardProps {
  product: Product;
  onFlyStart?: (element: HTMLElement) => void;
}

export const ProductCard = ({ product, onFlyStart }: ProductCardProps) => {
  const cardRef = useRef<HTMLButtonElement>(null);
  const { addItem } = useCartStore();
  const { addToast, productCardDensity } = useUIStore();
  const isCompact = productCardDensity === 'compact';

  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    const check = () => setIsLandscape(window.innerHeight < window.innerWidth);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!product) return null;

  const currentStock = product.currentStock ?? 0;
  const lowStockThreshold = product.lowStockThreshold ?? 5;
  const sellingPrice = product.sellingPrice ?? 0;
  const isOutOfStock = currentStock <= 0;
  const isLowStock = !isOutOfStock && currentStock <= lowStockThreshold;

  // ✅ Expiry handling with custom alert days
  const expiry = product.customFields?.expiry;
  const alertDays = product.customFields?.expiry_alert_days ?? DEFAULT_EXPIRY_ALERT_DAYS;
  const daysUntilExpiry = expiry
    ? Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isExpiringSoon =
    daysUntilExpiry !== null &&
    daysUntilExpiry >= 0 &&
    daysUntilExpiry <= alertDays;

  const handleClick = () => {
    if (isOutOfStock) {
      addToast({
        message: `${product.name} is out of stock.`,
        type: 'warning',
        duration: 3000,
      });
      return;
    }
    if (onFlyStart && cardRef.current) {
      onFlyStart(cardRef.current);
    }
    addItem(product);
  };

  // Landscape compact mode
  if (isLandscape && isCompact) {
    return (
      <motion.button
        ref={cardRef}
        onClick={handleClick}
        disabled={isOutOfStock}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 p-2 bg-white rounded-xl shadow-card text-left w-full hover:shadow-card-hover transition-shadow"
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center text-green-600 font-bold">
          {product.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{product.name}</div>
          <div className="text-base font-bold text-green-600">GHS {sellingPrice.toFixed(2)}</div>
          {isExpiringSoon && (
            <div className="text-[10px] text-red-600 font-bold">Expires soon!</div>
          )}
          {expiry && !isExpiringSoon && (
            <div className="text-[10px] text-gray-400">
              Exp: {new Date(expiry).toLocaleDateString()}
            </div>
          )}
        </div>
        {isOutOfStock && <span className="text-xs text-red-600 font-medium">Out</span>}
        {isLowStock && !isOutOfStock && <span className="text-xs text-red-600">{currentStock}</span>}
      </motion.button>
    );
  }

  const cardPadding = (isLandscape && !isCompact) ? 'p-2' : (isCompact ? 'p-3' : 'p-3 md:p-4');

  const cardClasses = `
    group relative flex flex-col ${cardPadding} bg-white rounded-2xl shadow-card transition-all text-left
    ${isOutOfStock ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:shadow-card-hover cursor-pointer'}
  `;

  if (isCompact) {
    return (
      <motion.button
        ref={cardRef}
        onClick={handleClick}
        disabled={isOutOfStock}
        whileHover={!isOutOfStock ? { y: -2 } : {}}
        whileTap={!isOutOfStock ? { scale: 0.98 } : {}}
        transition={{ duration: 0.2 }}
        className={cardClasses}
      >
        {isOutOfStock && (
          <span className="absolute top-2 right-2 bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            Out
          </span>
        )}
        {isLowStock && (
          <span className="absolute top-2 right-2 bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {currentStock}
          </span>
        )}
        {isExpiringSoon && (
          <span className="absolute top-2 right-2 bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            Expires!
          </span>
        )}
        <span className="text-sm font-bold text-gray-900 break-words line-clamp-2 group-hover:text-green-600 transition-colors">
          {product.name || 'Unnamed'}
        </span>
        <span className="text-base font-bold text-green-600 mt-1">
          GHS {sellingPrice.toFixed(2)}
        </span>
        <span className={`text-xs mt-0.5 font-medium ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-red-600' : 'text-green-600'}`}>
          {isOutOfStock ? 'Out of stock' : `${currentStock} left`}
        </span>
        {expiry && !isExpiringSoon && (
          <span className="text-[10px] text-gray-400 mt-0.5">
            Exp: {new Date(expiry).toLocaleDateString()}
          </span>
        )}
      </motion.button>
    );
  }

  // Comfortable (default) view
  return (
    <motion.button
      ref={cardRef}
      onClick={handleClick}
      disabled={isOutOfStock}
      whileHover={!isOutOfStock ? { y: -2 } : {}}
      whileTap={!isOutOfStock ? { scale: 0.98 } : {}}
      transition={{ duration: 0.2 }}
      className={cardClasses}
    >
      <div className="w-full h-20 md:h-24 mb-3 rounded-2xl bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center">
        <span className="text-2xl md:text-3xl font-bold text-green-600">
          {product.name.charAt(0).toUpperCase()}
        </span>
      </div>

      {isOutOfStock && (
        <span className="absolute top-3 right-3 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
          Out of stock
        </span>
      )}
      {isLowStock && (
        <span className="absolute top-3 right-3 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
          Low: {currentStock}
        </span>
      )}
      {isExpiringSoon && (
        <span className="absolute top-3 right-3 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
          Expires soon!
        </span>
      )}

      <span className="text-sm md:text-base font-bold text-gray-900 break-words group-hover:text-green-600 transition-colors">
        {product.name || 'Unnamed Product'}
      </span>
      {product.sku && (
        <span className="text-xs text-gray-500 mt-0.5">SKU: {product.sku}</span>
      )}
      <span className="text-lg md:text-xl font-bold mt-1 text-green-600">
        GHS {sellingPrice.toFixed(2)}
      </span>
      <span className={`text-xs mt-1 font-medium ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-red-600' : 'text-green-600'}`}>
        {isOutOfStock ? 'Out of stock' : `${currentStock} in stock`}
      </span>
      {expiry && !isExpiringSoon && (
        <span className="text-xs text-gray-400 mt-0.5">
          Exp: {new Date(expiry).toLocaleDateString()}
        </span>
      )}
    </motion.button>
  );
};