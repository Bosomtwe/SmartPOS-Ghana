// src/components/ImportModal.tsx
import { useState, type DragEvent } from 'react';
import api from '../services/api';
import { useUIStore } from '../stores/uiStore';
import { DocumentIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportModal({ onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { addToast } = useUIStore();

  const handleFileSelection = (selectedFile: File) => {
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const isValid = validTypes.includes(selectedFile.type) ||
                    selectedFile.name.endsWith('.csv') ||
                    selectedFile.name.endsWith('.xlsx') ||
                    selectedFile.name.endsWith('.xls');

    if (!isValid) {
      setError('Invalid file type. Please upload a CSV or Excel file.');
      setFile(null);
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10MB.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError('');
    setImportResult(null);
  };

  const handleBrowse = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv, .xlsx, .xls';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        handleFileSelection(target.files[0]);
      }
    };
    input.click();
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setLoading(true);
    setError('');
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log('Uploading file:', file.name, file.size);

      const response = await api.post('/products/bulk/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('Response:', response.data);

      const { created, updated, errors } = response.data;
      setImportResult({ created, updated, errors });

      if (errors && errors.length > 0) {
        addToast({
          message: `Import completed with ${errors.length} errors. Created: ${created}, Updated: ${updated}`,
          type: 'warning',
        });
      } else {
        addToast({
          message: `Import successful! Created: ${created}, Updated: ${updated}`,
          type: 'success',
        });
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      let errorMsg = 'Import failed';
      if (err.response) {
        if (err.response.status === 403) {
          errorMsg = 'Access denied. Only the shop owner can import products.';
        } else {
          errorMsg = err.response.data?.error || `Server error: ${err.response.status}`;
        }
      } else if (err.request) {
        errorMsg = 'Network error. Please check your connection.';
      } else {
        errorMsg = err.message || 'Unknown error';
      }
      setError(errorMsg);
      addToast({ message: errorMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/products/template/', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'product_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      addToast({ message: 'Failed to download template', type: 'error' });
    }
  };

  const clearFile = () => {
    setFile(null);
    setError('');
    setImportResult(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Import Products</h2>

        <p className="mb-2 text-sm text-gray-700">
          Upload an Excel or CSV file with the following columns:
        </p>
        <div className="bg-gray-100 p-2 rounded text-xs font-mono mb-3 break-all">
          name, SKU (Barcode), cost_price, selling_price, current_stock, Low Stock Threshold, expiry, initial_stock
        </div>
        <div className="text-xs text-gray-500 mb-3">
          <span className="font-bold">Required:</span> name<br />
          <span className="font-bold">Optional:</span> all other columns (defaults: cost_price=0, selling_price=0, current_stock=0, Low Stock Threshold=5)<br />
          <span className="font-bold">Note:</span> <code>expiry</code> and <code>initial_stock</code> are stored in custom fields.
        </div>

        <button
          type="button"
          onClick={downloadTemplate}
          className="text-blue-600 hover:underline text-sm mb-4 inline-flex items-center gap-1"
        >
          <DocumentIcon className="h-4 w-4" />
          Download template CSV
        </button>

        <form onSubmit={handleSubmit}>
          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 mb-4 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleBrowse}
          >
            <ArrowUpTrayIcon className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            {file ? (
              <div className="text-sm">
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="mt-2 text-red-600 hover:underline text-xs"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">
                  Click to browse or drag & drop
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  CSV, Excel (.xlsx, .xls) up to 10MB
                </p>
              </>
            )}
          </div>

          {error && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>
          )}

          {importResult && (
            <div className="mb-4 text-sm">
              <p className="font-medium">
                ✅ Created: {importResult.created} | Updated: {importResult.updated}
              </p>
              {importResult.errors.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto border p-2 bg-red-50 rounded">
                  <p className="font-semibold text-red-700">Row Errors:</p>
                  <ul className="list-disc list-inside text-red-600 text-xs">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}