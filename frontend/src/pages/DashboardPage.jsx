import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, CartesianGrid, AreaChart, Area,
} from "recharts";
import {
  dashboardApi, alertsApi, notificationsApi, systemApi, projectsApi,
} from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import RoleGate from "../components/RoleGate";

const COLORS = ["#1f4e79", "#3a7ca5", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

const ACTIVITY_ICONS = {
  project_created: "🏗️",
  project_updated: "✏️",
  image_uploaded: "📸",
  ai_analysis: "🤖",
  expense: "💰",
  expense_recorded: "💰",
  alert: "🔔",
  alert_triggered: "🔔",
  report_generated: "📄",
  user_login: "🔑",
};

const SEVERITY_DOT = {
  low: "bg-slate-400",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

const SEVERITY_PILL = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-rose-100 text-rose-700 border-rose-200",
};


function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtCompact = (v) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` :
  v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` :
  v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` :
  Number(v || 0).toLocaleString();


function Stat({ label, value, sub, accent = "ukwi", icon, to }) {
  const accents = {
    ukwi: "from-ukwi-500/10 to-ukwi-500/0 text-ukwi-700",
    emerald: "from-emerald-500/10 to-emerald-500/0 text-emerald-700",
    amber: "from-amber-500/10 to-amber-500/0 text-amber-700",
    rose: "from-rose-500/10 to-rose-500/0 text-rose-700",
  };
  const inner = (
    <div className={`card relative overflow-hidden bg-gradient-to-br ${accents[accent]} h-full`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-3xl font-bold mt-1 leading-tight">{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
        {icon && <div className="text-2xl">{icon}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block hover:-translate-y-0.5 transition-transform">{inner}</Link> : inner;
}


function ChartCard({ title, subtitle, children, action }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}


function EmptyChart({ message = "No data yet" }) {
  return (
    <div className="h-[250px] flex items-center justify-center text-slate-400 text-sm">
      <div className="text-center">
        <div className="text-3xl mb-1">📊</div>
        <div>{message}</div>
      </div>
    </div>
  );
}


function StatusPill({ ok, label }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"} ${ok ? "shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" : "shadow-[0_0_0_3px_rgba(244,63,94,0.18)]"}`} />
        <span className={`text-xs font-medium ${ok ? "text-emerald-700" : "text-rose-700"}`}>
          {ok ? "Operational" : "Issue"}
        </span>
      </span>
    </div>
  );
}


function SystemStatusCard() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["system", "health"],
    queryFn: () => systemApi.health().then((r) => r.data),
    refetchInterval: 30_000,
  });
  const overall = data?.status === "ok";
  const dbOk = data?.database === "ok";
  const aiOk = data?.ai_service === "ok";

  return (
    <div className="card h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-800">System status</h2>
          <p className="text-xs text-slate-500 mt-0.5">Live service health · refreshes every 30s</p>
        </div>
        <span className={`badge border ${overall ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
          {isLoading ? "checking…" : overall ? "All systems normal" : "Degraded"}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        <StatusPill ok={dbOk} label="Database" />
        <StatusPill ok={aiOk} label="AI service" />
        <StatusPill ok={!isLoading && !!data} label="API gateway" />
      </div>
      <div className="mt-3 text-[11px] text-slate-400">
        Environment: <span className="font-medium text-slate-500">{data?.environment || "—"}</span>
        {dataUpdatedAt ? ` · checked ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
      </div>
    </div>
  );
}


function QuickActions({ user, hasRole }) {
  const actions = [];
  if (hasRole("admin", "project_manager")) {
    actions.push({ to: "/projects/new", icon: "🏗️", label: "New project", accent: "bg-ukwi-50 text-ukwi-700 border-ukwi-200" });
  }
  if (hasRole("admin", "project_manager", "engineer")) {
    actions.push({ to: "/ai-analysis", icon: "🤖", label: "Run AI analysis", accent: "bg-violet-50 text-violet-700 border-violet-200" });
  }
  actions.push({ to: "/projects", icon: "📁", label: "Browse projects", accent: "bg-sky-50 text-sky-700 border-sky-200" });
  actions.push({ to: "/reports", icon: "📄", label: "Generate report", accent: "bg-emerald-50 text-emerald-700 border-emerald-200" });
  actions.push({ to: "/alerts", icon: "🔔", label: "Review alerts", accent: "bg-amber-50 text-amber-700 border-amber-200" });
  if (hasRole("admin")) {
    actions.push({ to: "/users", icon: "👥", label: "Manage users", accent: "bg-rose-50 text-rose-700 border-rose-200" });
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">Quick actions</h2>
        <span className="text-xs text-slate-400">Tailored to your role</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {actions.map((a) => (
          <Link
            key={a.to + a.label}
            to={a.to}
            className={`group flex flex-col items-start gap-1 rounded-lg border ${a.accent} p-3 hover:shadow-sm transition-all hover:-translate-y-0.5`}
          >
            <span className="text-xl">{a.icon}</span>
            <span className="text-xs font-semibold leading-tight">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}


function AlertsSummaryCard() {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts", "open-summary"],
    queryFn: () => alertsApi.list({ unresolved_only: true, limit: 100 }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach((a) => { c[a.severity] = (c[a.severity] || 0) + 1; });
    return c;
  }, [alerts]);

  const top = alerts.slice(0, 4);
  const total = alerts.length;

  return (
    <div className="card h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-800">Open alerts</h2>
          <p className="text-xs text-slate-500 mt-0.5">{total} unresolved across your projects</p>
        </div>
        <Link to="/alerts" className="text-xs text-ukwi-600 hover:underline">View all →</Link>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {(["critical", "high", "medium", "low"]).map((s) => (
          <div key={s} className={`rounded-md border px-2 py-1.5 text-center ${SEVERITY_PILL[s]}`}>
            <div className="text-lg font-bold leading-none">{counts[s] || 0}</div>
            <div className="text-[10px] uppercase tracking-wide mt-0.5">{s}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : total === 0 ? (
        <div className="text-center py-4 text-sm text-slate-500">
          <div className="text-2xl mb-1">✅</div>
          No open alerts — nice work.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {top.map((a) => (
            <li key={a.id} className="py-2 flex items-start gap-2 text-sm">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[a.severity] || "bg-slate-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-slate-800 truncate">{a.message}</div>
                <Link to={`/projects/${a.project_id}`} className="text-xs text-slate-500 hover:text-ukwi-600 hover:underline">
                  Project #{a.project_id} · {new Date(a.triggered_at).toLocaleDateString()}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function NotificationsCard() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", "unread-summary"],
    queryFn: () => notificationsApi.list({ unread_only: true, limit: 6 }).then((r) => r.data),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="card h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-800">Notifications</h2>
          <p className="text-xs text-slate-500 mt-0.5">{items.length} unread for you</p>
        </div>
        <Link to="/notifications" className="text-xs text-ukwi-600 hover:underline">All →</Link>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-4 text-sm text-slate-500">
          <div className="text-2xl mb-1">📭</div>
          You're all caught up.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((n) => (
            <li key={n.id} className="py-2 flex items-start gap-2 text-sm group">
              <span className="mt-1.5 w-2 h-2 rounded-full bg-ukwi-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-slate-800 font-medium truncate">{n.title}</div>
                {n.message && (
                  <div className="text-xs text-slate-500 truncate">{n.message}</div>
                )}
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => markRead.mutate(n.id)}
                className="opacity-0 group-hover:opacity-100 text-[11px] text-slate-500 hover:text-ukwi-600 transition-opacity"
                title="Mark as read"
              >
                ✓
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function AtRiskProjectsCard({ alerts }) {
  // Aggregate unresolved alerts by project to surface "at-risk" ones.
  const grouped = useMemo(() => {
    const map = new Map();
    (alerts || []).forEach((a) => {
      const cur = map.get(a.project_id) || { project_id: a.project_id, count: 0, worst: "low", types: new Set() };
      cur.count += 1;
      cur.types.add(a.alert_type);
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      if ((order[a.severity] ?? 0) > (order[cur.worst] ?? 0)) cur.worst = a.severity;
      map.set(a.project_id, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [alerts]);

  // Hydrate names for the listed projects.
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "list-mini"],
    queryFn: () => projectsApi.list({ limit: 200 }).then((r) => r.data),
  });
  const byId = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  return (
    <div className="card h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-800">Projects at risk</h2>
          <p className="text-xs text-slate-500 mt-0.5">Most unresolved alerts in the last 30 days</p>
        </div>
        <Link to="/projects" className="text-xs text-ukwi-600 hover:underline">All projects →</Link>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-500">
          <div className="text-2xl mb-1">🛡️</div>
          No projects flagged — portfolio looks healthy.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {grouped.map((g) => {
            const p = byId[g.project_id];
            return (
              <li key={g.project_id} className="py-2.5 flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[g.worst]}`} />
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/projects/${g.project_id}`}
                    className="text-sm font-medium text-slate-800 hover:text-ukwi-600 hover:underline truncate block"
                  >
                    {p?.project_name || `Project #${g.project_id}`}
                  </Link>
                  <div className="text-[11px] text-slate-500 truncate">
                    {[...g.types].map((t) => String(t).replace(/_/g, " ")).join(" · ")}
                  </div>
                </div>
                <span className={`badge border ${SEVERITY_PILL[g.worst]}`}>{g.count} open</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


export default function DashboardPage() {
  const { user, hasRole } = useAuth();

  const overview = useQuery({ queryKey: ["dash", "overview"], queryFn: () => dashboardApi.overview().then((r) => r.data) });
  const budget = useQuery({ queryKey: ["dash", "budget"], queryFn: () => dashboardApi.budget().then((r) => r.data) });
  const recent = useQuery({ queryKey: ["dash", "recent"], queryFn: () => dashboardApi.recent().then((r) => r.data) });
  const trend = useQuery({ queryKey: ["dash", "trend"], queryFn: () => dashboardApi.progressTrend().then((r) => r.data) });
  const stages = useQuery({ queryKey: ["dash", "stages"], queryFn: () => dashboardApi.stageDistribution().then((r) => r.data) });
  const cost = useQuery({ queryKey: ["dash", "cost-trend"], queryFn: () => dashboardApi.costTrend({ days: 30 }).then((r) => r.data) });
  const openAlerts = useQuery({
    queryKey: ["alerts", "open-list"],
    queryFn: () => alertsApi.list({ unresolved_only: true, limit: 100 }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (overview.isLoading)
    return (
      <div className="text-slate-500 flex items-center gap-2">
        <span className="w-4 h-4 rounded-full border-2 border-ukwi-500 border-t-transparent animate-spin" />
        Loading dashboard…
      </div>
    );

  const data = overview.data || {};

  const totalBudget = Number(data.total_budget || 0);
  const totalSpent = Number(data.total_spent || 0);
  const remaining = Number(data.remaining_budget || 0);
  const utilisation = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const budgetPie = [
    { name: "Spent", value: totalSpent },
    { name: "Remaining", value: Math.max(0, remaining) },
  ];
  const categoryData = Object.entries(budget.data?.by_category || {}).map(([k, v]) => ({
    category: k,
    amount: Number(v),
  }));

  const firstName = (user?.full_name || "there").split(" ")[0];
  const roleLabel = String(user?.role || "").replace("_", " ");

  return (
    <div className="space-y-6">
      {/* Greeting hero */}
      <div className="rounded-xl bg-gradient-to-br from-ukwi-700 via-ukwi-600 to-ukwi-500 text-white p-5 md:p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-ukwi-100">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">{greet()}, {firstName} 👋</h1>
            <p className="text-sm text-ukwi-100 mt-1 capitalize">
              Signed in as <span className="font-semibold">{roleLabel}</span>
              {" · "}
              {data.active_projects ?? 0} active project{(data.active_projects ?? 0) === 1 ? "" : "s"}
              {" · "}
              {(openAlerts.data?.length ?? 0)} open alert{(openAlerts.data?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/projects" className="bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold px-3 py-2 rounded transition-colors">
              View projects →
            </Link>
            <RoleGate roles={["admin", "project_manager", "engineer"]}>
              <Link to="/ai-analysis" className="bg-white text-ukwi-700 hover:bg-ukwi-50 text-xs font-semibold px-3 py-2 rounded transition-colors">
                Run AI analysis
              </Link>
            </RoleGate>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <QuickActions user={user} hasRole={hasRole} />

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          icon="🏗️"
          label="Active projects"
          value={data.active_projects ?? 0}
          sub={`${data.total_projects ?? 0} total · ${data.completed_projects ?? 0} completed`}
          to="/projects"
        />
        <Stat
          icon="💰"
          label="Total budget"
          accent="emerald"
          value={fmtCompact(totalBudget)}
          sub={`Spent ${fmtCompact(totalSpent)} · ${utilisation.toFixed(0)}% used`}
        />
        <Stat
          icon="📈"
          label="Average progress"
          accent="amber"
          value={`${(data.average_progress || 0).toFixed(1)}%`}
          sub={`${data.on_track_count ?? 0} on-track · ${data.under_budget_count ?? 0} under`}
        />
        <Stat
          icon="🚨"
          label="Over budget"
          accent="rose"
          value={data.over_budget_count ?? 0}
          sub={`${(data.over_budget_count ?? 0) === 0 ? "All clear ✓" : "Action required"}`}
          to="/alerts"
        />
      </div>

      {/* Operations row: alerts · notifications · system status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AlertsSummaryCard />
        <NotificationsCard />
        <SystemStatusCard />
      </div>

      {/* Budget utilization bar */}
      <div className="card">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-semibold text-slate-800">Portfolio budget utilisation</h2>
          <span className="text-sm text-slate-500">
            {fmt(totalSpent)} / {fmt(totalBudget)} RWF
          </span>
        </div>
        <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full transition-all ${
              utilisation > 100 ? "bg-rose-500" : utilisation > 80 ? "bg-amber-500" : "bg-gradient-to-r from-ukwi-500 to-ukwi-300"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, utilisation))}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>0</span>
          <span>{utilisation.toFixed(1)}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Budget split" subtitle="Spent vs remaining across the portfolio">
          {totalBudget === 0 ? (
            <EmptyChart message="No budget data yet. Create a project to begin." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={budgetPie} dataKey="value" outerRadius={90} innerRadius={55} paddingAngle={2}>
                  {budgetPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Spend by category" subtitle="All projects, all time">
          {categoryData.length === 0 ? (
            <EmptyChart message="No expenses recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtCompact} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="amount" fill="#1f4e79" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Charts row 2 — Cost trend + AI progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Daily spend (last 30 days)" subtitle="Cash-out across all projects">
          {(!cost.data || cost.data.length === 0) ? (
            <EmptyChart message="Record an expense to populate this chart." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={cost.data}>
                <defs>
                  <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1f4e79" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#1f4e79" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Area type="monotone" dataKey="value" stroke="#1f4e79" strokeWidth={2.5} fill="url(#costFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="AI progress trend" subtitle="Recent predictions across all projects">
          {(!trend.data || trend.data.length === 0) ? (
            <EmptyChart message="Run an AI analysis to populate this chart." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Charts row 3 — Stage distribution + Projects at risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Stage distribution" subtitle="How many projects sit at each stage">
          {(!stages.data || stages.data.length === 0) ? (
            <EmptyChart message="No analyses yet." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stages.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="stage" interval={0} angle={-15} textAnchor="end" height={70} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3a7ca5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <AtRiskProjectsCard alerts={openAlerts.data || []} />
      </div>

      {/* Recent activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-slate-800">Recent activity</h2>
            <p className="text-xs text-slate-500">Latest events across the portfolio</p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {(recent.data || []).map((it, i) => (
            <li key={i} className="py-3 flex items-start gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                {ACTIVITY_ICONS[it.type] || "•"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-slate-800 truncate">{it.summary}</div>
                <div className="text-xs text-slate-500 capitalize">
                  {String(it.type).replace(/_/g, " ")}
                  {it.project_id ? (
                    <>
                      {" · "}
                      <Link to={`/projects/${it.project_id}`} className="hover:text-ukwi-600 hover:underline">
                        Project #{it.project_id}
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="text-xs text-slate-500 whitespace-nowrap">
                {new Date(it.timestamp).toLocaleString()}
              </div>
            </li>
          ))}
          {(!recent.data || recent.data.length === 0) && (
            <li className="py-6 text-center text-slate-500 text-sm">
              No activity yet — actions will start appearing here as soon as the team uses the system.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
