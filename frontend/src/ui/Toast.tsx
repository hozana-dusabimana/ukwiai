import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, X, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

// Success is a quick confirmation, so it auto-dismisses. Info/error carry
// actionable, user-facing outcomes (e.g. "not a basketball court") and stay
// on screen until the user closes them with the X.
const AUTO_DISMISS_MS: Record<ToastKind, number | null> = {
  success: 3000,
  error: null,
  info: null,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setToasts((t) => [...t, { id, kind, message }]);
    const ttl = AUTO_DISMISS_MS[kind];
    if (ttl !== null) {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
    }
  }, []);

  const api: ToastApi = {
    push,
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  const top = toasts[toasts.length - 1];

  return (
    <Ctx.Provider value={api}>
      {children}
      {top && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop — click to dismiss the current notification. */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => dismiss(top.id)}
            data-testid="toast-backdrop"
          />

          <div
            key={top.id}
            data-testid="toast-card"
            data-kind={top.kind}
            className={`relative w-full max-w-md bg-white border-t-4 shadow-2xl rounded-xl p-6 flex items-start gap-4 ${
              top.kind === "success"
                ? "border-emerald-500"
                : top.kind === "error"
                ? "border-red-500"
                : "border-sky-500"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {top.kind === "success" ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              ) : top.kind === "error" ? (
                <AlertTriangle className="w-7 h-7 text-red-500" />
              ) : (
                <Info className="w-7 h-7 text-sky-500" />
              )}
            </div>
            <div className="flex-1 text-sm text-slate-900 leading-relaxed pt-0.5">
              {top.message}
            </div>
            <button
              onClick={() => dismiss(top.id)}
              aria-label="Close notification"
              data-testid="toast-close"
              className="shrink-0 text-gray-400 hover:text-slate-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
