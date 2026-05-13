// src/components/Confetti.tsx
import { useEffect, useState } from 'react';
import ReactConfetti from 'react-confetti';

interface ConfettiProps {
  run: boolean;
  onComplete?: () => void;
}

export const Confetti = ({ run, onComplete }: ConfettiProps) => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!run) return null;

  return (
    <ReactConfetti
      width={windowSize.width}
      height={windowSize.height}
      numberOfPieces={200}
      recycle={false}
      onConfettiComplete={onComplete}
      colors={['#0F6B3E', '#E6A817', '#10B981', '#FFFFFF']}
    />
  );
};