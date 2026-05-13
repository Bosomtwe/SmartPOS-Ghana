// src/components/ProductListItem.tsx
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';
import { useCartStore } from '../stores/cartStore';
import { useUIStore } from '../stores/uiStore';
import type { Product } from '../lib/dexie';

export const ProductListItem = ({ product }: { product: Product }) => {
  const { items, addItem, updateQuantity } = useCartStore();
  const { addToast } = useUIStore();
  const cartItem = items.find(i => i.product.id === product.id);
  const quantity = cartItem?.quantity || 0;
  const currentStock = product.currentStock ?? 0;
  const lowStockThreshold = product.lowStockThreshold ?? 5;
  const isOutOfStock = currentStock <= 0;
  const isLowStock = !isOutOfStock && currentStock <= lowStockThreshold;

  const handleIncrement = () => {
    if (isOutOfStock) {
      addToast({ message: `${product.name} is out of stock.`, type: 'warning' });
      return;
    }
    if (quantity === 0) addItem(product);
    else updateQuantity(product.id, quantity + 1);
  };

  const handleDecrement = () => {
    if (quantity > 0) updateQuantity(product.id, quantity - 1);
  };

  // Determine stock status color
  const stockStatusColor = isOutOfStock
    ? 'text-red-600'
    : isLowStock
    ? 'text-red-600 font-medium'
    : 'text-green-600';

  return (
    <div className="flex items-center justify-between py-4 px-4 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Left side: Product info */}
      <div className="flex-1 min-w-0 pr-3">
        <h4 className="text-base font-semibold text-gray-900 break-words leading-tight">
          {product.name}
        </h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span className="text-lg font-bold text-green-700">
            GHS {product.sellingPrice.toFixed(2)}
          </span>
          <span className={`text-sm ${stockStatusColor}`}>
            {isOutOfStock ? 'Out of stock' : `${currentStock} in stock`}
          </span>
        </div>
        {product.sku && (
          <p className="text-xs text-gray-400 mt-0.5">SKU: {product.sku}</p>
        )}
      </div>

      {/* Right side: Quantity controls */}
      <div className="flex items-center gap-3 ml-2 flex-shrink-0">
        {quantity > 0 ? (
          <>
            <button
              onClick={handleDecrement}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-colors"
              aria-label="Decrease quantity"
            >
              <MinusIcon className="h-5 w-5" />
            </button>
            <span className="w-8 text-center text-lg font-semibold text-gray-900">
              {quantity}
            </span>
            <button
              onClick={handleIncrement}
              disabled={quantity >= currentStock}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors shadow-sm"
              aria-label="Increase quantity"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </>
        ) : isOutOfStock ? (
          <span className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-full border border-red-200">
            Out of stock
          </span>
        ) : (
          <button
            onClick={handleIncrement}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-colors shadow-md"
            aria-label="Add to cart"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
};