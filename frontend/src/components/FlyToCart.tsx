// src/components/FlyToCart.tsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface FlyingItem {
  id: string;
  startElement: HTMLElement;
  endElement: HTMLElement;
  onComplete: () => void;
}

export const useFlyToCart = () => {
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);

  const flyToCart = (startElement: HTMLElement) => {
    const cartElement = document.getElementById('cart-icon');
    if (!cartElement) return;

    const id = crypto.randomUUID();
    const flyingItem: FlyingItem = {
      id,
      startElement,
      endElement: cartElement,
      onComplete: () => {
        setFlyingItems((prev) => prev.filter((item) => item.id !== id));
      },
    };

    setFlyingItems((prev) => [...prev, flyingItem]);
  };

  const FlyingItemsRenderer = () => {
    return createPortal(
      <>
        {flyingItems.map((item) => (
          <FlyingItemAnimation key={item.id} item={item} />
        ))}
      </>,
      document.body
    );
  };

  return { flyToCart, FlyingItemsRenderer };
};

const FlyingItemAnimation = ({ item }: { item: FlyingItem }) => {
  const startRect = item.startElement.getBoundingClientRect();
  const endRect = item.endElement.getBoundingClientRect();

  const [position, setPosition] = useState({
    top: startRect.top + startRect.height / 2,
    left: startRect.left + startRect.width / 2,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setPosition({
        top: endRect.top + endRect.height / 2,
        left: endRect.left + endRect.width / 2,
      });
    }, 10);

    const completeTimer = setTimeout(() => {
      item.onComplete();
    }, 400);

    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
  }, [endRect, item]);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        top: position.top - 12,
        left: position.left - 12,
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div className="w-6 h-6 bg-primary rounded-full animate-scale-pulse shadow-lg" />
    </div>
  );
};