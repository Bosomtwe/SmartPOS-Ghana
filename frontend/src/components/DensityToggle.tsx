import { useUIStore } from '../stores/uiStore';
import { Squares2X2Icon, ViewColumnsIcon } from '@heroicons/react/24/outline';

export const DensityToggle = () => {
  const { productCardDensity, setProductCardDensity } = useUIStore();

  return (
    <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
      <button
        onClick={() => setProductCardDensity('comfortable')}
        className={`p-2 rounded-lg transition-all ${
          productCardDensity === 'comfortable'
            ? 'bg-white text-primary shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
        aria-label="Comfortable view"
      >
        <Squares2X2Icon className="w-5 h-5" />
      </button>
      <button
        onClick={() => setProductCardDensity('compact')}
        className={`p-2 rounded-lg transition-all ${
          productCardDensity === 'compact'
            ? 'bg-white text-primary shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'
        }`}
        aria-label="Compact view"
      >
        <ViewColumnsIcon className="w-5 h-5" />
      </button>
    </div>
  );
};