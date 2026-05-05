import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { dashboardApi } from "../api/endpoints";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, CartesianGrid,
} from "recharts";

const COLORS = ["#1f4e79", "#3a7ca5", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

const ACTIVITY_ICONS = {
  project_created: "🏗️",
  project_updated: "✏️",
  image_uploaded: "📸",
  ai_analysis: "🤖",
  expense_recorded: "💰",
  alert_triggered: "🔔",
  report_generated: "📄",
  user_login: "🔑",
};


function Stat({ label, value, sub, accent = "ukwi", icon }) {
  const accents = {
    ukwi: "from-ukwi-500/10 to-ukwi-500/0 text-ukwi-700",
    emerald: "from-emerald-500/10 to-emerald-500/0 text-emerald-700",
    amber: "from-amber-500/10 to-amber-500/0 text-amber-700",
    rose: "from-rose-500/10 to-rose-500/0 text-rose-700",
  };
  return (
    <div className={`card relative overflow-hidden bg-gradient-to-br ${accents[accent]}`}>
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
}


function ChartCard({ title, subtitle, children, action }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
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


export default function DashboardPage() {
  const overview = useQuery({ queryKey: ["dash", "overview"], queryFn: () => dashboardApi.overview().then((r) => r.data) });
  const budget = useQuery({ queryKey: ["dash", "budget"], queryFn: () => dashboardApi.budget().then((r) => r.data) });
  const recent = useQuery({ queryKey: ["dash", "recent"], queryFn: () => dashboardApi.recent().then((r) => r.data) });
  const trend = useQuery({ queryKey: ["dash", "trend"], queryFn: () => dashboardApi.progressTrend().then((r) => r.data) });
  const stages = useQuery({ queryKey: ["dash", "stages"], queryFn: () => dashboardApi.stageDistribution().then((r) => r.data) });

  if (overview.isLoading)
    return (
      <div className="text-slate-500 flex items-center gap-2">
        <span className="w-4 h-4 rounded-full border-2 border-ukwi-500 border-t-transparent animate-spin" />
        Loading dashboard…
      </div>
    );

  const data = overview.data || {};
  const fmt = (n) => Number(n || 0).toLocaleString();

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Live snapshot across all UKWI projects · {new Date().toLocaleDateString()}
          </p>
        </div>
        <Link to="/projects" className="btn-secondary text-xs">View all projects →</Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          icon="🏗️"
          label="Active projects"
          value={data.active_projects ?? 0}
          sub={`${data.total_projects ?? 0} total · ${data.completed_projects ?? 0} completed`}
        />
        <Stat
          icon="💰"
          label="Total budget"
          accent="emerald"
          value={fmt(totalBudget)}
          sub={`Spent ${fmt(totalSpent)} · ${utilisation.toFixed(0)}% used`}
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
        />
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
                <YAxis tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString()} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="amount" fill="#1f4e79" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="AI progress trend" subtitle="Recent predictions across all projects">
          {(!trend.data || trend.data.length === 0) ? (
            <EmptyChart message="Run an AI analysis to populate this chart." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend.data || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <ChartCard title="Stage distribution" subtitle="How many projects sit at each stage">
          {(!stages.data || stages.data.length === 0) ? (
            <EmptyChart message="No analyses yet." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stages.data || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="stage" interval={0} angle={-15} textAnchor="end" height={70} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3a7ca5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
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
