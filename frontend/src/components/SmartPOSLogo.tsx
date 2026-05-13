export const SmartPOSLogo = ({ className }: { className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <div className="w-8 h-8 bg-primary-green rounded-xl flex items-center justify-center text-white font-bold text-lg">
      S
    </div>
    <span className="font-display font-bold text-xl text-gray-900">
      SmartPOS<span className="text-primary-green"> Ghana</span>
    </span>
  </div>
);