// src/components/ProductModal.tsx
import { useState, useEffect } from 'react';
import { useProductMutationStore } from '../stores/productMutationStore';

interface Props {
  product?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProductModal({ product, onClose, onSuccess }: Props) {
  const { addMutation } = useProductMutationStore();
  const [form, setForm] = useState({
    name: '',
    sku: '',
    cost_price: 0,
    selling_price: 0,
    current_stock: 0,
    low_stock_threshold: 5,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        sku: product.sku || '',
        cost_price: product.costPrice ?? 0,
        selling_price: product.sellingPrice ?? 0,
        current_stock: product.currentStock ?? 0,
        low_stock_threshold: product.lowStockThreshold ?? 5,
      });
    }
  }, [product]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const data = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      cost_price: Number(form.cost_price),
      selling_price: Number(form.selling_price),
      current_stock: Number(form.current_stock),
      low_stock_threshold: Number(form.low_stock_threshold),
    };

    try {
      if (product) {
        await addMutation({
          type: 'UPDATE',
          productId: product.id,
          data,
        });
      } else {
        await addMutation({
          type: 'CREATE',
          data: { ...data, id: crypto.randomUUID() },
        });
      }
      onSuccess();
    } catch (err: any) {
      let errorMessage = 'An error occurred';
      if (err.response?.data?.error) errorMessage = err.response.data.error;
      else if (err.response?.data?.detail) errorMessage = err.response.data.detail;
      else if (err.message) errorMessage = err.message;
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">{product ? 'Edit Product' : 'Add Product'}</h2>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-2">
            <label className="block text-sm font-medium">Name *</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} required className="border p-2 w-full rounded" />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium">SKU (Barcode)</label>
            <input type="text" name="sku" value={form.sku} onChange={handleChange} className="border p-2 w-full rounded" />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium">Cost Price</label>
            <input type="number" step="0.01" name="cost_price" value={form.cost_price} onChange={handleChange} className="border p-2 w-full rounded" />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium">Selling Price *</label>
            <input type="number" step="0.01" name="selling_price" value={form.selling_price} onChange={handleChange} required className="border p-2 w-full rounded" />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium">Current Stock</label>
            <input type="number" name="current_stock" value={form.current_stock} onChange={handleChange} className="border p-2 w-full rounded" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium">Low Stock Threshold</label>
            <input type="number" name="low_stock_threshold" value={form.low_stock_threshold} onChange={handleChange} className="border p-2 w-full rounded" />
          </div>
          <div className="flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}