import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  actionLabel?: string;
  sticky?: boolean;
  onAction?: () => void | Promise<void>;
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nextToast: ToastItem = { id, ...toast };

    set((state) => ({ toasts: [nextToast, ...state.toasts].slice(0, 4) }));

    if (!toast.sticky) {
      window.setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
      }, 3500);
    }
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
