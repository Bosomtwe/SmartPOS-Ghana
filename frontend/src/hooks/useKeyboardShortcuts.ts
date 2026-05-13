// src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react';

export const useKeyboardShortcuts = (handlers: {
  onFocusSearch?: () => void;
  onCompleteSale?: () => void;
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handlers.onFocusSearch?.();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlers.onCompleteSale?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
};