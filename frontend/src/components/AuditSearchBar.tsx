import { useState, useEffect, memo } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface AuditSearchBarProps {
  onSearch: (searchTerm: string) => void;
}

export const AuditSearchBar = memo(({ onSearch }: AuditSearchBarProps) => {
  const [localSearch, setLocalSearch] = useState('');
  const debouncedSearch = useDebounce(localSearch, 500);

  useEffect(() => {
    onSearch(debouncedSearch);
  }, [debouncedSearch, onSearch]);

  return (
    <div className="relative">
      <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
      <input
        type="text"
        placeholder="Search by user phone..."
        value={localSearch}
        onChange={(e) => setLocalSearch(e.target.value)}
        className="pl-10 w-full p-2 border rounded-lg"
      />
    </div>
  );
});