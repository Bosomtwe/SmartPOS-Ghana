// src/components/CartItem.tsx
import { TrashIcon, MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

interface CartItemProps {
  item: {
    product: { id: string; name: string; sellingPrice: number; currentStock?: number };
    quantity: number;
  };
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}

const getNumericPrice = (price: any): number => {
  if (typeof price === 'number') return price;
  const parsed = parseFloat(price);
  return isNaN(parsed) ? 0 : parsed;
};

export const CartItem = ({ item, onUpdateQuantity, onRemove }: CartItemProps) => {
  const price = getNumericPrice(item.product.sellingPrice);
  const quantity = typeof item.quantity === 'number' ? item.quantity : 1;
  const total = price * quantity;
  const stock = item.product.currentStock ?? 0;
  const isLowStock = stock < quantity;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white rounded-2xl shadow-card border border-gray-100"
    >
      {/* Product details and price */}
      <div className="flex-1 min-w-0">
        <h4 className="text-base font-semibold text-gray-900 line-clamp-2 break-words">
          {item.product.name}
        </h4>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-gray-600">GHS {price.toFixed(2)} each</span>
          {isLowStock && (
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              Only {stock} left
            </span>
          )}
        </div>
      </div>

      {/* Right side: controls and total */}
      <div className="flex items-center justify-between sm:justify-end gap-4">
        {/* Quantity stepper */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdateQuantity(quantity - 1)}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            aria-label="Decrease quantity"
          >
            <MinusIcon className="h-5 w-5" />
          </button>
          <span className="w-8 text-center text-lg font-semibold text-gray-900">
            {quantity}
          </span>
          <button
            onClick={() => onUpdateQuantity(quantity + 1)}
            disabled={quantity >= stock}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors shadow-sm"
            aria-label="Increase quantity"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Item total */}
        <div className="w-20 text-right">
          <span className="text-lg font-bold text-gray-900">
            GHS {total.toFixed(2)}
          </span>
        </div>

        {/* Delete button */}
        <button
          onClick={onRemove}
          className="w-11 h-11 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700 active:bg-red-100 transition-colors"
          aria-label="Remove item"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </motion.div>
  );
};