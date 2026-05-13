// src/stores/uiStore.ts
import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface UIState {
  // Modals
  modals: Record<string, boolean>;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;

  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Sidebar (mobile)
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Global loading
  globalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;

  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Product view mode
  productViewMode: 'grid' | 'list';
  setProductViewMode: (mode: 'grid' | 'list') => void;

  // Product card density (only applies to grid)
  productCardDensity: 'compact' | 'comfortable';
  setProductCardDensity: (density: 'compact' | 'comfortable') => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  modals: {},
  openModal: (modalId) => set((state) => ({ modals: { ...state.modals, [modalId]: true } })),
  closeModal: (modalId) => set((state) => ({ modals: { ...state.modals, [modalId]: false } })),

  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      get().removeToast(id);
    }, toast.duration || 3000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  globalLoading: false,
  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  theme: 'light',
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

  productViewMode: 'grid',
  setProductViewMode: (mode) => set({ productViewMode: mode }),

  productCardDensity: 'comfortable',
  setProductCardDensity: (density) => set({ productCardDensity: density }),
}));