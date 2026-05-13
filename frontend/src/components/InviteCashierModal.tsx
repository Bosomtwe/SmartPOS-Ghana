import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useUIStore } from '../stores/uiStore';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

interface InviteCashierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const InviteCashierModal = ({ isOpen, onClose, onSuccess }: InviteCashierModalProps) => {
  const { addToast } = useUIStore();
  const [phone, setPhone] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'credentials'>('form');
  const [copied, setCopied] = useState(false);

  const generatePassword = () => {
    return Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 10);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;

    setLoading(true);
    const password = generatePassword();
    try {
      const response = await api.post('/users/cashier/', {
        phone,
        password,
      });
      if (response.status === 200 || response.status === 201) {
        setGeneratedPassword(password);
        setStep('credentials');
        onSuccess();
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create cashier';
      addToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhone('');
    setGeneratedPassword('');
    setStep('form');
    setCopied(false);
    onClose();
  };

  const copyCredentials = () => {
    const text = `Phone: ${phone}\nPassword: ${generatedPassword}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Invite Cashier">
      {step === 'form' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cashier Phone Number
            </label>
            <input
              type="tel"
              placeholder="e.g., 024XXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2 border rounded-lg"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              The cashier will use this phone number to log in.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Cashier'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <p className="text-green-800 font-medium mb-2">✅ Cashier created successfully!</p>
            <p className="text-sm text-gray-600 mb-1">Share these credentials with the cashier:</p>
            <div className="bg-white p-3 rounded border mt-2 relative">
              <p><strong>Phone:</strong> {phone}</p>
              <p><strong>Password:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{generatedPassword}</code></p>
              <button
                onClick={copyCredentials}
                className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-primary transition-colors"
                aria-label="Copy credentials"
              >
                {copied ? (
                  <CheckIcon className="w-4 h-4 text-green-600" />
                ) : (
                  <ClipboardDocumentIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              The cashier can log in with these details. They cannot change prices or adjust stock.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};