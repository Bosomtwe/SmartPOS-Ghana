import { create } from 'zustand';
import api from '../services/api';

export interface AuditLog {
  id: string;
  action: string;
  action_display: string;
  summary: string;                // new
  details: Record<string, any>;
  ip_address: string;
  user_agent: string;
  request_path: string;
  http_method: string;
  created_at: string;
  user_display: string;          // replaces user_phone
}

interface AuditState {
  logs: AuditLog[];
  loading: boolean;
  error: string | null;
  total: number;
  fetchLogs: (filters?: {
    action?: string;
    user_id?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }) => Promise<void>;
  clearLogs: () => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  logs: [],
  loading: false,
  error: null,
  total: 0,

  fetchLogs: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const params: any = { ...filters };
      const response = await api.get('/logs/', { params });
      set({
        logs: response.data.results,
        total: response.data.count,
        loading: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.detail || 'Failed to load audit logs',
        loading: false,
      });
    }
  },

  clearLogs: () => set({ logs: [], total: 0 }),
}));