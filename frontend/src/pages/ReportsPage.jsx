import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { reportsApi, projectsApi } from "../api/endpoints";
import RoleGate from "../components/RoleGate";

const REPORT_ICONS = {
  full: "📑",
  progress: "📈",
  budget: "💰",
};

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "full", label: "Full" },
  { value: "progress", label: "Progress" },
  { value: "budget", label: "Budget" },
];


function downloadCsv(rows, filename) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = Object.keys(rows[0] || { id: "", report_type: "" });
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function GenerateMenu({ projects, onGenerate, busy }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("full");
  const [format, setFormat] = useState("pdf");

  const submit = () => {
    if (!projectId) {
      toast.error("Pick a project first");
      return;
    }
    onGenerate({ project_id: Number(projectId), report_type: type, format });
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-primary"
        disabled={busy}
      >
        {busy ? "Generating…" : "+ Generate report"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg p-4 z-40 space-y-3">
            <div className="font-semibold text-slate-800 text-sm">New report</div>
            <div>
              <label className="label">Project</label>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— select —</option>
                {(projects || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} — {p.project_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Type</label>
                <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="full">Full</option>
                  <option value="progress">Progress</option>
                  <option value="budget">Budget</option>
                </select>
              </div>
              <div>
                <label className="label">Format</label>
                <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="pdf">PDF</option>
                  <option value="excel">Excel</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="button" onClick={submit} className="btn-primary flex-1">
                Generate
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


function StatCard({ label, value, accent = "ukwi", icon }) {
  const accents = {
    ukwi: "bg-ukwi-50 text-ukwi-700 border-ukwi-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <div className={`rounded-lg border p-3 ${accents[accent]}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}


export default function ReportsPage() {
  const qc = useQueryClient();
  const reports = useQuery({
    queryKey: ["reports-all"],
    queryFn: () => reportsApi.list({ limit: 200 }).then((r) => r.data),
  });
  const projects = useQuery({
    queryKey: ["projects-min-reports"],
    queryFn: () => projectsApi.list().then((r) => r.data),
  });

  const projectMap = useMemo(() => {
    const m = new Map();
    (projects.data || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [projects.data]);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const generate = useMutation({
    mutationFn: (payload) => reportsApi.generate(payload),
    onSuccess: () => {
      toast.success("Report generated");
      qc.invalidateQueries({ queryKey: ["reports-all"] });
      setPage(1);
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed to generate"),
  });

  const filtered = useMemo(() => {
    const list = reports.data || [];
    return list.filter((r) => {
      if (filter !== "all" && r.report_type !== filter) return false;
      if (!search) return true;
      const proj = projectMap.get(r.project_id);
      const hay = [
        r.report_type,
        proj?.project_name,
        proj?.project_code,
        proj?.client_name,
        r.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [reports.data, filter, search, projectMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => {
    const list = reports.data || [];
    return {
      all: list.length,
      full: list.filter((r) => r.report_type === "full").length,
      progress: list.filter((r) => r.report_type === "progress").length,
      budget: list.filter((r) => r.report_type === "budget").length,
    };
  }, [reports.data]);

  const onDownload = async (report) => {
    setBusyId(report.id);
    try {
      await reportsApi.saveToDisk(report);
    } catch (e) {
      toast.error(
        e?.response?.status === 410
          ? "Report file no longer exists on the server."
          : "Could not download report."
      );
    } finally {
      setBusyId(null);
    }
  };

  const onExportCsv = () => {
    if (filtered.length === 0) {
      toast.info("Nothing to export with the current filter.");
      return;
    }
    const rows = filtered.map((r) => {
      const proj = projectMap.get(r.project_id);
      return {
        id: r.id,
        report_type: r.report_type,
        project_id: r.project_id ?? "",
        project_code: proj?.project_code ?? "",
        project_name: proj?.project_name ?? "",
        client_name: proj?.client_name ?? "",
        generated_by: r.generated_by ?? "",
        generated_at: r.generated_at ?? "",
        period_start: r.period_start ?? "",
        period_end: r.period_end ?? "",
        file_path: r.file_path ?? "",
      };
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(rows, `ukwi-reports-${stamp}.csv`);
    toast.success(`Exported ${rows.length} report${rows.length === 1 ? "" : "s"} to CSV`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500">
            {counts.all} report{counts.all === 1 ? "" : "s"} generated across all projects.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onExportCsv} className="btn-secondary">
            ⬇️ Export CSV
          </button>
          <RoleGate roles={["admin", "project_manager"]}>
            <GenerateMenu
              projects={projects.data || []}
              onGenerate={(p) => generate.mutate(p)}
              busy={generate.isPending}
            />
          </RoleGate>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="📄" label="All reports" value={counts.all} accent="slate" />
        <StatCard icon="📑" label="Full" value={counts.full} accent="ukwi" />
        <StatCard icon="📈" label="Progress" value={counts.progress} accent="emerald" />
        <StatCard icon="💰" label="Budget" value={counts.budget} accent="amber" />
      </div>

      {/* Filter row */}
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="🔍 Search by project name, code, or client…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setFilter(f.value);
                setPage(1);
              }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filter === f.value
                  ? "bg-ukwi-500 border-ukwi-500 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-ukwi-300"
              }`}
            >
              {f.label}
              <span className="ml-1 opacity-70">({counts[f.value] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {reports.isLoading ? (
          <div className="p-6 text-slate-500 text-sm flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-ukwi-500 border-t-transparent animate-spin" />
            Loading reports…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-2">📄</div>
            <div className="font-medium text-slate-700">
              {counts.all === 0 ? "No reports yet" : "No reports match your filter"}
            </div>
            <div className="text-xs mt-1">
              {counts.all === 0
                ? "Project managers and admins can generate reports from a project's Reports tab or via the button above."
                : "Try clearing the search or switching the filter."}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 font-semibold">Report</th>
                    <th className="py-3 px-4 font-semibold">Project</th>
                    <th className="py-3 px-4 font-semibold">Generated</th>
                    <th className="py-3 px-4 font-semibold">By</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const proj = projectMap.get(r.project_id);
                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{REPORT_ICONS[r.report_type] || "📄"}</span>
                            <div>
                              <div className="font-medium text-slate-800 capitalize">
                                {String(r.report_type).replace(/_/g, " ")} report
                              </div>
                              <div className="text-xs text-slate-500 font-mono">#{r.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {proj ? (
                            <Link
                              to={`/projects/${proj.id}`}
                              className="hover:text-ukwi-600 hover:underline"
                            >
                              <div className="font-medium text-slate-800">{proj.project_name}</div>
                              <div className="text-xs text-slate-500 font-mono">
                                {proj.project_code}
                              </div>
                            </Link>
                          ) : r.project_id ? (
                            <span className="text-slate-500">Project #{r.project_id}</span>
                          ) : (
                            <span className="text-slate-400">Portfolio</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs whitespace-nowrap">
                          {new Date(r.generated_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {r.generated_by ? `User #${r.generated_by}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => onDownload(r)}
                            className="btn-secondary !py-1.5 !px-3 !text-xs"
                          >
                            {busyId === r.id ? "…" : "⬇️ Download"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
                <div className="text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="btn-secondary !py-1 !px-3 !text-xs disabled:opacity-50"
                  >
                    ← Prev
                  </button>
                  <span className="text-slate-600 self-center">
                    Page {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="btn-secondary !py-1 !px-3 !text-xs disabled:opacity-50"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
