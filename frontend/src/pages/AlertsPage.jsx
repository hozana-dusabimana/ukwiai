import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { alertsApi } from "../api/endpoints";
import StatusBadge from "../components/StatusBadge";
import RoleGate from "../components/RoleGate";

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => alertsApi.list({ unresolved_only: false, limit: 100 }).then(r => r.data),
  });
  const resolve = useMutation({
    mutationFn: (id) => alertsApi.resolve(id),
    onSuccess: () => { toast.success("Resolved"); qc.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: () => toast.error("Could not resolve"),
  });
  const read = useMutation({
    mutationFn: (id) => alertsApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <div className="card">
        {isLoading ? <div className="text-slate-500">Loading…</div> : (
          <ul className="divide-y divide-slate-200">
            {(data || []).map((a) => (
              <li key={a.id} className={`py-3 flex items-start gap-3 ${a.is_read ? "opacity-70" : ""}`}>
                <StatusBadge value={a.severity} />
                <div className="flex-1">
                  <div className="text-sm">{a.message}</div>
                  <div className="text-xs text-slate-500">{a.alert_type} · project {a.project_id} · {new Date(a.triggered_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  {!a.is_read && <button className="btn-secondary text-xs" onClick={() => read.mutate(a.id)}>Mark read</button>}
                  <RoleGate roles={["admin", "project_manager"]}>
                    {!a.resolved_at && <button className="btn-primary text-xs" onClick={() => resolve.mutate(a.id)}>Resolve</button>}
                  </RoleGate>
                </div>
              </li>
            ))}
            {(!data || data.length === 0) && <li className="py-4 text-slate-500 text-sm text-center">No alerts.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
