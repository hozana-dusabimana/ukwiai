import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "../api/endpoints";

export default function ReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["reports-all"], queryFn: () => reportsApi.list().then(r => r.data) });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="card">
        {isLoading ? <div>Loading…</div> : (
          <ul className="divide-y divide-slate-200">
            {(data || []).map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{r.report_type} · project {r.project_id ?? "-"}</div>
                  <div className="text-xs text-slate-500">{new Date(r.generated_at).toLocaleString()}</div>
                </div>
                <a href={`/api/reports/${r.id}/download`} className="text-ukwi-500 hover:underline" target="_blank" rel="noreferrer">Download</a>
              </li>
            ))}
            {(!data || data.length === 0) && <li className="py-3 text-slate-500 text-sm text-center">No reports yet.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
