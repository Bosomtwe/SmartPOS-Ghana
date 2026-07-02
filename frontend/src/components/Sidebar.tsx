// src/components/Sidebar.tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import {
  HomeIcon,
  ShoppingCartIcon,
  CubeIcon,
  UsersIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  BuildingStorefrontIcon,
  ArrowRightOnRectangleIcon,
  PhoneIcon,
  UserIcon,
  CreditCardIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { ConfirmModal } from './ConfirmModal';

export const Sidebar = () => {
  const { user, shop, shops, logout, switchShop } = useAuthStore();
  const { addToast } = useUIStore();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isShopMenuOpen, setIsShopMenuOpen] = useState(false);
  const shopMenuRef = useRef<HTMLDivElement>(null);

  // Close shop menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shopMenuRef.current && !shopMenuRef.current.contains(event.target as Node)) {
        setIsShopMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleShopSwitch = async (shopId: string) => {
    if (shopId === shop?.id) {
      setIsShopMenuOpen(false);
      return;
    }
    try {
      await switchShop(shopId);
      addToast({ message: `Switched to ${shops.find(s => s.id === shopId)?.name}`, type: 'success' });
    } catch (err: any) {
      addToast({ message: err.message || 'Failed to switch shop', type: 'error' });
    }
    setIsShopMenuOpen(false);
  };

  const navItems = [
    { name: 'POS', path: '/pos', icon: ShoppingCartIcon },
    { name: 'Dashboard', path: '/', icon: HomeIcon },
    { name: 'Inventory', path: '/inventory', icon: CubeIcon },
    { name: 'Credit', path: '/customers', icon: UsersIcon },
    { name: 'Sales', path: '/sales', icon: ClipboardDocumentListIcon },
    { name: 'Reports', path: '/reports', icon: ChartBarIcon },
    { name: 'Settings', path: '/settings', icon: Cog6ToothIcon },
  ];

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      await logout();
      addToast({ message: 'Logged out successfully', type: 'success' });
      navigate('/login');
    } catch (error) {
      addToast({ message: 'Logout failed', type: 'error' });
    }
  };

  const roleLabel = user?.role === 'OWNER' ? 'Owner' : 'Cashier';

  // Determine if shop switcher should be shown
  const showShopSwitcher = user?.role === 'OWNER' && shops.length > 0;

  return (
    <>
      <aside className="hidden lg:flex lg:flex-col fixed left-0 top-0 h-full w-72 bg-white border-r border-gray-200 z-20 shadow-sm">
        {/* Shop / Branch Header with Switcher */}
        <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-green-50/20 to-white">
          <div className="flex items-start gap-3">
            <BuildingStorefrontIcon className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {showShopSwitcher ? (
                <div className="relative" ref={shopMenuRef}>
                  <button
                    onClick={() => setIsShopMenuOpen(!isShopMenuOpen)}
                    className="w-full flex items-center justify-between gap-2 hover:bg-green-50/50 rounded-lg px-2 -mx-2 py-1 transition-colors"
                  >
                    <span className="text-lg font-bold text-gray-800 truncate">
                      {shop?.name || 'Select Shop'}
                    </span>
                    {isShopMenuOpen ? (
                      <ChevronUpIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    )}
                  </button>

                  {/* Dropdown menu */}
                  {isShopMenuOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                      {shops.map((s) => {
                        const isActive = s.is_active !== false; // default true
                        return (
                          <button
                            key={s.id}
                            onClick={() => isActive && handleShopSwitch(s.id)}
                            disabled={!isActive}
                            className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
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
                              {s.id === shop?.id && <CheckIcon className="h-4 w-4 text-green-600 flex-shrink-0" />}
                              {!isActive && <span className="text-xs text-red-500">(Inactive)</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-lg font-bold text-gray-800 truncate">
                  {shop?.name || 'Adom Bookshop'}
                </div>
              )}
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-0.5">
                {showShopSwitcher ? 'Switch Branch ▼' : 'My Store'}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-green-100 text-green-700 font-semibold shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 bg-green-600 rounded-full" />
                  )}
                  <item.icon className={`w-5 h-5 transition-transform group-hover:scale-105 ${isActive ? 'text-green-600' : 'text-gray-500'}`} />
                  <span className="text-base font-medium">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}

          {user?.is_superuser && (
            <NavLink
              to="/analytics"
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-green-100 text-green-700 font-semibold shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 bg-green-600 rounded-full" />
                  )}
                  <ChartBarIcon className={`w-5 h-5 transition-transform group-hover:scale-105 ${isActive ? 'text-green-600' : 'text-gray-500'}`} />
                  <span className="text-base font-medium">Analytics</span>
                </>
              )}
            </NavLink>
          )}

          {user?.is_superuser && (
            <NavLink
              to="/admin/subscriptions"
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-green-100 text-green-700 font-semibold shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 bg-green-600 rounded-full" />
                  )}
                  <CreditCardIcon className={`w-5 h-5 transition-transform group-hover:scale-105 ${isActive ? 'text-green-600' : 'text-gray-500'}`} />
                  <span className="text-base font-medium">Manage Subscriptions</span>
                </>
              )}
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{roleLabel}</p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <PhoneIcon className="w-3 h-3" />
                <span className="truncate">{user?.phone}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition-colors active:bg-red-200"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {showLogoutConfirm && (
        <ConfirmModal
          title="Logout"
          message="Are you sure you want to log out?"
          confirmLabel="Logout"
          variant="danger"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </>
  );
};