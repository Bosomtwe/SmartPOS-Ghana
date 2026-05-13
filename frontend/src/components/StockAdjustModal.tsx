// src/components/StockAdjustModal.tsx
import { useState } from 'react';
import { useInventoryStore } from '../stores/inventoryStore';
import { Button } from './Button';

interface Props {
  product: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StockAdjustModal({ product, onClose, onSuccess }: Props) {
  const { adjustStock } = useInventoryStore();
  const [quantityStr, setQuantityStr] = useState('0');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleQuickAdjust = (delta: number) => {
    const current = parseInt(quantityStr, 10) || 0;
    setQuantityStr(String(current + delta));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity)) {
      setError('Please enter a valid number.');
      return;
    }
    if (quantity === 0) {
      setError('Quantity must be non-zero to adjust stock.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await adjustStock(product.id, quantity, reason);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Stock adjustment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4">Adjust Stock: {product.name}</h2>
        <p className="text-sm text-gray-600 mb-2">
          Current stock: <span className="font-bold">{product.current_stock}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick adjustment buttons */}
          <div className="flex flex-wrap gap-2">
            {[-10, -5, -1, 1, 5, 10].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => handleQuickAdjust(delta)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full border ${
                  delta < 0
                    ? 'border-red-200 hover:bg-red-50 text-red-600'
                    : 'border-green-200 hover:bg-green-50 text-green-600'
                }`}
              >
                {delta > 0 ? '+' : ''}{delta}
              </button>
            ))}
          </div>

          {/* Quantity input */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Quantity (positive to add, negative to subtract)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              className="w-full p-3 border rounded-lg text-lg"
              required
              min={-product.current_stock}
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2 border rounded-lg"
              placeholder="e.g., damaged goods, restocking"
            />
          </div>

          {error && (
            <div className="p-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Stock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}