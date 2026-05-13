import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

interface User {
  id: string;
  phone: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  shop: any | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      shop: null,
      login: async (phone, password) => {
        const tokenResponse = await api.post('/api/v1/auth/login/', { phone, password });
        const { access } = tokenResponse.data;   // removed unused 'refresh'

        api.defaults.headers.common['Authorization'] = `Bearer ${access}`;

        const userResponse = await api.get('/api/v1/users/me/');
        const user = userResponse.data;

        const shopResponse = await api.get('/api/v1/shops/me/');
        const shop = shopResponse.data;

        set({ token: access, user, shop });
      },
      logout: () => {
        set({ token: null, user: null, shop: null });
        delete api.defaults.headers.common['Authorization'];
      },
    }),
    { name: 'auth-storage' }
  )
);