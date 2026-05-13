// src/hooks/useOrientation.ts
import { useEffect, useState } from 'react';

export const useOrientation = () => {
  const [isLandscape, setIsLandscape] = useState(window.innerHeight < window.innerWidth);
  useEffect(() => {
    const handleResize = () => setIsLandscape(window.innerHeight < window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isLandscape;
};