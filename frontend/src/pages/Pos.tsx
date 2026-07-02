// src/pages/Pos.tsx
import { useEffect, useState, useRef } from 'react';
import { useProductStore } from '../stores/productStore';
import { useCartStore } from '../stores/cartStore';
import { useSyncStore } from '../stores/syncStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { ProductCard } from '../components/ProductCard';
import { ProductListItem } from '../components/ProductListItem';
import { CartDrawer } from '../components/CartDrawer';
import { PaymentModal } from '../components/PaymentModal';
import { ReceiptModal } from '../components/ReceiptModal';
import { SearchBar } from '../components/SearchBar';
import { SyncStatus } from '../components/SyncStatus';
import { LowStockBanner } from '../components/LowStockBanner';
import { Button } from '../components/Button';
import {
  ShoppingBagIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import type { Sale } from '../lib/dexie';
import { db } from '../lib/dexie';

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function Pos() {
  const { products, fetchProducts, loading: productsLoading, fullyLoaded } = useProductStore();
  const { items, total, clearCart, updateQuantity, removeItem } = useCartStore();
  const { addSale } = useSyncStore();
  const { user, shop } = useAuthStore();
  const { addToast, productViewMode, setProductViewMode, productCardDensity, setProductCardDensity } = useUIStore();
  const [search, setSearch] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isProcessingRef = useRef(false);
  const activeCheckoutId = useRef<string | null>(null);
  const checkoutLockRef = useRef(false);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCompleteSale = async (
    paymentMethod: string,
    customerId?: string,
    checkoutId?: string,
    metadata?: Record<string, any>
  ) => {
    if (isProcessingRef.current) return;
    if (checkoutId !== activeCheckoutId.current) return;

    isProcessingRef.current = true;
    checkoutLockRef.current = true;
    setIsProcessing(true);

    if (!shop || !user) {
      addToast({ message: 'Authentication error. Please refresh the page.', type: 'error' });
      isProcessingRef.current = false;
      checkoutLockRef.current = false;
      setIsProcessing(false);
      return;
    }

    const discountAmount = round2(metadata?.discount?.amount || 0);
    const finalTotal = round2(total - discountAmount);
    const momoNumber = metadata?.momoNumber || undefined;

    const rawItems = items.map((i) => ({
      productId: i.product.id,
      quantity: i.quantity,
      unitPrice: i.product.sellingPrice,
      total: round2(i.quantity * i.product.sellingPrice),
    }));

    const productIds = rawItems.map((item) => item.productId);
    let itemNames: Record<string, string> = {};
    try {
      const productsList = await db.products.bulkGet(productIds);
      productsList.forEach((product, index) => {
        if (product) {
          itemNames[productIds[index]] = product.name;
        }
      });
    } catch (e) {
      console.error('Failed to fetch product names from Dexie', e);
    }

    const isBackdated = !!metadata?.created_at;
    const createdAt = isBackdated ? new Date(metadata.created_at) : new Date();

    const sale: Sale = {
      id: crypto.randomUUID(),
      shopId: shop.id,
      userId: user.id,
      userPhone: user.phone,                // ✅ Store the cashier's phone
      customerId: customerId || undefined,
      totalAmount: finalTotal,
      discount: discountAmount,
      paymentMethod: paymentMethod as 'CASH' | 'MOMO' | 'CREDIT',
      momoNumber: momoNumber,
      status: 'COMPLETED',
      createdAt: createdAt,
      isBackdated: isBackdated,
      originalCreatedAt: isBackdated ? new Date() : null,
      synced: false,
      items: rawItems.map((item) => ({
        ...item,
        name: itemNames[item.productId] || 'Unknown Product',
      })),
      idempotencyKey: crypto.randomUUID(),
    };

    if (isBackdated) {
      console.log(`[Backdated Sale] ID: ${sale.id}, Original timestamp: ${new Date().toISOString()}, Backdated to: ${sale.createdAt.toISOString()}`);
    }

    setShowPaymentModal(false);
    setCompletedSale(sale);
    setShowReceiptModal(true);

    addToast({
      message: `Sale recorded! GHS ${finalTotal.toFixed(2)} via ${paymentMethod}`,
      type: 'success',
      duration: 4000,
    });

    try {
      await addSale(sale);
      useProductStore.getState().fetchProducts().catch(() => {});
    } catch (dbError) {
      console.error('Local DB save failed:', dbError);
      addToast({ message: 'Local save failed, but sale can be synced later.', type: 'warning' });
    } finally {
      isProcessingRef.current = false;
      checkoutLockRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleCloseReceipt = () => {
    clearCart();
    setShowReceiptModal(false);
    setCompletedSale(null);
  };

  const headerHeight = 80;
  const cartHeight = items.length > 0 && !showReceiptModal ? 120 : 0;

  if (productsLoading && products.length === 0 && !fullyLoaded) {
    return <div className="flex items-center justify-center h-screen">Loading products...</div>;
  }

  return (
    <div className="flex flex-col h-dvh bg-gray-50 pb-safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-3 py-3 sm:px-4 sm:py-4 pt-safe-top">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1">
              <SearchBar
                ref={searchInputRef}
                value={search}
                onChange={setSearch}
                onBarcodeScan={(barcode) => setSearch(barcode)}
              />
            </div>
            <div className="hidden sm:block">
              <SyncStatus compact />
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setProductViewMode('grid')}
                className={`p-2 rounded-md transition touch-manipulation ${productViewMode === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
              >
                <Squares2X2Icon className="h-5 w-5" />
                <span className="hidden sm:inline sm:ml-1 text-sm font-medium">Grid</span>
              </button>
              <button
                onClick={() => setProductViewMode('list')}
                className={`p-2 rounded-md transition touch-manipulation ${productViewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
              >
                <ListBulletIcon className="h-5 w-5" />
                <span className="hidden sm:inline sm:ml-1 text-sm font-medium">List</span>
              </button>
            </div>
            {productViewMode === 'grid' && (
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setProductCardDensity('comfortable')}
                  className={`p-2 rounded-md transition touch-manipulation ${productCardDensity === 'comfortable' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                >
                  <span className="text-sm font-medium px-1">Comfort</span>
                  <span className="hidden sm:inline">able</span>
                </button>
                <button
                  onClick={() => setProductCardDensity('compact')}
                  className={`p-2 rounded-md transition touch-manipulation ${productCardDensity === 'compact' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                >
                  <span className="text-sm font-medium px-1">Comp</span>
                  <span className="hidden sm:inline">act</span>
                </button>
              </div>
            )}
            <div className="sm:hidden">
              <SyncStatus compact />
            </div>
          </div>
        </div>
      </div>

      <LowStockBanner />

      <div
        className="flex-1 overflow-y-auto p-3 sm:p-4"
        style={{ maxHeight: `calc(100dvh - ${headerHeight + cartHeight}px)` }}
      >
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <ShoppingBagIcon className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-lg">No products found</p>
            {search && <p className="text-sm">Try a different search term.</p>}
          </div>
        ) : productViewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 grid-landscape-3cols">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {filteredProducts.map((product) => (
              <ProductListItem key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && !showReceiptModal && (
        <div className="sticky bottom-0 bg-white border-t shadow-lg p-3 sm:p-4 z-10 pb-safe-bottom">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-full text-sm">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </div>
                <span className="text-xl sm:text-2xl font-bold">GHS {total.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-2 w-full">
              <Button
                variant="secondary"
                onClick={() => setIsCartOpen(true)}
                disabled={checkoutLockRef.current}
                className="flex-1 touch-manipulation"
              >
                View Cart
              </Button>
              <Button
                onClick={() => {
                  if (checkoutLockRef.current) return;
                  activeCheckoutId.current = crypto.randomUUID();
                  checkoutLockRef.current = true;
                  setShowPaymentModal(true);
                }}
                size="lg"
                disabled={checkoutLockRef.current}
                className="flex-1 touch-manipulation"
              >
                Pay Now
              </Button>
            </div>
          </div>
        </div>
      )}

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={items}
        total={total}
        onUpdateQuantity={updateQuantity}
        onRemove={removeItem}
        onCheckout={() => {
          if (checkoutLockRef.current) return;
          activeCheckoutId.current = crypto.randomUUID();
          checkoutLockRef.current = true;
          setIsCartOpen(false);
          setShowPaymentModal(true);
        }}
      />

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          checkoutLockRef.current = false;
        }}
        total={total}
        onComplete={(paymentMethod, customerId, metadata) =>
          handleCompleteSale(paymentMethod, customerId, activeCheckoutId.current!, metadata)
        }
        isProcessing={isProcessing}
      />

      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={handleCloseReceipt}
        sale={completedSale}
      />
    </div>
  );
}