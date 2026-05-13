// src/components/CustomerModal.tsx
import { useState, useEffect } from 'react';
import { useCustomerStore } from '../stores/customerStore';

interface Props {
  customer?: any; // if defined, edit mode
  onClose: () => void;
  onSuccess: () => void;
}

export default function CustomerModal({ customer, onClose, onSuccess }: Props) {
  const { createCustomer, updateCustomer } = useCustomerStore();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    creditLimit: '',   // camelCase, stores string for input
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name || '',
        phone: customer.phone || '',
        // ✅ use customer.creditLimit (camelCase), convert to string for input
        creditLimit: customer.creditLimit !== null && customer.creditLimit !== undefined
          ? String(customer.creditLimit)
          : '',
      });
    }
  }, [customer]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Build data with camelCase as expected by the store
    const data = {
      name: form.name,
      phone: form.phone || undefined,
      creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
    };
    try {
      if (customer) {
        await updateCustomer(customer.id, data);
      } else {
        await createCustomer(data);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">{customer ? 'Edit Customer' : 'Add Customer'}</h2>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-2">
            <label className="block text-sm font-medium">Name *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="border p-2 w-full rounded"
            />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium">Phone</label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium">Credit Limit (optional)</label>
            <input
              type="number"
              step="0.01"
              name="creditLimit"   // ✅ camelCase
              value={form.creditLimit}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            />
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