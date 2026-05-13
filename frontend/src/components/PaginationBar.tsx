// src/components/PaginationBar.tsx
import { useSalesStore } from '../stores/saleStore';
import { Button } from './Button';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export const PaginationBar = () => {
  const {
    currentPage,
    pageSize,
    totalCount,
    fetchNextPage,
    fetchPreviousPage,
    loading,
  } = useSalesStore();

  if (totalCount === 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);
  const hasNext = end < totalCount;
  const hasPrevious = currentPage > 1;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-100">
      <span className="text-sm text-gray-600">
        Showing <span className="font-semibold text-gray-900">{start}-{end}</span> of{' '}
        <span className="font-semibold text-gray-900">{totalCount}</span> sales
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasPrevious || loading}
          onClick={fetchPreviousPage}
        >
          <ChevronLeftIcon className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasNext || loading}
          onClick={fetchNextPage}
        >
          Next
          <ChevronRightIcon className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};