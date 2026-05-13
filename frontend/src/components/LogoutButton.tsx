import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Button } from './Button';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

export const LogoutButton = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    navigate('/logout');
  };

  return (
    <Button variant="ghost" onClick={handleLogout} className="gap-2">
      <ArrowRightOnRectangleIcon className="h-5 w-5" />
      <span className="hidden sm:inline">Logout</span>
    </Button>
  );
};