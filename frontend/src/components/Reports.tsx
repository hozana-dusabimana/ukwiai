import React, { useEffect, useState } from "react";
import { FileText, Download, Sparkles, ArrowRight, Trash2, RefreshCw } from "lucide-react";
import { api, getToken } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { capabilitiesFor } from "../lib/roles";
import { useToast } from "../ui/Toast";
import { PageLoader, InlineError, EmptyState } from "../ui/primitives";

interface Project { id: number; project_name: string; project_code: string; }
interface Report {
  id: number;
  project_id?: number | null;
  report_type: string;
  file_path: string;
  generated_at: string;
  period_start?: string | null;
  period_end?: string | null;
}

const REPORT_TYPES: { value: string; label: string; description: string }[] = [
  { value: "progress", label: "Progress Report", description: "Detailed construction progress over a date range." },
  { value: "budget", label: "Budget Report", description: "Allocated vs spent vs forecast variance." },
  { value: "summary", label: "Executive Summary", description: "Status snapshot with key KPIs." },
  { value: "full", label: "Full Project Report", description: "All-in-one: progress, financials, alerts, AI history." },
];

export default function Reports() {
  const toast = useToast();
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);
  const [projects, setProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const [generating, setGenerating] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await api<Project[]>("/api/projects?limit=50");
      setProjects(p);
      if (projectId == null && p.length > 0) setProjectId(p[0].id);
      // The backend has GET /api/reports listing — try it; if it 404s, ignore.
      try {
        const r = await api<Report[]>("/api/reports?limit=20");
        setReports(r);
      } catch {
        // no reports list endpoint
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async (reportType: string) => {
    if (projectId == null) {
      toast.error("Pick a project first.");
      return;
    }
    setGenerating(reportType);
    try {
      const created = await api<Report>("/api/reports/generate", {
        method: "POST",
        body: { project_id: projectId, report_type: reportType, format },
      });
      setReports((all) => [created, ...all]);
      toast.success(`${reportType} report generated. Click Download to fetch.`);
    } catch (e: any) {
      toast.error(`Report failed: ${e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const remove = async (report: Report) => {
    if (!confirm(`Delete ${report.report_type} report #${report.id}? This removes the file permanently and cannot be undone.`)) return;
    setDeletingId(report.id);
    try {
      await api(`/api/reports/${report.id}`, { method: "DELETE" });
      setReports((all) => all.filter((r) => r.id !== report.id));
      toast.success("Report deleted.");
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const download = async (report: Report) => {
    try {
      const res = await fetch(`/api/reports/${report.id}/download`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = report.file_path?.toLowerCase().endsWith(".xlsx") ? "xlsx" : "pdf";
      a.download = `ukwi_${report.report_type}_${report.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(`Download failed: ${e.message}`);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Compliance</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-orange-600">Reports</span>
          </nav>
          <h1 className="font-sans text-2xl font-bold text-gray-950">Reports & Exports</h1>
          <p className="text-xs text-gray-500 mt-1">Generate signed PDF and Excel deliverables for stakeholders.</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={projectId ?? ""} onChange={(e) => setProjectId(Number(e.target.value))} className="bg-white border border-gray-200 px-3 py-2 rounded text-xs font-bold text-slate-900">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
          </select>
          <div className="flex rounded border border-gray-200 overflow-hidden">
            {(["pdf", "excel"] as const).map((f) => (
              <button key={f} onClick={() => setFormat(f)} className={`text-[10px] font-bold uppercase tracking-wider px-3 py-2 ${format === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-gray-50"}`}>{f}</button>
            ))}
          </div>
        </div>
      </header>

      {error && <InlineError message={error} />}
      {loading ? <PageLoader label="Loading reports" /> : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {REPORT_TYPES.map((rt) => (
              <div key={rt.value} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-orange-50 text-orange-600 rounded border border-orange-100">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900">{rt.label}</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4 flex-1">{rt.description}</p>
                <button
                  onClick={() => generate(rt.value)}
                  disabled={generating === rt.value || projectId == null}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider py-2 px-4 rounded flex items-center justify-center gap-1.5 self-start"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {generating === rt.value ? "Generating..." : `Generate ${format.toUpperCase()}`}
                </button>
              </div>
            ))}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <header className="px-6 py-4 border-b border-gray-150">
              <h3 className="font-bold text-slate-900">Recent generations</h3>
            </header>
            {reports.length === 0 ? (
              <EmptyState title="No reports generated yet" body="Click one of the cards above to generate your first signed deliverable." />
            ) : (
              <ul className="divide-y divide-gray-150">
                {reports.map((r) => (
                  <li key={r.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-sky-50 border border-sky-100 rounded">
                        <FileText className="w-4 h-4 text-slate-900" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 capitalize">{r.report_type} report #{r.id}</div>
                        <div className="text-[10px] text-gray-400 font-mono truncate">{new Date(r.generated_at).toLocaleString()}{r.project_id ? ` · project #${r.project_id}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => download(r)} className="bg-white border border-gray-200 hover:bg-gray-50 text-slate-900 text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                      {caps.canGenerateReport && (
                        <button
                          onClick={() => remove(r)}
                          disabled={deletingId === r.id}
                          title="Delete report"
                          aria-label={`Delete ${r.report_type} report #${r.id}`}
                          className="bg-white border border-gray-200 hover:bg-red-600 hover:text-white hover:border-red-600 text-red-600 px-3 py-2 rounded flex items-center disabled:opacity-60 transition-colors"
                        >
                          {deletingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
