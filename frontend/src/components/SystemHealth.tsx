import React, { useEffect, useState } from "react";
import { Download, Filter, ChevronLeft, ChevronRight, Database, Cpu, Network, Settings2, AlertOctagon, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { AuditLog } from "../types";
import { api } from "../lib/api";
import { useToast } from "../ui/Toast";
import { PageLoader, InlineError, StatCard } from "../ui/primitives";

interface SystemHealthProps {
  logs: AuditLog[];
  searchQuery: string;
}

interface HealthResponse {
  status: string;
  database: string;
  ai_service: string;
  ai_info?: { status?: string; ready?: boolean; using_fallback?: boolean; model_version?: string };
  environment: string;
}
interface SystemStats {
  users: number;
  projects: number;
  images: number;
  analyses: number;
  expenses: number;
  alerts: number;
}

export default function SystemHealth({ logs, searchQuery }: SystemHealthProps) {
  const toast = useToast();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/health").then((r) => r.json()),
      api<SystemStats>("/api/system/stats").catch(() => null),
    ])
      .then(([h, s]) => {
        setHealth(h);
        setStats(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.user.toLowerCase().includes(q) ||
      log.entity.toLowerCase().includes(q) ||
      log.reference.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);

  const exportLogs = () => {
    const headers = "timestamp,action,user,entity,status,reference\n";
    const rows = logs.map((l) => `${l.timestamp},${l.action},${l.user},${l.entity},${l.status},${l.reference}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ukwi_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Audit log exported");
  };

  if (loading) return <PageLoader label="Probing system health" />;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Infrastructure</span>
            <ArrowRight className="w-3" />
            <span className="text-slate-900 font-bold">System Monitoring</span>
          </nav>
          <h2 className="font-sans text-2xl font-bold text-gray-950">System Integrity & Reporting</h2>
          <p className="text-xs text-gray-500 mt-1">Live container, database, and AI service diagnostics with auditable activity history.</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-gray-200 px-4 py-2.5 rounded shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${health?.status === "ok" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="font-bold text-[10px] text-slate-900 uppercase">{health?.status === "ok" ? "System Nominal" : "Degraded"}</span>
          </div>
          <span className="text-gray-200">|</span>
          <span className="font-bold text-[10px] text-gray-400 uppercase">{health?.environment || "—"}</span>
        </div>
      </header>

      {error && <InlineError message={error} />}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard icon={<Network className="w-5 h-5" />} label="Core API" status={health?.status === "ok"} detail={health?.environment || "—"} />
        <StatusCard icon={<Database className="w-5 h-5" />} label="Database" status={health?.database === "ok"} detail="MySQL 8" />
        <StatusCard icon={<Cpu className="w-5 h-5" />} label="AI Service" status={health?.ai_service === "ok"} detail={health?.ai_info?.using_fallback ? "Heuristic fallback" : `Model ${health?.ai_info?.model_version || "v1"}`} />
        <StatusCard icon={<Settings2 className="w-5 h-5" />} label="AI Model" status={health?.ai_info?.ready} detail={health?.ai_info?.ready ? "Ready" : "Initialising"} />
      </section>

      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard icon={<Cpu className="w-4 h-4" />} label="Users" value={stats.users} accent="sky" />
          <StatCard icon={<Cpu className="w-4 h-4" />} label="Projects" value={stats.projects} accent="orange" />
          <StatCard icon={<Cpu className="w-4 h-4" />} label="Images" value={stats.images} accent="slate" />
          <StatCard icon={<Cpu className="w-4 h-4" />} label="Analyses" value={stats.analyses} accent="emerald" />
          <StatCard icon={<Cpu className="w-4 h-4" />} label="Expenses" value={stats.expenses} accent="slate" />
          <StatCard icon={<Cpu className="w-4 h-4" />} label="Alerts" value={stats.alerts} accent="red" />
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <header className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-bold text-slate-900 text-md">Administrative audit logs</h3>
          <div className="flex gap-3">
            <button className="bg-white border border-gray-200 shadow-sm px-4 py-1.5 rounded text-xs font-bold text-slate-700 uppercase tracking-wider hover:bg-gray-50 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-gray-400" /> Filter
            </button>
            <button onClick={exportLogs} className="bg-white border border-gray-200 shadow-sm px-4 py-1.5 rounded text-xs font-bold text-slate-700 uppercase tracking-wider hover:bg-gray-50 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-gray-400" /> Export full log
            </button>
          </div>
        </header>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-slate-900">
                {["Timestamp", "Action", "User", "Entity", "Status", "Reference"].map((h, i) => (
                  <th key={h} className={`px-6 py-3 font-bold text-[9px] text-[#A3B8CC] uppercase tracking-wider ${i === 5 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150 text-xs text-gray-700">
              {currentLogs.length > 0 ? currentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/50 group">
                  <td className="px-6 py-4 font-mono text-gray-400 text-[11px]">{log.timestamp}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{log.action}</td>
                  <td className="px-6 py-4 text-gray-600">{log.user}</td>
                  <td className="px-6 py-4 text-gray-600 font-medium">{log.entity}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider border ${
                      log.status === "Success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      log.status === "Modified" ? "bg-sky-50 text-sky-700 border-sky-200" :
                      "bg-red-50 text-red-700 border-red-200"
                    }`}>{log.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-gray-400 group-hover:text-slate-950">{log.reference}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400 text-xs">No matching events.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-150 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-400">Showing {currentLogs.length} of {filteredLogs.length} events.</p>
          {totalPages > 1 && (
            <div className="flex gap-1.5">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center border border-gray-200 bg-white rounded enabled:hover:bg-gray-50 disabled:opacity-50">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-8 h-8 flex items-center justify-center border rounded font-mono text-xs font-bold ${
                  currentPage === i + 1 ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-600"
                }`}>{i + 1}</button>
              ))}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center border border-gray-200 bg-white rounded enabled:hover:bg-gray-50 disabled:opacity-50">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-slate-900 text-white rounded-lg p-6 flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-300 leading-relaxed">
          All exports embed the originating user JWT subject. Reports and signed deliverables are tied to the operator who generated them — see the Reports tab.
        </p>
      </section>
    </div>
  );
}

function StatusCard({ icon, label, status, detail }: { icon: React.ReactNode; label: string; status: boolean | undefined; detail: string }) {
  const ok = !!status;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-4 min-w-0">
        <div className={`w-10 h-10 flex items-center justify-center rounded border ${ok ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-600"}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{label}</p>
          <p className="font-bold text-sm text-slate-950 mt-0.5 truncate">{ok ? "Online" : "Degraded"}</p>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-1 justify-end text-[11px] font-bold">
          {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
          <span className={ok ? "text-emerald-600" : "text-red-600"}>{ok ? "Healthy" : "Check logs"}</span>
        </div>
        <p className="text-[9px] text-gray-400 uppercase font-bold mt-1 truncate max-w-[120px]">{detail}</p>
      </div>
    </div>
  );
}
