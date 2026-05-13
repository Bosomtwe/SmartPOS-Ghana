// src/components/PaymentModal.tsx
import { useState, useEffect, useRef } from 'react';
import { RadioGroup } from '@headlessui/react';
import { Modal } from './Modal';
import { Button } from './Button';
import { CustomerSelector } from './CustomerSelector';
import { useUIStore } from '../stores/uiStore';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onComplete: (method: string, customerId?: string, metadata?: Record<string, any>) => void;
  isProcessing?: boolean;
}

const paymentMethods = [
  { id: 'CASH', name: 'Cash', icon: '💵' },
  { id: 'MOMO', name: 'MoMo', icon: '📱' },
  { id: 'CREDIT', name: 'Credit', icon: '📝' },
];

export const PaymentModal = ({ isOpen, onClose, total, onComplete, isProcessing = false }: PaymentModalProps) => {
  const { addToast } = useUIStore();
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [momoNumber, setMomoNumber] = useState<string>('');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  const confirmingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod('CASH');
      setCustomerId(undefined);
      setAmountTendered('');
      setMomoNumber('');
      setDiscountType('none');
      setDiscountValue('');
      setShowDiscountInput(false);
      confirmingRef.current = false;
    }
  }, [isOpen]);

  // Calculate discount amount
  const discountAmount = (): number => {
    if (!discountValue || discountType === 'none') return 0;
    const val = parseFloat(discountValue);
    if (isNaN(val)) return 0;
    if (discountType === 'percent') {
      const amt = (total * val) / 100;
      return amt > total ? total : amt;
    }
    return Math.min(val, total);
  };

  const finalTotal = total - discountAmount();
  const changeAmount = amountTendered ? parseFloat(amountTendered) - finalTotal : 0;

  const handleFinish = () => {
    if (confirmingRef.current) return;

    if (paymentMethod === 'CREDIT' && !customerId) {
      addToast({ message: 'Please select a customer for credit sale.', type: 'warning' });
      return;
    }

    if (paymentMethod === 'CASH' && amountTendered && parseFloat(amountTendered) < finalTotal) {
      addToast({ message: 'Amount tendered is less than total.', type: 'warning' });
      return;
    }

    const metadata: Record<string, any> = {};
    if (paymentMethod === 'CASH' && amountTendered) {
      metadata.amountTendered = parseFloat(amountTendered);
      metadata.change = changeAmount;
    }
    if (paymentMethod === 'MOMO') {
      metadata.momoNumber = momoNumber.trim();
    }
    if (discountAmount() > 0) {
      metadata.discount = {
        type: discountType,
        value: parseFloat(discountValue),
        amount: discountAmount(),
      };
    }

    confirmingRef.current = true;
    onComplete(paymentMethod, customerId, metadata);
  };

  const formatCurrency = (val: number) => `GHS ${val.toFixed(2)}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Payment">
      <div className="space-y-5">
        {/* Total display */}
        <div className="text-center py-5 bg-green-50 rounded-2xl border border-green-100">
          <p className="text-xs text-green-700 font-bold uppercase tracking-widest">
            Total Payable
          </p>
          <p className="text-4xl font-black text-green-600 mt-1">
            {formatCurrency(finalTotal)}
          </p>
          {discountAmount() > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Discount: -{formatCurrency(discountAmount())}
            </p>
          )}
        </div>

        {/* Discount toggle */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowDiscountInput(!showDiscountInput)}
            className="text-sm font-medium text-green-600 hover:text-green-700"
          >
            {showDiscountInput ? '− Hide discount' : '+ Add discount'}
          </button>
          {discountAmount() > 0 && (
            <span className="text-sm text-gray-600">
              -{formatCurrency(discountAmount())}
            </span>
          )}
        </div>

        {/* Discount input – mobile optimised */}
        {showDiscountInput && (
          <div className="p-4 bg-gray-50 rounded-xl space-y-3">
            {/* Quick discount buttons */}
            <div className="flex gap-2 flex-wrap">
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setDiscountType('percent');
                    setDiscountValue(String(pct));
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-full hover:bg-green-50 hover:border-green-300 active:bg-green-100"
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* Detailed fields */}
            <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2">
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as any)}
                className="w-full sm:w-auto px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount (GHS)</option>
              </select>
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {discountType === 'percent' ? '%' : 'GHS'}
                </span>
                <input
                  type="number"
                  step={discountType === 'percent' ? '1' : '0.01'}
                  min="0"
                  max={discountType === 'percent' ? '100' : total}
                  placeholder={discountType === 'percent' ? '10' : '5.00'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm ${
                    discountType === 'percent' ? '' : 'pl-12'
                  }`}
                />
              </div>
            </div>

            {discountValue && (
              <p className="text-xs text-gray-500 flex items-center justify-between">
                <span>Discount:</span>
                <span className="font-medium text-red-600">
                  - {discountType === 'percent' ? `${discountValue}%` : ''} {formatCurrency(discountAmount())}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Payment methods */}
        <RadioGroup value={paymentMethod} onChange={setPaymentMethod}>
          <RadioGroup.Label className="text-sm font-bold text-gray-900">
            Payment Method
          </RadioGroup.Label>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {paymentMethods.map((method) => (
              <RadioGroup.Option
                key={method.id}
                value={method.id}
                className={({ checked }) =>
                  `flex flex-col items-center justify-center p-4 border rounded-xl cursor-pointer transition-all focus:outline-none ${
                    checked
                      ? 'border-green-600 bg-green-50 ring-2 ring-green-600 text-green-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`
                }
              >
                <span className="text-2xl mb-1">{method.icon}</span>
                <span className="text-xs font-black uppercase">{method.name}</span>
              </RadioGroup.Option>
            ))}
          </div>
        </RadioGroup>

        {/* Cash amount tendered */}
        {paymentMethod === 'CASH' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Amount Tendered (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">GHS</span>
              <input
                type="number"
                step="0.01"
                min={finalTotal}
                placeholder="Enter amount received"
                value={amountTendered}
                onChange={(e) => setAmountTendered(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            {amountTendered && parseFloat(amountTendered) >= finalTotal && (
              <div className="p-3 bg-green-50 rounded-xl text-green-700">
                <p className="font-medium">
                  Change: {formatCurrency(changeAmount)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* MoMo number – optional */}
        {paymentMethod === 'MOMO' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Mobile Money Number (Optional)
            </label>
            <input
              type="tel"
              placeholder="e.g., 024XXXXXXX"
              value={momoNumber}
              onChange={(e) => setMomoNumber(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        )}

        {/* Credit customer */}
        {paymentMethod === 'CREDIT' && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <h4 className="text-sm font-bold text-gray-800">Select Customer</h4>
            <CustomerSelector
              selectedId={customerId}
              onSelect={(id) => setCustomerId(id)}
            />
            {!customerId && (
              <p className="text-xs text-red-500 font-medium">
                * A customer must be assigned for credit sales.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1 py-3 text-base">
            Cancel
          </Button>
          <Button
            onClick={handleFinish}
            className="flex-1 py-3 text-base"
            disabled={isProcessing || confirmingRef.current}
          >
            {isProcessing ? 'Processing...' : 'Confirm Sale'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};