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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const api: ToastApi = {
    push,
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`bg-white border-l-4 shadow-lg rounded p-4 flex items-start gap-3 ${
              t.kind === "success"
                ? "border-emerald-500"
                : t.kind === "error"
                ? "border-red-500"
                : "border-sky-500"
            }`}
          >
            <div className="mt-0.5">
              {t.kind === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : t.kind === "error" ? (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              ) : (
                <Info className="w-5 h-5 text-sky-500" />
              )}
            </div>
            <div className="flex-1 text-xs text-slate-900 leading-relaxed">{t.message}</div>
            <button
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              className="text-gray-400 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
