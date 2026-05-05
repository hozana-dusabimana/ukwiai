import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  projectsApi, budgetApi, costApi, aiApi, imagesApi, alertsApi, reportsApi,
} from "../api/endpoints";
import StatusBadge from "../components/StatusBadge";
import RoleGate from "../components/RoleGate";
import ImagePicker from "../components/ImagePicker";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, CartesianGrid } from "recharts";

const ENGINEER_PLUS = ["admin", "project_manager", "engineer"];
const MANAGER_PLUS = ["admin", "project_manager"];

function ReadOnlyHint({ message = "Read-only — your role can browse but cannot make changes here." }) {
  return (
    <div className="card text-sm text-slate-500 border border-amber-200 bg-amber-50">
      {message}
    </div>
  );
}

const tabs = ["Overview", "Stages", "Images", "Budget", "AI History", "Reports"];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [tab, setTab] = useState("Overview");
  const qc = useQueryClient();

  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => projectsApi.get(projectId).then(r => r.data) });
  const summary = useQuery({ queryKey: ["project", projectId, "summary"], queryFn: () => projectsApi.summary(projectId).then(r => r.data) });

  if (project.isLoading) return <div>Loading project…</div>;
  if (!project.data) return <div className="text-rose-600">Project not found.</div>;

  const p = project.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{p.project_name}</h1>
          <div className="text-sm text-slate-500 font-mono">{p.project_code} · {p.location}</div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge value={p.status} />
          <span className="text-sm text-slate-500">Budget: {Number(p.total_budget).toLocaleString()}</span>
        </div>
      </div>

      <div className="border-b">
        <nav className="-mb-px flex gap-3 text-sm">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 border-b-2 ${tab === t ? "border-ukwi-500 text-ukwi-600 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === "Overview" && <OverviewTab projectId={projectId} summary={summary.data} />}
      {tab === "Stages" && <StagesTab projectId={projectId} />}
      {tab === "Images" && <ImagesTab projectId={projectId} />}
      {tab === "Budget" && <BudgetTab projectId={projectId} />}
      {tab === "AI History" && <AIHistoryTab projectId={projectId} />}
      {tab === "Reports" && <ReportsTab projectId={projectId} />}
    </div>
  );
}

function OverviewTab({ projectId, summary }) {
  const variance = useQuery({ queryKey: ["variance", projectId], queryFn: () => costApi.variance(projectId).then(r => r.data) });
  const forecast = useQuery({ queryKey: ["forecast", projectId], queryFn: () => costApi.forecast(projectId).then(r => r.data) });

  const f = forecast.data || {};
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="card">
        <h3 className="font-semibold mb-2">AI progress</h3>
        <div className="text-3xl font-bold text-ukwi-700">{(summary?.latest_progress ?? 0).toFixed(1)}%</div>
        <div className="text-xs text-slate-500">Confidence: {((summary?.latest_confidence ?? 0) * 100).toFixed(1)}%</div>
        <div className="mt-2"><StatusBadge value={summary?.deviation_status} /></div>
      </div>
      <div className="card">
        <h3 className="font-semibold mb-2">Spend</h3>
        <div className="text-3xl font-bold text-ukwi-700">{Number(summary?.total_expenses ?? 0).toLocaleString()}</div>
        <div className="text-xs text-slate-500">vs estimated {Number(f.estimated_cost_used ?? 0).toLocaleString()}</div>
        <div className="text-xs text-slate-500">Projected total: {Number(f.projected_total_cost ?? 0).toLocaleString()}</div>
      </div>
      <div className="card">
        <h3 className="font-semibold mb-2">Open alerts</h3>
        <div className="text-3xl font-bold text-rose-600">{summary?.open_alerts_count ?? 0}</div>
        <div className="text-xs text-slate-500">{summary?.alerts_count ?? 0} total · {summary?.images_count ?? 0} images</div>
      </div>
      <div className="card md:col-span-3">
        <h3 className="font-semibold mb-2">Variance over time</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={variance.data || []}>
            <XAxis dataKey="generated_at" tickFormatter={(v) => new Date(v).toLocaleDateString()} />
            <YAxis />
            <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
            <Legend />
            <Line type="monotone" dataKey="actual_cost_recorded" stroke="#dc2626" name="Actual" />
            <Line type="monotone" dataKey="estimated_cost_used" stroke="#1f4e79" name="AI estimated" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StagesTab({ projectId }) {
  const { data } = useQuery({ queryKey: ["timeline", projectId], queryFn: () => projectsApi.timeline(projectId).then(r => r.data) });
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2 pr-4">#</th>
            <th className="py-2 pr-4">Stage</th>
            <th className="py-2 pr-4">Expected progress</th>
            <th className="py-2 pr-4">Allocated</th>
            <th className="py-2 pr-4">Actual</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((s) => (
            <tr key={s.stage_order} className="border-b">
              <td className="py-2 pr-4">{s.stage_order}</td>
              <td className="py-2 pr-4 font-medium">{s.stage_name}</td>
              <td className="py-2 pr-4">≤ {s.expected_progress}%</td>
              <td className="py-2 pr-4">{s.allocated_budget.toLocaleString()}</td>
              <td className="py-2 pr-4">{s.actual_cost.toLocaleString()}</td>
              <td className="py-2 pr-4"><StatusBadge value={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImagesTab({ projectId }) {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const list = useQuery({ queryKey: ["images", projectId], queryFn: () => imagesApi.list(projectId).then(r => r.data) });
  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("file", file);
      return imagesApi.upload(projectId, fd);
    },
    onSuccess: () => {
      toast.success("Image uploaded");
      qc.invalidateQueries({ queryKey: ["images", projectId] });
      setFile(null);
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Upload failed"),
  });

  return (
    <div className="space-y-4">
      <RoleGate
        roles={ENGINEER_PLUS}
        fallback={<ReadOnlyHint message="Read-only — only engineers, project managers, and admins can upload site images." />}
      >
        <div className="card">
          <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-slate-800">Add a site photo</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Take a photo with your camera, drop a file, or pick from disk. Photos are stored against this project.
              </p>
            </div>
            {file && (
              <button
                type="button"
                disabled={upload.isPending}
                onClick={() => upload.mutate()}
                className="btn-primary"
              >
                {upload.isPending ? "Uploading…" : "📤 Upload"}
              </button>
            )}
          </div>
          <ImagePicker value={file} onChange={setFile} disabled={upload.isPending} />
        </div>
      </RoleGate>

      <div className="card">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-semibold text-slate-800">Photo gallery</h3>
          <span className="text-xs text-slate-500">{(list.data || []).length} image(s)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(list.data || []).map((img) => (
            <a
              key={img.id}
              href={img.image_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:shadow-md transition-shadow group"
            >
              <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                <img
                  src={img.image_url}
                  alt={img.original_filename || ""}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
              <div className="p-2 text-xs text-slate-500 flex items-center justify-between">
                <span>{new Date(img.captured_date || img.created_at).toLocaleDateString()}</span>
                {img.file_size && <span>{Math.round(img.file_size / 1024)} KB</span>}
              </div>
            </a>
          ))}
          {(!list.data || list.data.length === 0) && (
            <div className="col-span-full text-center py-8 text-slate-500">
              <div className="text-4xl mb-2">📸</div>
              <div className="font-medium text-slate-700">No site photos yet</div>
              <div className="text-xs mt-1">Use the form above to capture or upload the first one.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetTab({ projectId }) {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ["budget", projectId], queryFn: () => budgetApi.summary(projectId).then(r => r.data) });
  const expenses = useQuery({ queryKey: ["expenses", projectId], queryFn: () => budgetApi.expenses(projectId).then(r => r.data) });
  const breakdown = useQuery({ queryKey: ["breakdown", projectId], queryFn: () => budgetApi.breakdown(projectId).then(r => r.data) });
  const [form, setForm] = useState({ expense_category: "materials", amount: 0, description: "", expense_date: new Date().toISOString().slice(0, 10) });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = useMutation({
    mutationFn: () => budgetApi.addExpense(projectId, { ...form, amount: Number(form.amount) }),
    onSuccess: () => {
      toast.success("Expense added");
      qc.invalidateQueries({ queryKey: ["budget", projectId] });
      qc.invalidateQueries({ queryKey: ["expenses", projectId] });
      qc.invalidateQueries({ queryKey: ["breakdown", projectId] });
      setForm({ ...form, amount: 0, description: "" });
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card">
        <h3 className="font-semibold mb-3">Spend per stage</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={breakdown.data || []}>
            <XAxis dataKey="stage_name" interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="allocated_budget" name="Allocated" fill="#3a7ca5" />
            <Bar dataKey="actual_cost" name="Actual" fill="#dc2626" />
          </BarChart>
        </ResponsiveContainer>
        <div className="text-sm text-slate-500 mt-2">
          Total budget: {Number(summary.data?.total_budget ?? 0).toLocaleString()} ·
          Spent: {Number(summary.data?.total_spent ?? 0).toLocaleString()} ·
          Remaining: {Number(summary.data?.remaining ?? 0).toLocaleString()}
        </div>
      </div>

      <RoleGate
        roles={ENGINEER_PLUS}
        fallback={<ReadOnlyHint message="Read-only — only engineers, project managers, and admins can record expenses." />}
      >
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="card space-y-2">
          <h3 className="font-semibold">Record expense</h3>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Category</label>
              <select className="input" value={form.expense_category} onChange={set("expense_category")}>
                {["materials", "labor", "equipment", "transport", "other"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="label">Date</label><input type="date" className="input" value={form.expense_date} onChange={set("expense_date")} /></div>
            <div><label className="label">Amount</label><input type="number" min="0.01" step="0.01" className="input" required value={form.amount} onChange={set("amount")} /></div>
          </div>
          <div><label className="label">Description</label><textarea className="input" rows="2" value={form.description} onChange={set("description")} /></div>
          <button disabled={add.isPending} className="btn-primary">{add.isPending ? "Saving…" : "Add expense"}</button>
        </form>
      </RoleGate>

      <div className="card lg:col-span-2 overflow-x-auto">
        <h3 className="font-semibold mb-3">Expenses</h3>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Description</th>
            </tr>
          </thead>
          <tbody>
            {(expenses.data || []).map((x) => (
              <tr key={x.id} className="border-b">
                <td className="py-2 pr-4">{x.expense_date}</td>
                <td className="py-2 pr-4">{x.expense_category}</td>
                <td className="py-2 pr-4">{Number(x.amount).toLocaleString()}</td>
                <td className="py-2 pr-4">{x.description}</td>
              </tr>
            ))}
            {(!expenses.data || expenses.data.length === 0) && <tr><td colSpan="4" className="py-4 text-center text-slate-500">No expenses recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AIHistoryTab({ projectId }) {
  const { data } = useQuery({ queryKey: ["ai-hist", projectId], queryFn: () => aiApi.analysisHistory(projectId).then(r => r.data) });
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Stage</th>
            <th className="py-2 pr-4">Progress</th>
            <th className="py-2 pr-4">Confidence</th>
            <th className="py-2 pr-4">Model</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((a) => (
            <tr key={a.id} className="border-b">
              <td className="py-2 pr-4">{new Date(a.analysis_date).toLocaleString()}</td>
              <td className="py-2 pr-4">{a.predicted_stage}</td>
              <td className="py-2 pr-4">{Number(a.predicted_progress_percentage ?? 0).toFixed(1)}%</td>
              <td className="py-2 pr-4">{((Number(a.confidence_score ?? 0)) * 100).toFixed(1)}%</td>
              <td className="py-2 pr-4 font-mono">{a.model_version}</td>
            </tr>
          ))}
          {(!data || data.length === 0) && <tr><td colSpan="5" className="py-4 text-center text-slate-500">No analyses yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ReportsTab({ projectId }) {
  const list = useQuery({ queryKey: ["reports", projectId], queryFn: () => reportsApi.list({ project_id: projectId }).then(r => r.data) });
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const gen = useMutation({
    mutationFn: (payload) => reportsApi.generate(payload),
    onSuccess: () => { toast.success("Report generated"); list.refetch(); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  const handleAction = async (report, action) => {
    setBusyId(report.id);
    setBusyAction(action);
    try {
      if (action === "view") await reportsApi.viewInBrowser(report);
      else await reportsApi.saveToDisk(report);
    } catch (e) {
      toast.error(
        e?.response?.status === 410
          ? "Report file no longer exists on the server."
          : action === "view"
          ? "Could not open report."
          : "Could not download report."
      );
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <RoleGate
        roles={MANAGER_PLUS}
        fallback={<ReadOnlyHint message="Read-only — only project managers and admins can generate new reports. You can still browse and download existing ones below." />}
      >
        <div className="card flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => gen.mutate({ project_id: projectId, report_type: "full", format: "pdf" })}>Full PDF</button>
          <button className="btn-secondary" onClick={() => gen.mutate({ project_id: projectId, report_type: "progress", format: "pdf" })}>Progress PDF</button>
          <button className="btn-secondary" onClick={() => gen.mutate({ project_id: projectId, report_type: "budget", format: "pdf" })}>Budget PDF</button>
          <button className="btn-secondary" onClick={() => gen.mutate({ project_id: projectId, report_type: "budget", format: "excel" })}>Budget Excel</button>
        </div>
      </RoleGate>
      <div className="card">
        <h3 className="font-semibold mb-2">Past reports</h3>
        <ul className="divide-y divide-slate-200">
          {(list.data || []).map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium capitalize truncate">{String(r.report_type).replace(/_/g, " ")}</div>
                <div className="text-xs text-slate-500">{new Date(r.generated_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => handleAction(r, "view")}
                  className="btn-primary !py-1 !px-2 !text-xs"
                  title="Open in a new tab"
                >
                  {busyId === r.id && busyAction === "view" ? "…" : "👁️ View"}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => handleAction(r, "download")}
                  className="btn-secondary !py-1 !px-2 !text-xs"
                  title="Save to disk"
                >
                  {busyId === r.id && busyAction === "download" ? "…" : "⬇️"}
                </button>
              </div>
            </li>
          ))}
          {(!list.data || list.data.length === 0) && <li className="py-2 text-slate-500 text-sm">No reports yet.</li>}
        </ul>
      </div>
    </div>
  );
}
