import { useRef, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useAuthStore } from '../stores/authStore';
import { useCustomerStore } from '../stores/customerStore';
import { useProductStore } from '../stores/productStore';
import type { Sale } from '../lib/dexie';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
}

interface EnrichedItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  name: string;
}

export const ReceiptModal = ({ isOpen, onClose, sale }: ReceiptModalProps) => {
  const { shop, user } = useAuthStore();
  const { customers } = useCustomerStore();
  const { products } = useProductStore(); // ✅ just use existing products, no fetch
  const [enrichedItems, setEnrichedItems] = useState<EnrichedItem[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  // Enrich items with product names whenever sale or products change
  useEffect(() => {
    if (!sale) {
      setEnrichedItems([]);
      return;
    }

    const items = sale.items || [];
    if (items.length === 0) {
      setEnrichedItems([]);
      return;
    }

    // Build a quick lookup map from products array
    const productMap = new Map();
    products.forEach(p => productMap.set(p.id, p.name));

    const enriched = items.map((item) => {
      // If item already has a name (offline sale), use it
      if (item.name) {
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          name: item.name,
        };
      }
      // Otherwise find product name from the cache
      const productName = productMap.get(item.productId);
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        name: productName || 'Unknown Product',
      };
    });
    setEnrichedItems(enriched);
  }, [sale, products]);

  if (!sale) return null;

  const customer = sale.customerId
    ? customers.find((c) => c.id === sale.customerId)
    : null;

  const totalItems = enrichedItems.reduce((sum, item) => sum + item.quantity, 0);
  const itemLabel = totalItems === 1 ? 'item' : 'items';
  const subtotal = enrichedItems.reduce((sum, item) => sum + item.total, 0);
  const discount = sale.discount || 0;
  const receiptNumber = sale.id.slice(0, 8).toUpperCase();

  const handlePrint = () => {
    if (!printRef.current) return;

    const clone = printRef.current.cloneNode(true) as HTMLElement;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      window.print();
      return;
    }

    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt #${receiptNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              padding: 1.5rem;
              background: white;
              color: black;
            }
            h2 { font-size: 1.5rem; margin-bottom: 0.25rem; }
            .text-center { text-align: center; }
            .border-b { border-bottom: 1px dashed #000; }
            .border-t { border-top: 1px dashed #000; }
            .pt-2 { padding-top: 0.5rem; }
            .pb-2 { padding-bottom: 0.5rem; }
            .mt-4 { margin-top: 1rem; }
            .text-xs { font-size: 0.75rem; }
            .text-sm { font-size: 0.875rem; }
            .font-bold { font-weight: bold; }
            .text-gray-500 { color: #6b7280; }
            .text-gray-600 { color: #4b5563; }
            .text-gray-400 { color: #9ca3af; }
            .w-full { width: 100%; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 0.25rem 0; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .space-y-4 > * + * { margin-top: 1rem; }
          </style>
        </head>
        <body>
          ${clone.outerHTML}
        </body>
      </html>
    `);
    iframeDoc.close();

    iframe.onload = () => {
      try {
        iframe.contentWindow?.print();
      } catch (e) {
        window.print();
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 500);
    };

    setTimeout(() => {
      if (document.body.contains(iframe)) {
        try {
          iframe.contentWindow?.print();
        } catch (e) {
          window.print();
        }
      }
    }, 300);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receipt">
      <div id="receipt-printable" ref={printRef} className="space-y-4 p-2">
        {/* Header */}
        <div className="text-center border-b pb-2">
          <h2 className="text-xl font-bold">{shop?.name || 'SmartPOS'}</h2>
          <p className="text-xs text-gray-500">Receipt #{receiptNumber}</p>
          <p className="text-xs text-gray-500">
            {new Date(sale.createdAt).toLocaleString()}
          </p>
          <p className="text-xs">Served by: {user?.phone || 'Staff'}</p>
        </div>

        {/* Items Table */}
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="text-left py-1">Item</th>
              <th className="text-right py-1">Qty</th>
              <th className="text-right py-1">Price</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {enrichedItems.map((item, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="py-1">{item.name}</td>
                <td className="text-right py-1">{item.quantity}</td>
                <td className="text-right py-1">
                  GHS {item.unitPrice.toFixed(2)}
                </td>
                <td className="text-right py-1">
                  GHS {item.total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Item count */}
        <div className="text-xs text-gray-500 text-right">
          {totalItems} {itemLabel}
        </div>

        {/* Totals, discount, and payment info */}
        <div className="border-t pt-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>GHS {subtotal.toFixed(2)}</span>
          </div>

          {discount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount</span>
              <span>- GHS {discount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between font-bold mt-1 pt-1 border-t border-dashed">
            <span>TOTAL</span>
            <span>GHS {sale.totalAmount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-gray-600 mt-1">
            <span>Payment Method</span>
            <span>{sale.paymentMethod}</span>
          </div>
          {sale.customerId && (
            <div className="flex justify-between text-gray-600">
              <span>Customer</span>
              <span>{customer?.name || sale.customerId}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-4">
          Thank you for your purchase!
        </div>
      </div>

      {/* Buttons – hidden when printing */}
      <div className="print:hidden flex gap-3 pt-4">
        <Button variant="secondary" onClick={onClose} className="flex-1">
          Close
        </Button>
        <Button onClick={handlePrint} className="flex-1">
          Print Receipt
        </Button>
      </div>
    </Modal>
  );
};