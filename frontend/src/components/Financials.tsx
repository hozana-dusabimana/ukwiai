import React, { useEffect, useState } from "react";
import { Coins, TrendingUp, Plus, Wallet, AlertTriangle, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../ui/Toast";
import { PageLoader, EmptyState, InlineError, StatCard, Modal } from "../ui/primitives";

function backendStatusLabel(status: string): string {
  if (status === "completed") return "Complete";
  if (status === "in_progress") return "In progress";
  if (status === "delayed") return "Delayed";
  return "Not started";
}

function backendStatusClass(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "in_progress") return "bg-orange-50 text-orange-700 border-orange-200";
  if (status === "delayed") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

interface ProjectSummary {
  project: { id: number; project_name: string; total_budget: number | string };
  total_expenses: number | string;
  latest_progress: number | null;
  deviation_status: string | null;
}

interface BudgetSummary {
  total_budget: number | string;
  total_spent: number | string;
  remaining: number | string;
  spent_percent: number;
  by_category: Record<string, number>;
  by_stage: Record<string, number>;
  total_ai_inferred_cost?: number | string;
  effective_total_spent?: number | string;
  effective_spent_percent?: number;
  effective_remaining?: number | string;
}

interface BreakdownRow {
  stage_name: string;
  allocated_budget: number;
  actual_cost: number;
  ai_inferred_cost?: number;
  effective_spent?: number;
  remaining: number;
  status: string;
}

interface VarianceRow {
  generated_at: string;
  estimated_progress: number;
  estimated_cost_used: number;
  actual_cost_recorded: number;
  variance: number;
  deviation_status: string;
}

interface ProjectListItem {
  id: number;
  project_name: string;
  project_code: string;
  total_budget: number | string;
}

interface FinancialsProps {
  defaultProjectId?: number | null;
}

interface AnalysisRow {
  id: number;
  predicted_stage?: string;
  predicted_progress_percentage: number | string;
  confidence_score: number | string;
}

export default function Financials({ defaultProjectId }: FinancialsProps) {
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId ?? null);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [variance, setVariance] = useState<VarianceRow[]>([]);
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    api<ProjectListItem[]>("/api/projects?limit=50")
      .then((p) => {
        setProjects(p);
        if (projectId == null && p.length > 0) setProjectId(p[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (projectId == null) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api<BudgetSummary>(`/api/projects/${projectId}/budget/summary`),
      api<BreakdownRow[]>(`/api/projects/${projectId}/budget/breakdown`),
      api<VarianceRow[]>(`/api/projects/${projectId}/variance-analysis`),
      api<ProjectSummary>(`/api/projects/${projectId}/summary`),
      api<AnalysisRow[]>(`/api/ai/projects/${projectId}/analysis-history?limit=1`).catch(() => []),
    ])
      .then(([s, b, v, p, hist]) => {
        setSummary(s);
        setBreakdown(b);
        setVariance(v);
        setProjectSummary(p);
        setLatestAnalysis(hist[0] || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const latestVariance = variance[0];

  const refresh = () => {
    if (projectId == null) return;
    api<BudgetSummary>(`/api/projects/${projectId}/budget/summary`).then(setSummary).catch(() => {});
    api<BreakdownRow[]>(`/api/projects/${projectId}/budget/breakdown`).then(setBreakdown).catch(() => {});
  };

  if (projectId == null && !loading) {
    return <EmptyState title="No projects yet" body="Create a project from the Projects tab to track its finances." />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Operations</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-orange-600">Financials</span>
          </nav>
          <h1 className="font-sans text-2xl font-bold text-gray-950">Project Financial Suite</h1>
          <p className="text-xs text-gray-500 mt-1">Track allocated budget, expenses, variance, and forecast against AI progress.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(Number(e.target.value))}
            className="bg-white border border-gray-200 px-3 py-2 rounded text-xs font-bold text-slate-900"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_name} ({p.project_code})</option>
            ))}
          </select>
          <button
            onClick={() => setAddOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs uppercase tracking-wider py-2 px-4 rounded flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </div>
      </header>

      {error && <InlineError message={error} />}
      {loading || !summary ? (
        <PageLoader label="Loading financial data" />
      ) : (
        <>
          {(() => {
            const totalBudgetNum = Number(summary.total_budget) || 0;
            const recordedSpent = Number(summary.total_spent) || 0;
            const aiSpent = Number(summary.total_ai_inferred_cost ?? 0);
            const shownSpent = Number(summary.effective_total_spent ?? Math.max(recordedSpent, aiSpent));
            const shownRemaining = Number(summary.effective_remaining ?? (totalBudgetNum - shownSpent));
            const spentPct = Number(summary.effective_spent_percent ?? (totalBudgetNum > 0 ? (shownSpent / totalBudgetNum) * 100 : 0));
            const aiActive = aiSpent > 0 && shownSpent > recordedSpent;
            return (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard icon={<Wallet className="w-5 h-5" />} label="Total Budget" value={fmtRwf(totalBudgetNum)} subtitle={`Code: ${projects.find((p) => p.id === projectId)?.project_code || ""}`} />
                <StatCard
                  icon={<Coins className="w-5 h-5" />}
                  label={aiActive ? "Spent (AI inferred)" : "Total Spent"}
                  value={fmtRwf(shownSpent)}
                  subtitle={aiActive ? `${spentPct.toFixed(1)}% · recorded ${fmtRwf(recordedSpent)}` : `${spentPct.toFixed(1)}% consumed`}
                  accent="orange"
                />
                <StatCard
                  icon={<TrendingUp className="w-5 h-5" />}
                  label="Remaining"
                  value={fmtRwf(shownRemaining)}
                  subtitle={shownRemaining < 0 ? "Over budget" : "Available"}
                  accent={shownRemaining < 0 ? "red" : "emerald"}
                />
                <StatCard
                  icon={<AlertTriangle className="w-5 h-5" />}
                  label="Forecast Status"
                  value={prettyDeviation(projectSummary?.deviation_status)}
                  subtitle={latestVariance ? `Variance ${fmtRwf(Math.abs(Number(latestVariance.variance)))}` : "No analysis yet"}
                  accent={latestVariance && Number(latestVariance.variance) > 0 ? "red" : "emerald"}
                />
              </div>
            );
          })()}

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <header className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
              <h3 className="font-sans font-bold text-slate-900 text-md">Per-Stage Budget Breakdown</h3>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{breakdown.length} stages</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead>
                  <tr className="bg-slate-900 text-[#A3B8CC]">
                    {["Stage", "Allocated", "Spent", "Remaining", "Status"].map((h) => (
                      <th key={h} className="px-6 py-3 font-bold text-[10px] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 text-slate-700">
                  {breakdown.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-400">No breakdown yet — add expenses to populate.</td></tr>
                  ) : (
                    breakdown.map((row) => {
                      const allocated = Number(row.allocated_budget) || 0;
                      const recorded = Number(row.actual_cost) || 0;
                      const aiCost = Number(row.ai_inferred_cost ?? 0);
                      const effective = Number(row.effective_spent ?? Math.max(recorded, aiCost));
                      const shownRemaining = allocated - effective;
                      const aiDriving = aiCost > 0 && aiCost > recorded;
                      return (
                        <tr key={row.stage_name} className="hover:bg-gray-50/50">
                          <td className="px-6 py-3 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{row.stage_name}</span>
                              {aiDriving && (
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded" title="Backend-stored AI-inferred spend">AI</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 font-mono">{fmtRwf(allocated)}</td>
                          <td className="px-6 py-3 font-mono">
                            {fmtRwf(effective)}
                            {aiDriving && recorded === 0 && <span className="ml-1 text-[9px] text-orange-600 font-bold uppercase">AI</span>}
                            {recorded > 0 && aiCost > 0 && recorded < aiCost && <span className="ml-1 text-[9px] text-gray-400 font-bold uppercase">recorded {fmtRwf(recorded)}</span>}
                          </td>
                          <td className={`px-6 py-3 font-mono font-bold ${shownRemaining < 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtRwf(shownRemaining)}</td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-wider border ${backendStatusClass(row.status)}`}>
                              {backendStatusLabel(row.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {latestAnalysis?.predicted_stage && (
              <div className="px-6 py-3 border-t border-gray-100 text-[10px] text-gray-500 bg-gray-50/50">
                Status column overlaid with AI prediction: <span className="font-bold text-slate-900">{latestAnalysis.predicted_stage}</span> at {Number(latestAnalysis.predicted_progress_percentage || 0).toFixed(1)}% progress, {(Number(latestAnalysis.confidence_score || 0) * 100).toFixed(0)}% confidence. "Spent" column still reflects logged expenses only — use <strong>Add Expense</strong> to record actual costs.
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <h3 className="font-bold text-slate-900 mb-4">Spend by category</h3>
              {Object.keys(summary.by_category || {}).length === 0 ? (
                <p className="text-xs text-gray-400">No categorised expenses yet.</p>
              ) : (
                <CategoryBars data={summary.by_category} />
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <h3 className="font-bold text-slate-900 mb-4">Variance history</h3>
              {variance.length === 0 ? (
                <p className="text-xs text-gray-400">No variance reports yet.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {variance.slice(0, 6).map((v, i) => (
                    <li key={i} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-b-0">
                      <div>
                        <div className="font-bold text-slate-900">{new Date(v.generated_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">{prettyDeviation(v.deviation_status)}</div>
                      </div>
                      <div className={`font-mono font-bold ${Number(v.variance) > 0 ? "text-red-600" : "text-emerald-600"}`}>{Number(v.variance) > 0 ? "+" : "−"}{fmtRwf(Math.abs(Number(v.variance)))}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      <AddExpenseModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={projectId}
        onAdded={() => {
          toast.success("Expense logged.");
          refresh();
        }}
      />
    </div>
  );
}

function prettyDeviation(s: string | null | undefined): string {
  if (!s) return "—";
  const v = s.toLowerCase();
  if (v === "under") return "Under budget";
  if (v === "over") return "Over budget";
  if (v === "on_track" || v === "on track") return "On track";
  return s;
}

function CategoryBars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => Number(v) || 0), 1);
  return (
    <div className="space-y-3">
      {entries.map(([cat, val]) => (
        <div key={cat}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-bold text-slate-900 capitalize">{cat.replace(/_/g, " ")}</span>
            <span className="font-mono text-gray-600">{fmtRwf(Number(val))}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded overflow-hidden">
            <div className="h-full bg-orange-500" style={{ width: `${((Number(val) || 0) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AddExpenseModal({ open, onClose, projectId, onAdded }: { open: boolean; onClose: () => void; projectId: number | null; onAdded: () => void }) {
  const [category, setCategory] = useState("materials");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCategory("materials");
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().slice(0, 10));
    setError(null);
  };

  const submit = async () => {
    if (!projectId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/budget/expense`, {
        method: "POST",
        body: {
          expense_category: category,
          amount: Number(amount),
          description: description || undefined,
          expense_date: new Date(date).toISOString(),
        },
      });
      onAdded();
      reset();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Log a new expense"
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }} className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-slate-900 px-4 py-2">Cancel</button>
          <button onClick={submit} disabled={submitting || !amount} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded">
            {submitting ? "Saving..." : "Save expense"}
          </button>
        </>
      }
    >
      {error && <InlineError message={error} />}
      <Field label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-transparent outline-none w-full text-sm">
          <option value="materials">Materials</option>
          <option value="labor">Labour</option>
          <option value="equipment">Equipment</option>
          <option value="transport">Transport</option>
          <option value="permits">Permits</option>
          <option value="overhead">Overhead</option>
        </select>
      </Field>
      <Field label="Amount (RWF)">
        <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-transparent outline-none w-full text-sm" placeholder="250000" />
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent outline-none w-full text-sm" />
      </Field>
      <Field label="Description (optional)">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-transparent outline-none w-full text-sm h-20 resize-none" placeholder="What was this spent on?" />
      </Field>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">{label}</span>
      <div className="bg-gray-50 border border-gray-200 px-3 py-2.5 rounded">{children}</div>
    </label>
  );
}

function fmtRwf(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `RWF ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `RWF ${(v / 1_000).toFixed(1)}K`;
  return `RWF ${v.toFixed(0)}`;
}
