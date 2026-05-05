import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/endpoints";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

const COLORS = ["#1f4e79", "#3a7ca5", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-ukwi-700 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const overview = useQuery({ queryKey: ["dash", "overview"], queryFn: () => dashboardApi.overview().then(r => r.data) });
  const budget = useQuery({ queryKey: ["dash", "budget"], queryFn: () => dashboardApi.budget().then(r => r.data) });
  const recent = useQuery({ queryKey: ["dash", "recent"], queryFn: () => dashboardApi.recent().then(r => r.data) });
  const trend = useQuery({ queryKey: ["dash", "trend"], queryFn: () => dashboardApi.progressTrend().then(r => r.data) });
  const stages = useQuery({ queryKey: ["dash", "stages"], queryFn: () => dashboardApi.stageDistribution().then(r => r.data) });

  if (overview.isLoading) return <div className="text-slate-500">Loading dashboard…</div>;

  const data = overview.data || {};
  const fmt = (n) => Number(n || 0).toLocaleString();

  const budgetPie = [
    { name: "Spent", value: Number(data.total_spent || 0) },
    { name: "Remaining", value: Number(data.remaining_budget || 0) },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active projects" value={data.active_projects ?? 0} sub={`${data.total_projects ?? 0} total`} />
        <StatCard label="Total budget" value={fmt(data.total_budget)} sub={`Spent ${fmt(data.total_spent)}`} />
        <StatCard label="Avg. progress" value={`${(data.average_progress || 0).toFixed(1)}%`} />
        <StatCard label="Over-budget" value={data.over_budget_count ?? 0} sub={`${data.on_track_count ?? 0} on-track / ${data.under_budget_count ?? 0} under`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Budget split</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={budgetPie} dataKey="value" outerRadius={90} innerRadius={50} label>
                {budgetPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Spend by category</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={Object.entries(budget.data?.by_category || {}).map(([k, v]) => ({ category: k, amount: v }))}>
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#1f4e79" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">AI progress trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend.data || []}>
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">Stage distribution</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stages.data || []}>
              <XAxis dataKey="stage" interval={0} angle={-15} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3a7ca5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Recent activity</h2>
        <ul className="divide-y divide-slate-200">
          {(recent.data || []).map((it, i) => (
            <li key={i} className="py-2 flex justify-between text-sm">
              <span className="capitalize">{it.type.replace("_", " ")}</span>
              <span className="flex-1 px-3 truncate text-slate-700">{it.summary}</span>
              <span className="text-slate-500">{new Date(it.timestamp).toLocaleString()}</span>
            </li>
          ))}
          {(!recent.data || recent.data.length === 0) && <li className="py-2 text-slate-500 text-sm">No recent activity.</li>}
        </ul>
      </div>
    </div>
  );
}
