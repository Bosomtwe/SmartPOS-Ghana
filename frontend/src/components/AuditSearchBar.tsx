// src/components/AuditSearchBar.tsx
import { memo, useRef, useEffect } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface AuditSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const AuditSearchBar = memo(({ 
  value, 
  onChange, 
  placeholder = "Search by user, product name, or action..." 
}: AuditSearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Ensure focus is kept after re-renders (if it was focused before)
  useEffect(() => {
    // If the input had focus before a re-render, restore it
    // We can track this with a ref, but simpler: keep focus if the input is the active element.
    // Actually, React should preserve focus automatically if the element is not replaced.
    // We'll just add autoFocus for safety.
  }, []);

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus  // ensures focus on mount (if the component is ever re-mounted)
        className="pl-10 pr-10 w-full p-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Clear search"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});