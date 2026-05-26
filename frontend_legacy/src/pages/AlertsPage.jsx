import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { alertsApi } from "../api/endpoints";
import RoleGate from "../components/RoleGate";

const SEVERITY_COLORS = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-rose-100 text-rose-700 border-rose-200",
};

const TYPE_ICONS = {
  budget_overrun: "💰",
  delay: "⏰",
  anomaly: "⚠️",
  milestone: "🎯",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];


export default function AlertsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => alertsApi.list({ unresolved_only: false, limit: 100 }).then((r) => r.data),
  });
  const resolve = useMutation({
    mutationFn: (id) => alertsApi.resolve(id),
    onSuccess: () => {
      toast.success("Alert resolved");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: () => toast.error("Could not resolve"),
  });
  const read = useMutation({
    mutationFn: (id) => alertsApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const filtered = useMemo(() => {
    const all = data || [];
    switch (filter) {
      case "unread":
        return all.filter((a) => !a.is_read);
      case "open":
        return all.filter((a) => !a.resolved_at);
      case "resolved":
        return all.filter((a) => a.resolved_at);
      default:
        return all;
    }
  }, [data, filter]);

  const counts = useMemo(() => {
    const all = data || [];
    return {
      all: all.length,
      unread: all.filter((a) => !a.is_read).length,
      open: all.filter((a) => !a.resolved_at).length,
      resolved: all.filter((a) => a.resolved_at).length,
    };
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Alerts</h1>
        <p className="text-sm text-slate-500">
          {counts.open} open · {counts.unread} unread · {counts.all} total
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.value
                ? "bg-ukwi-500 border-ukwi-500 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:border-ukwi-300"
            }`}
          >
            {f.label} ({counts[f.value]})
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-2">🔔</div>
            <div className="font-medium text-slate-700">No alerts</div>
            <div className="text-xs mt-1">All clear in this view.</div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((a) => (
              <li
                key={a.id}
                className={`p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors ${
                  a.is_read ? "opacity-70" : ""
                }`}
              >
                <div className="text-2xl flex-shrink-0 mt-0.5">{TYPE_ICONS[a.alert_type] || "🔔"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`badge border ${SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.low}`}
                    >
                      {a.severity}
                    </span>
                    <span className="text-xs text-slate-500 capitalize">
                      {String(a.alert_type).replace(/_/g, " ")}
                    </span>
                    {a.resolved_at && (
                      <span className="badge bg-emerald-100 text-emerald-700 border border-emerald-200">
                        resolved
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800">{a.message}</p>
                  <div className="text-xs text-slate-500 mt-1">
                    <Link to={`/projects/${a.project_id}`} className="hover:text-ukwi-600 hover:underline">
                      Project #{a.project_id}
                    </Link>
                    {" · "}
                    {new Date(a.triggered_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  {!a.is_read && (
                    <button
                      className="text-slate-600 hover:text-slate-800 hover:underline"
                      onClick={() => read.mutate(a.id)}
                    >
                      Mark read
                    </button>
                  )}
                  <RoleGate roles={["admin", "project_manager"]}>
                    {!a.resolved_at && (
                      <button
                        className="btn-primary !py-1 !px-2 !text-xs"
                        onClick={() => resolve.mutate(a.id)}
                      >
                        Resolve
                      </button>
                    )}
                  </RoleGate>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
