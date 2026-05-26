import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { notificationsApi } from "../api/endpoints";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

const TYPE_ICONS = {
  alert: "🔔",
  project: "🏗️",
  ai: "🤖",
  budget: "💰",
  report: "📄",
  system: "⚙️",
  default: "📬",
};


export default function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "page"],
    queryFn: () => notificationsApi.list({ limit: 200 }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: () => toast.error("Could not mark as read"),
  });

  const filtered = useMemo(() => {
    const all = data || [];
    if (filter === "unread") return all.filter((n) => !n.is_read);
    if (filter === "read") return all.filter((n) => n.is_read);
    return all;
  }, [data, filter]);

  const counts = useMemo(() => {
    const all = data || [];
    return {
      all: all.length,
      unread: all.filter((n) => !n.is_read).length,
      read: all.filter((n) => n.is_read).length,
    };
  }, [data]);

  const markAllRead = async () => {
    const unread = (data || []).filter((n) => !n.is_read);
    if (unread.length === 0) return;
    try {
      await Promise.all(unread.map((n) => notificationsApi.read(n.id)));
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Marked ${unread.length} as read`);
    } catch {
      toast.error("Could not mark all as read");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
          <p className="text-sm text-slate-500">
            {counts.unread} unread · {counts.all} total
          </p>
        </div>
        {counts.unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-xs">
            Mark all read
          </button>
        )}
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
          <div className="p-6 text-slate-500 text-sm flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-ukwi-500 border-t-transparent animate-spin" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-2">📭</div>
            <div className="font-medium text-slate-700">No notifications</div>
            <div className="text-xs mt-1">You'll see updates here as they arrive.</div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((n) => {
              const icon = TYPE_ICONS[n.type] || TYPE_ICONS.default;
              return (
                <li
                  key={n.id}
                  className={`p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors ${
                    n.is_read ? "opacity-70" : ""
                  }`}
                >
                  <div className="text-2xl flex-shrink-0 mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-slate-800">{n.title}</span>
                      {!n.is_read && (
                        <span className="badge bg-ukwi-100 text-ukwi-700 border border-ukwi-200">
                          new
                        </span>
                      )}
                      {n.type && (
                        <span className="text-[11px] text-slate-500 uppercase tracking-wide">
                          {n.type}
                        </span>
                      )}
                    </div>
                    {n.message && <p className="text-sm text-slate-700">{n.message}</p>}
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                      {n.link && (
                        <Link to={n.link} className="text-ukwi-600 hover:underline">
                          Open →
                        </Link>
                      )}
                    </div>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => markRead.mutate(n.id)}
                      className="text-xs text-slate-600 hover:text-ukwi-600 hover:underline whitespace-nowrap"
                    >
                      Mark read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
