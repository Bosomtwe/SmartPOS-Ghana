// src/pages/Inventory.tsx
import { useEffect, useState, useMemo } from 'react';
import { useProductStore } from '../stores/productStore';
import { useProductMutationStore } from '../stores/productMutationStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import api from '../services/api';  // needed for online export
import ProductModal from '../components/ProductModal';
import StockAdjustModal from '../components/StockAdjustModal';
import ImportModal from '../components/ImportModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { Button } from '../components/Button';
import {
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

const PAGE_SIZES = [10, 20, 50, 100];

const getPageNumbers = (current: number, total: number, maxButtons = 7) => {
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [];
  const leftSibling = Math.max(current - 2, 2);
  const rightSibling = Math.min(current + 2, total - 1);
  pages.push(1);
  if (leftSibling > 2) pages.push('ellipsis');
  for (let i = leftSibling; i <= rightSibling; i++) {
    pages.push(i);
  }
  if (rightSibling < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
};

/**
 * Removes any column whose header (case‑insensitive, trimmed) contains "cost_price".
 * Also strips UTF-8 BOM and handles extra spaces.
 */
function removeCostPriceColumnFromCSV(csvText: string): string {
  let lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return csvText;

  let firstLine = lines[0];
  if (firstLine.charCodeAt(0) === 0xFEFF) {
    firstLine = firstLine.slice(1);
  }

  const headers = firstLine.split(',').map(h => h.trim().toLowerCase());
  const costIndex = headers.findIndex(h => h.includes('cost_price'));
  if (costIndex === -1) return csvText;

  const newHeaders = headers.filter((_, idx) => idx !== costIndex).join(',');

  const newLines = [newHeaders];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length > costIndex) {
      row.splice(costIndex, 1);
      newLines.push(row.join(','));
    } else {
      newLines.push(lines[i]);
    }
  }
  return newLines.join('\n');
}

export default function Inventory() {
  const { products, loading, error, fetchProducts, syncProducts } = useProductStore();
  const { addMutation, syncMutations } = useProductMutationStore();
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  const [search, setSearch] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const activeProducts = useMemo(() => products.filter(p => p.isActive), [products]);

  const totalProducts = activeProducts.length;
  const totalQuantity = activeProducts.reduce((sum, p) => sum + (p.currentStock || 0), 0);
  const totalCost = activeProducts.reduce((sum, p) => sum + (p.currentStock || 0) * (p.costPrice || 0), 0);
  const totalRetail = activeProducts.reduce((sum, p) => sum + (p.currentStock || 0) * (p.sellingPrice || 0), 0);

  const formatCurrency = (val: number) =>
    `GHS ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatNumber = (val: number) => val.toLocaleString();

  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
      const matchesLowStock = showLowStockOnly ? p.currentStock <= p.lowStockThreshold : true;
      return matchesSearch && matchesLowStock;
    });
  }, [activeProducts, search, showLowStockOnly]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, showLowStockOnly]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const handleDelete = (id: string) => setDeleteTarget(id);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await addMutation({ type: 'DELETE', productId: deleteTarget, data: {} });
      addToast({ message: 'Product deleted (will sync when online)', type: 'success' });
      if (navigator.onLine) {
        syncProducts();
        // ✅ Only sync mutations if owner
        if (user?.role === 'OWNER') {
          syncMutations();
        }
      }
    } catch (err: any) {
      addToast({ message: err.message || 'Delete failed', type: 'error' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ✅ HYBRID EXPORT: online → server, offline → local generation
  const handleExport = async () => {
    setExporting(true);
    try {
      let csvText: string;

      if (navigator.onLine) {
        // Online: fetch fresh CSV from the server
        const response = await api.get('/products/export/', {
          responseType: 'text',
        });
        csvText = response.data;

        // If cashier, strip the cost_price column (server may still send it)
        if (user?.role !== 'OWNER') {
          csvText = removeCostPriceColumnFromCSV(csvText);
        }
      } else {
        // Offline: generate CSV from local store (activeProducts)
        const isOwner = user?.role === 'OWNER';
        const headers = isOwner
          ? ['name', 'sku', 'cost_price', 'selling_price', 'current_stock', 'low_stock_threshold']
          : ['name', 'sku', 'selling_price', 'current_stock', 'low_stock_threshold'];

        const rows = activeProducts.map(p => {
          const escapedName = `"${p.name.replace(/"/g, '""')}"`;
          const baseRow = [
            escapedName,
            p.sku || '',
            p.sellingPrice.toFixed(2),
            p.currentStock,
            p.lowStockThreshold,
          ];
          if (isOwner) {
            // Insert cost_price after sku (index 2)
            baseRow.splice(2, 0, p.costPrice.toFixed(2));
          }
          return baseRow.join(',');
        });
        csvText = [headers.join(','), ...rows].join('\n');
      }

      // Download the CSV
      const blob = new Blob([csvText], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_${new Date().toISOString().slice(0, 19)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast({ message: 'Export successful', type: 'success' });
    } catch (err) {
      console.error(err);
      addToast({ message: 'Export failed', type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // ✅ Only sync mutations if owner – prevents cashier loops
  const refreshAfterOnline = () => {
    if (navigator.onLine) {
      syncProducts();
      if (user?.role === 'OWNER') {
        syncMutations();
      }
    }
  };

  return (
    <div className="p-3 md:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleExport} disabled={exporting} className="flex items-center gap-1">
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          {user?.role === 'OWNER' && (
            <Button variant="secondary" onClick={() => setShowImportModal(true)} className="flex items-center gap-1">
              <ArrowUpTrayIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
          )}
          {user?.role === 'OWNER' && (
            <Button onClick={() => { setSelectedProduct(null); setShowProductModal(true); }} className="touch-manipulation">
              + Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards – Cashiers see only Products & Stock Qty */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl shadow p-3 md:p-4">
          <p className="text-xs md:text-sm text-gray-500 uppercase tracking-wide">Total Products</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{formatNumber(totalProducts)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-3 md:p-4">
          <p className="text-xs md:text-sm text-gray-500 uppercase tracking-wide">Total Stock Qty</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{formatNumber(totalQuantity)}</p>
        </div>
        {user?.role === 'OWNER' && (
          <div className="bg-white rounded-xl shadow p-3 md:p-4">
            <p className="text-xs md:text-sm text-gray-500 uppercase tracking-wide">Total Cost Value</p>
            <p className="text-xl md:text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCost)}</p>
          </div>
        )}
        {user?.role === 'OWNER' && (
          <div className="bg-white rounded-xl shadow p-3 md:p-4">
            <p className="text-xs md:text-sm text-gray-500 uppercase tracking-wide">Total Retail Value</p>
            <p className="text-xl md:text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalRetail)}</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 w-full p-2.5 border rounded-xl text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showLowStockOnly}
            onChange={(e) => setShowLowStockOnly(e.target.checked)}
            className="rounded h-4 w-4"
          />
          Show low stock only
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Show</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="border rounded-lg px-3 py-2 bg-white"
          >
            {PAGE_SIZES.map(size => (<option key={size} value={size}>{size}</option>))}
          </select>
          <span className="text-gray-500">per page</span>
        </div>
      </div>

      {loading && <div className="text-center py-8">Loading products...</div>}
      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

      {!loading && !error && (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {paginatedProducts.length === 0 && <div className="text-center py-8 text-gray-400">No products found.</div>}
            {paginatedProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-xl shadow p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{product.name}</h3>
                    {product.sku && <p className="text-xs text-gray-500 mt-0.5">SKU: {product.sku}</p>}
                  </div>
                  <span className={`text-sm font-bold ${product.currentStock <= product.lowStockThreshold ? 'text-red-600' : 'text-gray-700'}`}>
                    {product.currentStock} in stock
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div><span className="text-gray-500">Sell: </span><span className="font-medium">GHS {Number(product.sellingPrice).toFixed(2)}</span></div>
                  {user?.role === 'OWNER' && (
                    <div><span className="text-gray-500">Cost: </span><span className="font-medium">GHS {Number(product.costPrice).toFixed(2)}</span></div>
                  )}
                </div>
                <div className="flex gap-2 mt-1">
                  {user?.role === 'OWNER' ? (
                    <>
                      <button onClick={() => { setSelectedProduct(product); setShowProductModal(true); }} className="flex-1 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg">Edit</button>
                      <button onClick={() => { setSelectedProduct(product); setShowStockModal(true); }} className="flex-1 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg">Stock</button>
                      <button onClick={() => handleDelete(product.id)} className="flex-1 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg">Delete</button>
                    </>
                  ) : (
                    <div className="flex-1 text-center py-2 text-sm text-gray-400">View only</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto bg-white rounded-xl shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Selling Price</th>
                  {user?.role === 'OWNER' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost Price</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedProducts.map(product => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">{product.name}</td>
                    <td className="px-6 py-4 text-gray-500">{product.sku || '—'}</td>
                    <td className="px-6 py-4">GHS {Number(product.sellingPrice).toFixed(2)}</td>
                    {user?.role === 'OWNER' && (
                      <td className="px-6 py-4 text-gray-500">GHS {Number(product.costPrice).toFixed(2)}</td>
                    )}
                    <td className="px-6 py-4">
                      <span className={product.currentStock <= product.lowStockThreshold ? 'text-red-600 font-bold' : ''}>
                        {product.currentStock}
                      </span>
                    </td>
                    <td className="px-6 py-4 space-x-2">
                      {user?.role === 'OWNER' ? (
                        <>
                          <button onClick={() => { setSelectedProduct(product); setShowProductModal(true); }} className="text-blue-600 hover:underline">Edit</button>
                          <button onClick={() => { setSelectedProduct(product); setShowStockModal(true); }} className="text-green-600 hover:underline">Stock</button>
                          <button onClick={() => handleDelete(product.id)} className="text-red-600 hover:underline">Delete</button>
                        </>
                      ) : (
                        <span className="text-gray-400 text-sm">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
                {paginatedProducts.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredProducts.length > 0 && (
            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <p className="text-sm text-gray-500">
                Showing {Math.min((currentPage - 1) * pageSize + 1, filteredProducts.length)}–
                {Math.min(currentPage * pageSize, filteredProducts.length)} of {filteredProducts.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-lg border hover:bg-gray-100 disabled:opacity-40">
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                {getPageNumbers(currentPage, totalPages).map((page, idx) =>
                  page === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 py-1 text-sm text-gray-400">…</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium ${page === currentPage ? 'bg-green-600 text-white' : 'border hover:bg-gray-100'}`}
                    >
                      {page}
                    </button>
                  )
                )}
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg border hover:bg-gray-100 disabled:opacity-40">
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showProductModal && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setShowProductModal(false)}
          onSuccess={() => {
            setShowProductModal(false);
            refreshAfterOnline();
          }}
        />
      )}
      {showStockModal && selectedProduct && (
        <StockAdjustModal
          product={selectedProduct}
          onClose={() => setShowStockModal(false)}
          onSuccess={() => {
            setShowStockModal(false);
            refreshAfterOnline();
          }}
        />
      )}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            refreshAfterOnline();
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Product"
          message="Are you sure you want to delete this product? This action cannot be undone."
          loading={deleting}
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}