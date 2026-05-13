// src/components/ConfirmModal.tsx
import { Button } from './Button';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'Delete',
  loading = false,
  variant = 'danger',
  onConfirm,
  onCancel,
}: Props) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl w-full max-w-sm p-6">
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          className={variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : ''}
        >
          {loading ? 'Processing...' : confirmLabel}
        </Button>
      </div>
    </div>
  </div>
);