import React from "react";
import { Loader2, AlertCircle } from "lucide-react";

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`bg-gray-200/70 animate-pulse rounded ${className}`} />;
}

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
      <Loader2 className="w-6 h-6 animate-spin mb-3 text-orange-600" />
      <span className="text-xs font-bold uppercase tracking-widest">{label || "Loading"}</span>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 border-dashed rounded-lg p-10 text-center max-w-md mx-auto">
      <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">{body}</p>
      {action}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded flex items-start gap-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  subtitle,
  accent = "slate",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: "slate" | "orange" | "emerald" | "sky" | "red";
}) {
  const palette: Record<string, string> = {
    slate: "bg-sky-50 text-slate-900 border-sky-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
    red: "bg-red-50 text-red-600 border-red-100",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 flex items-center gap-5 shadow-sm">
      <div className={`p-3 rounded border ${palette[accent]}`}>{icon}</div>
      <div className="min-w-0">
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">{label}</span>
        <span className="font-mono text-xl font-bold text-slate-950 block mt-0.5 truncate">{value}</span>
        {subtitle && <span className="text-[10px] text-gray-500 leading-none truncate block">{subtitle}</span>}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-slate-900 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-150 bg-gray-50 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
