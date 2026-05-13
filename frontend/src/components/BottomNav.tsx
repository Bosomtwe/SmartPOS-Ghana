// src/components/BottomNav.tsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  HomeIcon, ShoppingCartIcon, CubeIcon, UsersIcon, 
  Cog6ToothIcon, ClipboardDocumentListIcon, ChartBarIcon,
  EllipsisHorizontalCircleIcon
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolid, ShoppingCartIcon as CartSolid,
  CubeIcon as CubeSolid, UsersIcon as UsersSolid,
  EllipsisHorizontalCircleIcon as MoreSolid
} from '@heroicons/react/24/solid';
import { MoreMenu } from './MoreMenu';

const navItems = [
  { name: 'POS', path: '/pos', icon: ShoppingCartIcon, activeIcon: CartSolid },
  { name: 'Dashboard', path: '/', icon: HomeIcon, activeIcon: HomeSolid },
  { name: 'Inventory', path: '/inventory', icon: CubeIcon, activeIcon: CubeSolid },
  { name: 'Credit', path: '/customers', icon: UsersIcon, activeIcon: UsersSolid },
];

export const BottomNav = () => {
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-10 pb-safe-bottom">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full ${
                  isActive ? 'text-green-600' : 'text-gray-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? <item.activeIcon className="w-6 h-6" /> : <item.icon className="w-6 h-6" />}
                  <span className="text-xs mt-1">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center justify-center flex-1 h-full text-gray-500"
          >
            <EllipsisHorizontalCircleIcon className="w-6 h-6" />
            <span className="text-xs mt-1">More</span>
          </button>
        </div>
      </nav>
      <MoreMenu isOpen={showMore} onClose={() => setShowMore(false)} />
    </>
  );
}