import { create } from 'zustand';
import { TOKEN_KEY } from '../api/client';

const BASE = import.meta.env.VITE_API_URL || '';

export interface AuthUser {
  id: string;
  email: string;
  approved: boolean;
  is_admin: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

async function fetchMe(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${BASE}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  loading: false,
  error: null,

  init: async () => {
    const token = get().token;
    if (!token) return;
    const user = await fetchMe(token);
    if (user) {
      set({ user });
    } else {
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, user: null });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${BASE}/api/users/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).detail || 'Login failed');
      }
      const { access_token } = await res.json();
      localStorage.setItem(TOKEN_KEY, access_token);
      const user = await fetchMe(access_token);
      set({ token: access_token, user, loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e.message });
      throw e;
    }
  },

  register: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${BASE}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).detail || 'Registration failed');
      }
      const { access_token } = await res.json();
      localStorage.setItem(TOKEN_KEY, access_token);
      const user = await fetchMe(access_token);
      set({ token: access_token, user, loading: false, error: null });
    } catch (e: any) {
      set({ loading: false, error: e.message });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null, error: null });
  },
}));
