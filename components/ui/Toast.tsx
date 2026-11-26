"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string, durationMs?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, durationMs = 4000) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastItem = { id, type, title, message, durationMs };

      setToasts((prev) => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const success = useCallback((title: string, message?: string) => showToast("success", title, message), [showToast]);
  const error = useCallback((title: string, message?: string) => showToast("error", title, message, 6000), [showToast]);
  const warning = useCallback((title: string, message?: string) => showToast("warning", title, message), [showToast]);
  const info = useCallback((title: string, message?: string) => showToast("info", title, message), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      {/* Toast Render Area */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-2 ${
              toast.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-100"
                : toast.type === "error"
                ? "bg-red-950/90 border-red-500/40 text-red-100"
                : toast.type === "warning"
                ? "bg-amber-950/90 border-amber-500/40 text-amber-100"
                : "bg-charcoal-800/90 border-charcoal-600 text-slate-100"
            }`}
          >
            <span className="shrink-0 mt-0.5">
              {toast.type === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
              {toast.type === "error" && <XCircle className="h-5 w-5 text-red-400" />}
              {toast.type === "warning" && <AlertTriangle className="h-5 w-5 text-amber-400" />}
              {toast.type === "info" && <Info className="h-5 w-5 text-sky-400" />}
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold tracking-tight">{toast.title}</h4>
              {toast.message && <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded p-1 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
