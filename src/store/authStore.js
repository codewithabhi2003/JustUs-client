// ── authStore.js ──────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(persist(
  (set) => ({
    user:  null,
    token: null,
    setAuth:    (user, token) => set({ user, token }),
    updateUser: (updates) => set(state => ({ user: { ...state.user, ...updates } })),
    clearAuth:  () => set({ user: null, token: null }),
  }),
  { name: 'justus-auth' }
));
