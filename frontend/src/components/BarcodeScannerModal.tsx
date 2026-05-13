import { useState } from 'react';
import BarcodeScanner from 'react-qr-barcode-scanner';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScannerModal({ onScan, onClose }: Props) {
  const [error, setError] = useState('');

  const handleScan = (data: string | null) => {
    if (data) {
      onScan(data);
      onClose();
    }
  };

  const handleError = (err: any) => {
    setError(err.message);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded w-full max-w-md">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold">Scan Barcode</h3>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>
        <BarcodeScanner
          onUpdate={(err, result) => {
            if (result) handleScan(result.getText());
            if (err) handleError(err);
          }}
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>
    </div>
  );
}