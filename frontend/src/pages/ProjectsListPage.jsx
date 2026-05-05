import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { projectsApi } from "../api/endpoints";
import StatusBadge from "../components/StatusBadge";
import RoleGate from "../components/RoleGate";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "planned", label: "Planned" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
];


export default function ProjectsListPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["projects", search],
    queryFn: () => projectsApi.list({ search }).then((r) => r.data),
  });

  const filtered = useMemo(
    () => (data || []).filter((p) => !statusFilter || p.status === statusFilter),
    [data, statusFilter]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
          <p className="text-sm text-slate-500">
            {filtered.length} project{filtered.length === 1 ? "" : "s"}
            {statusFilter && ` · status: ${statusFilter.replace("_", " ")}`}
          </p>
        </div>
        <RoleGate roles={["admin", "project_manager"]}>
          <Link to="/projects/new" className="btn-primary">+ New project</Link>
        </RoleGate>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="🔍 Search by name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              onClick={() => setStatusFilter(f.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === f.value
                  ? "bg-ukwi-500 border-ukwi-500 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-ukwi-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-6 text-slate-500 text-sm flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-ukwi-500 border-t-transparent animate-spin" />
            Loading projects…
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="py-3 px-4 font-semibold">Code</th>
                <th className="py-3 px-4 font-semibold">Name</th>
                <th className="py-3 px-4 font-semibold">Client</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Budget (RWF)</th>
                <th className="py-3 px-4 font-semibold">Start</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{p.project_code}</td>
                  <td className="py-3 px-4">
                    <Link
                      to={`/projects/${p.id}`}
                      className="font-medium text-slate-800 hover:text-ukwi-600"
                    >
                      {p.project_name}
                    </Link>
                    {p.location && (
                      <div className="text-xs text-slate-500">{p.location}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{p.client_name || "—"}</td>
                  <td className="py-3 px-4">
                    <StatusBadge value={p.status} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {Number(p.total_budget).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{p.start_date || "—"}</td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      to={`/projects/${p.id}`}
                      className="text-ukwi-600 hover:underline text-xs font-medium"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500">
                    <div className="text-4xl mb-2">🏗️</div>
                    <div className="font-medium text-slate-700">
                      {search || statusFilter ? "No projects match your filter." : "No projects yet."}
                    </div>
                    <div className="text-xs mt-1">
                      {search || statusFilter
                        ? "Clear the filter or search."
                        : "Project managers and admins can create the first project."}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
