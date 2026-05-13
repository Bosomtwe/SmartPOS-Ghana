import { CloudIcon } from '@heroicons/react/24/outline';

export const CloudOffIcon = ({ className }: { className?: string }) => (
  <div className={`relative inline-block ${className}`}>
    <CloudIcon className="h-full w-full" />
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-[140%] h-0.5 bg-current rotate-45 transform origin-center" />
    </div>
  </div>
);