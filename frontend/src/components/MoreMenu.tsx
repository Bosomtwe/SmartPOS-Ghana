// src/components/MoreMenu.tsx
import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, ClipboardDocumentListIcon, ChartBarIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';   // ✅ added

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoreMenu = ({ isOpen, onClose }: MoreMenuProps) => {
  const { user } = useAuthStore();   // ✅ added

  const menuItems = [
    { name: 'Sales History', path: '/sales', icon: ClipboardDocumentListIcon },
    // Reports – hidden until ready to implement
    // { name: 'Reports', path: '/reports', icon: ChartBarIcon },
    { name: 'Settings', path: '/settings', icon: Cog6ToothIcon },
  ];

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
                <div className="flex justify-between items-center p-4 border-b">
                  <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                    More
                  </Dialog.Title>
                  <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
                    <XMarkIcon className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="p-2">
                  {menuItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <item.icon className="w-6 h-6 text-gray-500" />
                      <span className="text-base font-medium text-gray-700">{item.name}</span>
                    </Link>
                  ))}

                  {/* ✅ Analytics link – only for superusers */}
                  {user?.is_superuser && (
                    <Link
                      to="/analytics"
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <ChartBarIcon className="w-6 h-6 text-gray-500" />
                      <span className="text-base font-medium text-gray-700">Analytics</span>
                    </Link>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};