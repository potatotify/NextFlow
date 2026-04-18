"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";

import { useToastStore } from "@/store/toast-store";

const iconByType = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const cardClassByType = {
  success: "border-(--nf-success-bg) bg-(--nf-success-bg)",
  error: "border-(--nf-danger-border) bg-(--nf-danger-bg)",
  info: "border-(--nf-soft-border) bg-(--nf-soft-panel)",
};

export const ToastViewport = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-100 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = iconByType[toast.type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto nextflow-toast-enter rounded-xl border px-3 py-2 shadow-[0_12px_24px_rgba(0,0,0,0.35)] ${cardClassByType[toast.type]}`}
          >
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-(--nf-text)" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-(--nf-text)">{toast.title}</p>
                {toast.message ? <p className="mt-0.5 text-[11px] text-(--nf-text-secondary)">{toast.message}</p> : null}
                {toast.actionLabel ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await toast.onAction?.();
                      } finally {
                        removeToast(toast.id);
                      }
                    }}
                    className="mt-2 inline-flex items-center rounded-md border border-(--nf-danger-border) bg-(--nf-danger-bg) px-2.5 py-1 text-[11px] font-medium text-(--nf-danger-text) transition hover:brightness-95"
                  >
                    {toast.actionLabel}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="rounded-md p-1 text-(--nf-text-secondary) transition hover:bg-(--nf-hover) hover:text-(--nf-text)"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
