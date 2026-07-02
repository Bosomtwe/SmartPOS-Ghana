// src/components/MoreMenu.tsx
import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  BuildingStorefrontIcon,
  ChevronRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoreMenu = ({ isOpen, onClose }: MoreMenuProps) => {
  const { user, shops, shop, switchShop } = useAuthStore();
  const { addToast } = useUIStore();
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  const menuItems = [
    { name: 'Sales History', path: '/sales', icon: ClipboardDocumentListIcon },
    { name: 'Reports', path: '/reports', icon: ChartBarIcon },
    { name: 'Settings', path: '/settings', icon: Cog6ToothIcon },
  ];

  const handleShopSwitch = async (shopId: string) => {
    if (shopId === shop?.id) {
      setShowBranchMenu(false);
      onClose();
      return;
    }
    try {
      await switchShop(shopId);
      addToast({
        message: `Switched to ${shops.find(s => s.id === shopId)?.name}`,
        type: 'success',
        duration: 3000,
      });
      setShowBranchMenu(false);
      onClose();
    } catch (err: any) {
      addToast({
        message: err.message || 'Failed to switch shop',
        type: 'error',
      });
    }
  };

  // Only owners see the branch switcher
  const showBranchSwitcher = user?.role === 'OWNER' && shops.length > 1;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-full"
              enterTo="opacity-100 translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-full"
            >
              <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                  <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                    {showBranchMenu ? 'Switch Branch' : 'More'}
                  </Dialog.Title>
                  <button
                    onClick={() => {
                      if (showBranchMenu) {
                        setShowBranchMenu(false);
                      } else {
                        onClose();
                      }
                    }}
                    className="p-1 rounded-full hover:bg-gray-100 touch-manipulation"
                  >
                    <XMarkIcon className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                {/* Branch Menu */}
                {showBranchMenu ? (
                  <div className="p-2 max-h-96 overflow-y-auto">
                    {shops.map((s) => {
                      const isActive = s.is_active !== false;
                      return (
                        <button
                          key={s.id}
                          onClick={() => isActive && handleShopSwitch(s.id)}
                          disabled={!isActive}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-colors ${
                            !isActive
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:bg-green-50'
                          } ${
                            s.id === shop?.id
                              ? 'bg-green-50 text-green-700 font-medium'
                              : 'text-gray-700'
                          }`}
                        >
                          <span className="truncate">{s.name}</span>
                          <div className="flex items-center gap-2">
                            {s.id === shop?.id && <CheckIcon className="h-5 w-5 text-green-600 flex-shrink-0" />}
                            {!isActive && <span className="text-xs text-red-500">(Inactive)</span>}
                          </div>
                        </button>
                      );
                    })}
                    <div className="mt-2 pt-2 border-t">
                      <button
                        onClick={() => setShowBranchMenu(false)}
                        className="w-full px-4 py-3 text-center text-sm text-gray-500 hover:bg-gray-50 rounded-xl touch-manipulation"
                      >
                        ← Back
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Main Menu */
                  <div className="p-2">
                    {menuItems.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors touch-manipulation"
                      >
                        <item.icon className="w-6 h-6 text-gray-500" />
                        <span className="text-base font-medium text-gray-700">{item.name}</span>
                      </Link>
                    ))}

                    {/* Branch Switcher – owners only */}
                    {showBranchSwitcher && (
                      <button
                        onClick={() => setShowBranchMenu(true)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors touch-manipulation"
                      >
                        <div className="flex items-center gap-3">
                          <BuildingStorefrontIcon className="w-6 h-6 text-gray-500" />
                          <span className="text-base font-medium text-gray-700">Switch Branch</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 truncate max-w-[80px]">
                            {shop?.name}
                          </span>
                          <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                        </div>
                      </button>
                    )}

                    {/* Superuser only */}
                    {user?.is_superuser && (
                      <>
                        <Link
                          to="/analytics"
                          onClick={onClose}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors touch-manipulation"
                        >
                          <ChartBarIcon className="w-6 h-6 text-gray-500" />
                          <span className="text-base font-medium text-gray-700">Analytics</span>
                        </Link>
                        <Link
                          to="/admin/subscriptions"
                          onClick={onClose}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors touch-manipulation"
                        >
                          <CreditCardIcon className="w-6 h-6 text-gray-500" />
                          <span className="text-base font-medium text-gray-700">Manage Subscriptions</span>
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};