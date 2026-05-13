// src/components/SearchBar.tsx
import { MagnifyingGlassIcon, CameraIcon } from '@heroicons/react/24/outline';
import { useState, forwardRef } from 'react';
import BarcodeScannerModal from './BarcodeScannerModal';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onBarcodeScan?: (barcode: string) => void;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, onBarcodeScan }, ref) => {
    const [showScanner, setShowScanner] = useState(false);

    const handleScan = (barcode: string) => {
      if (onBarcodeScan) {
        onBarcodeScan(barcode);
      } else {
        onChange(barcode);
      }
    };

    return (
      <>
        <div className="relative flex items-center">
          <MagnifyingGlassIcon className="absolute left-3 h-5 w-5 text-gray-400" />
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search product by name or barcode..."
            className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-shadow"
          />
          {onBarcodeScan && (
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="absolute right-3 p-1 text-gray-500 hover:text-green-600 transition-colors"
              aria-label="Scan barcode"
            >
              <CameraIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {showScanner && (
          <BarcodeScannerModal onScan={handleScan} onClose={() => setShowScanner(false)} />
        )}
      </>
    );
  }
);