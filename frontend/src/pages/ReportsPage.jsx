import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { reportsApi } from "../api/endpoints";

const REPORT_ICONS = {
  full: "📑",
  progress: "📈",
  budget: "💰",
};


export default function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-all"],
    queryFn: () => reportsApi.list().then((r) => r.data),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-sm text-slate-500">
          {(data || []).length} report{(data || []).length === 1 ? "" : "s"} generated across all projects.
        </p>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-slate-500 text-sm">Loading…</div>
        ) : (data || []).length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-2">📄</div>
            <div className="font-medium text-slate-700">No reports yet</div>
            <div className="text-xs mt-1">
              Generate a report from any project's Reports tab. Project managers and admins can do this.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((r) => (
              <li key={r.id} className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <div className="text-3xl">{REPORT_ICONS[r.report_type] || "📄"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 capitalize">
                    {String(r.report_type).replace(/_/g, " ")} report
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.project_id ? (
                      <Link to={`/projects/${r.project_id}`} className="hover:text-ukwi-600 hover:underline">
                        Project #{r.project_id}
                      </Link>
                    ) : (
                      "Portfolio"
                    )}
                    {" · "}
                    {new Date(r.generated_at).toLocaleString()}
                  </div>
                </div>
                <a
                  href={`/api/reports/${r.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary !py-1.5 !px-3 !text-xs"
                >
                  ⬇️ Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
