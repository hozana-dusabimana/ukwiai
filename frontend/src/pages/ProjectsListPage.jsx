import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { projectsApi } from "../api/endpoints";
import StatusBadge from "../components/StatusBadge";
import RoleGate from "../components/RoleGate";

export default function ProjectsListPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["projects", search],
    queryFn: () => projectsApi.list({ search }).then(r => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <RoleGate roles={["admin", "project_manager"]}>
          <Link to="/projects/new" className="btn-primary">+ New project</Link>
        </RoleGate>
      </div>
      <input className="input max-w-md" placeholder="Search by name or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="text-slate-500">Loading…</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Budget</th>
                <th className="py-2 pr-4">Start</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data || []).map((p) => (
                <tr key={p.id} className="border-b hover:bg-slate-50">
                  <td className="py-2 pr-4 font-mono">{p.project_code}</td>
                  <td className="py-2 pr-4 font-medium">{p.project_name}</td>
                  <td className="py-2 pr-4">{p.client_name || "-"}</td>
                  <td className="py-2 pr-4"><StatusBadge value={p.status} /></td>
                  <td className="py-2 pr-4">{Number(p.total_budget).toLocaleString()}</td>
                  <td className="py-2 pr-4">{p.start_date || "-"}</td>
                  <td className="py-2"><Link to={`/projects/${p.id}`} className="text-ukwi-500 hover:underline">Open</Link></td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan="7" className="py-6 text-center text-slate-500">No projects yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
