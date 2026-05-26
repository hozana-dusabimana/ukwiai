import React, { useEffect, useState } from "react";
import { Bell, AlertTriangle, CheckCircle2, Eye, Camera, ArrowRight, Filter } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../ui/Toast";
import { PageLoader, InlineError, EmptyState } from "../ui/primitives";

interface Alert {
  id: number;
  project_id: number;
  alert_type: string;
  severity: string;
  message: string;
  is_read: boolean;
  triggered_at: string;
  resolved_at?: string | null;
}
interface Notification {
  id: number;
  user_id: number;
  title: string;
  message?: string;
  type?: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}
interface SiteImage {
  id: number;
  project_id: number;
  image_path: string;
  image_url?: string;
  captured_date?: string;
  notes?: string;
  original_filename?: string;
  created_at: string;
}
interface Project {
  id: number;
  project_name: string;
}

export default function SiteLogs() {
  const toast = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [images, setImages] = useState<SiteImage[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnresolved, setOnlyUnresolved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, n, p] = await Promise.all([
        api<Alert[]>(`/api/alerts?limit=50${onlyUnresolved ? "&unresolved_only=true" : ""}`),
        api<Notification[]>("/api/notifications?limit=30"),
        api<Project[]>("/api/projects?limit=50"),
      ]);
      setAlerts(a);
      setNotifications(n);
      setProjects(p);
      // fetch images per project (first 3 projects, latest 4 each)
      const imgGroups = await Promise.all(
        p.slice(0, 3).map((pr) => api<SiteImage[]>(`/api/projects/${pr.id}/images?limit=4`).catch(() => []))
      );
      setImages(imgGroups.flat().slice(0, 12));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [onlyUnresolved]);

  const projectName = (id: number) => projects.find((p) => p.id === id)?.project_name || `Project #${id}`;

  const markRead = async (id: number) => {
    try {
      await api(`/api/alerts/${id}/read`, { method: "PATCH" });
      setAlerts((all) => all.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
      toast.info("Alert marked as read");
    } catch (e: any) {
      toast.error(`Could not mark read: ${e.message}`);
    }
  };

  const resolve = async (id: number) => {
    try {
      await api(`/api/alerts/${id}/resolve`, { method: "PATCH" });
      setAlerts((all) => all.map((a) => (a.id === id ? { ...a, resolved_at: new Date().toISOString() } : a)));
      toast.success("Alert resolved");
    } catch (e: any) {
      toast.error(`Could not resolve: ${e.message}`);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Operations</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-orange-600">Site Logs</span>
          </nav>
          <h1 className="font-sans text-2xl font-bold text-gray-950">Live Site Logs & Alerts</h1>
          <p className="text-xs text-gray-500 mt-1">Active site warnings, recent captures, and operator notifications.</p>
        </div>
        <button
          onClick={() => setOnlyUnresolved((v) => !v)}
          className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded border transition-colors ${
            onlyUnresolved ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-white border-gray-200 text-slate-700 hover:bg-gray-50"
          }`}
        >
          <Filter className="w-3.5 h-3.5" /> {onlyUnresolved ? "Showing unresolved" : "Showing all"}
        </button>
      </header>

      {error && <InlineError message={error} />}
      {loading ? (
        <PageLoader label="Loading site activity" />
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <header className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-600" /> Alerts</h3>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{alerts.length}</span>
              </header>
              {alerts.length === 0 ? (
                <EmptyState title="No alerts in the queue" body="Everything is healthy. Alerts trigger from budget overrun, schedule slip, or AI confidence drops." />
              ) : (
                <ul className="divide-y divide-gray-150">
                  {alerts.map((a) => (
                    <li key={a.id} className={`px-6 py-4 flex items-start gap-4 ${a.is_read ? "opacity-70" : ""}`}>
                      <SeverityDot severity={a.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-slate-900 text-sm truncate">{a.message}</span>
                          <span className="text-[9px] uppercase tracking-wider font-bold bg-gray-100 border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{a.alert_type}</span>
                          {a.resolved_at && <span className="text-[9px] uppercase tracking-wider font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">Resolved</span>}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">{projectName(a.project_id)} · {new Date(a.triggered_at).toLocaleString()}</div>
                      </div>
                      <div className="flex flex-col gap-1.5 items-end">
                        {!a.is_read && (
                          <button onClick={() => markRead(a.id)} className="text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:text-slate-900 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Mark read
                          </button>
                        )}
                        {!a.resolved_at && (
                          <button onClick={() => resolve(a.id)} className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Resolve
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <header className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2"><Bell className="w-4 h-4 text-orange-600" /> Notifications</h3>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{notifications.length}</span>
              </header>
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">No notifications yet.</div>
              ) : (
                <ul className="divide-y divide-gray-150 max-h-[420px] overflow-y-auto">
                  {notifications.map((n) => (
                    <li key={n.id} className={`px-6 py-3 ${n.is_read ? "opacity-70" : ""}`}>
                      <div className="font-bold text-xs text-slate-900">{n.title}</div>
                      {n.message && <div className="text-[11px] text-gray-600 mt-1 leading-relaxed">{n.message}</div>}
                      <div className="text-[10px] text-gray-400 font-mono mt-1">{new Date(n.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
            <header className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Camera className="w-4 h-4 text-orange-600" /> Recent site captures</h3>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{images.length} images</span>
            </header>
            {images.length === 0 ? (
              <p className="text-xs text-gray-400">No site images uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((img) => (
                  <div key={img.id} className="bg-gray-50 border border-gray-200 rounded overflow-hidden">
                    <div className="aspect-video bg-gray-100">
                      <img referrerPolicy="no-referrer" src={img.image_url || img.image_path} alt={img.original_filename || `Image ${img.id}`} className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                    </div>
                    <div className="p-3">
                      <div className="text-xs font-bold text-slate-900 truncate">{img.original_filename || `Image ${img.id}`}</div>
                      <div className="text-[10px] text-gray-400">{projectName(img.project_id)} · {new Date(img.captured_date || img.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const cls =
    severity === "critical" ? "bg-red-500" :
    severity === "high" ? "bg-orange-500" :
    severity === "medium" ? "bg-amber-500" :
    "bg-sky-500";
  return <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${cls}`} aria-label={severity} />;
}
