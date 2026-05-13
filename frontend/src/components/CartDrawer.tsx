// src/components/CartDrawer.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { CartItem } from './CartItem';
import { Button } from './Button';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  total: number;
  onUpdateQuantity: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
}

export const CartDrawer = ({
  isOpen,
  onClose,
  items,
  total,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}: CartDrawerProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 flex flex-col
                       max-h-[85vh] landscape:max-h-[70vh]"
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-100">
              <h2 className="text-lg font-semibold text-neutral-900">
                Your Cart ({items.length} {items.length === 1 ? 'item' : 'items'})
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
                aria-label="Close cart"
              >
                <XMarkIcon className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {items.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                  <p>Your cart is empty</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <CartItem
                      key={item.product.id}
                      item={item}
                      onUpdateQuantity={(qty) => onUpdateQuantity(item.product.id, qty)}
                      onRemove={() => onRemove(item.product.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 pb-safe-bottom">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-neutral-700 font-medium">Total</span>
                  <span className="text-2xl font-bold text-primary">
                    GHS {total.toFixed(2)}
                  </span>
                </div>
                <Button onClick={onCheckout} size="lg" className="w-full">
                  Proceed to Payment
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};