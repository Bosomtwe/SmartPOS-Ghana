// src/components/ProductModal.tsx
import { useState, useEffect } from 'react';
import { useProductMutationStore } from '../stores/productMutationStore';
import { useAuthStore } from '../stores/authStore';
import { DEFAULT_EXPIRY_ALERT_DAYS } from '../constants';
import { useProductStore } from '../stores/productStore';

interface ProductForm {
  name: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  low_stock_threshold: number;
  customFields: Record<string, any>;
  initialStock: number;
  is_restricted: boolean;
  secret_code: string;
}

interface Props {
  product?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProductModal({ product, onClose, onSuccess }: Props) {
  const { addMutation } = useProductMutationStore();
  const { updateProductFromServer, syncProducts } = useProductStore();
  const { user } = useAuthStore();
  const isOwner = user?.role === 'OWNER';

  const [form, setForm] = useState<ProductForm>({
    name: '',
    sku: '',
    cost_price: 0,
    selling_price: 0,
    current_stock: 0,
    low_stock_threshold: 5,
    customFields: {},
    initialStock: 0,
    is_restricted: false,
    secret_code: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ✅ Track whether the user has explicitly set initial stock
  const [hasSetInitialStock, setHasSetInitialStock] = useState(false);

  useEffect(() => {
    if (product) {
      const customFields = product.customFields || {};
      const existingInitial = customFields.initial_stock; // ← define before using
      setForm({
        name: product.name || '',
        sku: product.sku || '',
        cost_price: product.costPrice ?? 0,
        selling_price: product.sellingPrice ?? 0,
        current_stock: product.currentStock ?? 0,
        low_stock_threshold: product.lowStockThreshold ?? 5,
        customFields,
        // Use the actual initial stock if set, else default to 0 (will be replaced on create)
        initialStock: existingInitial ?? 0,
        is_restricted: product.isRestricted || false,
        secret_code: product.secretCode || '',
      });
      // If product already has an initial_stock, mark it as set
      if (existingInitial !== undefined) {
        setHasSetInitialStock(true);
      } else {
        setHasSetInitialStock(false);
      }
    } else {
      // New product: reset flag
      setHasSetInitialStock(false);
    }
  }, [product]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setForm({ ...form, [name]: checked });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      customFields: {
        ...form.customFields,
        expiry: e.target.value,
      },
    });
  };

  // ✅ Handle initial stock input (allows deleting zero) ✅ Updated: also marks the field as touched
  const handleInitialStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasSetInitialStock(true); // user intentionally edited the field
    const raw = e.target.value;
    if (raw === '') {
      setForm({
        ...form,
        initialStock: 0,
        customFields: {
          ...form.customFields,
          initial_stock: 0,
        },
      });
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val >= 0) {
      setForm({
        ...form,
        initialStock: val,
        customFields: {
          ...form.customFields,
          initial_stock: val,
        },
      });
    }
  };

  // ✅ Handle expiry alert days (store in customFields)
  const handleExpiryAlertChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      // Remove the key if the user wants to use the global default
      const { expiry_alert_days, ...rest } = form.customFields;
      setForm({
        ...form,
        customFields: rest,
      });
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val >= 0) {
      setForm({
        ...form,
        customFields: {
          ...form.customFields,
          expiry_alert_days: val,
        },
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // ✅ Compute initial stock: if left empty, use current stock (for new products)
    const initialStockValue = hasSetInitialStock
      ? Number(form.initialStock) 
      : Number(form.current_stock);

    const data = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      cost_price: Number(form.cost_price),
      selling_price: Number(form.selling_price),
      current_stock: Number(form.current_stock),
      low_stock_threshold: Number(form.low_stock_threshold),
      custom_fields: {
        ...form.customFields,
        //initial_stock: Number(form.initialStock) || 0,
        initial_stock: initialStockValue,
      },
      is_restricted: form.is_restricted,
      secret_code: form.secret_code?.trim() || null,
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

      // ✅ Refresh the specific product from server to ensure UI reflects actual data
      if (product) {
        await updateProductFromServer(product.id);
      } else {
        // For new products, a full sync is needed to get the server-generated ID
        await syncProducts();
      }

      onSuccess();
      onClose(); // ✅ Close modal after success 
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
      <div className="bg-white p-6 rounded w-full max-w-md max-h-[90vh] overflow-y-auto">
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

          {/* Cost Price – hidden for cashiers */}
          {isOwner && (
            <div className="mb-2">
              <label className="block text-sm font-medium">Cost Price</label>
              <input type="number" step="0.01" name="cost_price" value={form.cost_price} onChange={handleChange} className="border p-2 w-full rounded" />
            </div>
          )}

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

          {/* Expiry Date */}
          <div className="mb-4">
            <label className="block text-sm font-medium">Expiry Date (optional)</label>
            <input
              type="date"
              value={form.customFields?.expiry || ''}
              onChange={handleExpiryChange}
              className="border p-2 w-full rounded"
            />
            <p className="text-xs text-gray-400 mt-1">Set a date to receive expiry alerts.</p>
          </div>

          {/* ✅ Expiry Alert Threshold – owners only */}
          {isOwner && (
            <div className="mb-4">
              <label className="block text-sm font-medium">
                Expiry Alert (days before)
                <span className="text-xs text-gray-400 ml-2">(global default: {DEFAULT_EXPIRY_ALERT_DAYS})</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.customFields?.expiry_alert_days ?? ''}
                onChange={handleExpiryAlertChange}
                className="border p-2 w-full rounded"
                placeholder={`Default: ${DEFAULT_EXPIRY_ALERT_DAYS}`}
              />
              <p className="text-xs text-gray-400 mt-1">
                Set to 0 to disable alerts for this product.
              </p>
            </div>
          )}

          {/* Initial Stock – owners only */}
          {isOwner && (
            <div className="mb-4">
              <label className="block text-sm font-medium">
                Initial Stock <span className="text-xs text-gray-400">(for sell‑through tracking)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.initialStock === 0 ? '' : form.initialStock}
                onChange={handleInitialStockChange}
                className="border p-2 w-full rounded"
                placeholder="0"
              />
              <p className="text-xs text-yellow-600 mt-1">
                ⚠️ Changing this affects sell‑through calculations.
              </p>
            </div>
          )}

          {/* Restricted product fields (commented out – uncomment when needed) */}
          {/*
          {isOwner && (
            <div className="mb-4 flex items-center gap-3">
              <input type="checkbox" id="isRestricted" name="is_restricted" checked={form.is_restricted} onChange={handleChange} className="h-5 w-5 rounded" />
              <label htmlFor="isRestricted" className="text-sm font-medium text-gray-700">Restricted (requires secret code to sell)</label>
            </div>
          )}
          {form.is_restricted && (
            <div className="mb-4">
              <label className="block text-sm font-medium">Secret Code</label>
              <input type="text" name="secret_code" value={form.secret_code || ''} onChange={handleChange} className="border p-2 w-full rounded" placeholder="e.g., WHSKY2024" />
            </div>
          )}
          */}

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