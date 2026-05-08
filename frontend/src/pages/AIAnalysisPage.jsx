import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { aiApi, projectsApi } from "../api/endpoints";
import ImagePicker from "../components/ImagePicker";

const STAGE_LABELS = {
  stage_1: "Site Clearing",
  stage_2: "Sub-base",
  stage_3: "Concrete Slab",
  stage_4: "Surface Finish",
  stage_5: "Line Marking",
  stage_6: "Hoops & Backboards",
  stage_7: "Fencing & Final",
};

const CONFIDENCE_STYLES = {
  high: "bg-emerald-100 text-emerald-700 border-emerald-200",
  moderate: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-orange-100 text-orange-700 border-orange-200",
  very_low: "bg-rose-100 text-rose-700 border-rose-200",
};

const DEVIATION_STYLES = {
  on_track: { chip: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "On track" },
  over: { chip: "bg-rose-100 text-rose-700 border-rose-200", label: "Over budget" },
  under: { chip: "bg-sky-100 text-sky-700 border-sky-200", label: "Under budget" },
};

const fmtMoney = (value) => {
  const n = Number(value || 0);
  // Localised RWF (or whatever currency the project uses) — using the user's
  // browser locale gives commas/spaces that match what they expect in reports.
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};


function CostBudgetCard({ estimation, totalBudget }) {
  const budget = Number(totalBudget || 0);
  const estimatedUsed = Number(estimation.estimated_cost_used || 0);
  const actualRecorded = Number(estimation.actual_cost_recorded || 0);
  const remaining = Number(estimation.predicted_remaining_budget || 0);
  const variance = Number(estimation.variance || 0);
  const projectedTotal = Number(estimation.projected_total_cost || 0);
  const status = estimation.deviation_status || "on_track";
  const dev = DEVIATION_STYLES[status] || DEVIATION_STYLES.on_track;

  // Remaining as a fraction of the original budget — used for the bar.
  const remainingPct = budget > 0 ? Math.max(0, Math.min(100, (remaining / budget) * 100)) : 0;
  const usedPct = budget > 0 ? Math.max(0, Math.min(100, (actualRecorded / budget) * 100)) : 0;
  const variancePct = budget > 0 ? (variance / budget) * 100 : 0;

  if (budget <= 0) {
    return (
      <div className="card border-l-4 border-l-slate-300">
        <div className="text-xs uppercase tracking-wide text-slate-500">Cost vs. budget</div>
        <p className="text-sm text-slate-600 mt-2">
          This project has no total budget set, so the cost forecast is unavailable.
          Set <span className="font-medium">total_budget</span> on the project to enable it.
        </p>
      </div>
    );
  }

  return (
    <div className="card border-l-4 border-l-ukwi-500">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500">Cost vs. budget</div>
        <span className={`badge border ${dev.chip}`}>{dev.label}</span>
      </div>

      {/* Stacked progress bar: used (blue) | remaining (light) */}
      <div className="mt-3 h-3 rounded-full bg-slate-200 overflow-hidden flex">
        <div
          className="h-full bg-gradient-to-r from-ukwi-500 to-ukwi-300 transition-all"
          style={{ width: `${usedPct}%` }}
          title={`Spent ${usedPct.toFixed(1)}% of budget`}
        />
      </div>
      <div className="mt-1 text-[10px] text-slate-500 flex justify-between">
        <span>Spent {usedPct.toFixed(1)}%</span>
        <span>Remaining {remainingPct.toFixed(1)}%</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total budget</div>
          <div className="font-semibold text-slate-800">{fmtMoney(budget)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Expected cost spent
            <span
              className="ml-1 text-slate-400"
              title="Total budget × AI-predicted progress %"
            >
              ⓘ
            </span>
          </div>
          <div className="font-semibold text-slate-800">{fmtMoney(estimatedUsed)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Actual cost recorded</div>
          <div className="font-semibold text-slate-800">{fmtMoney(actualRecorded)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Predicted remaining</div>
          <div className="font-semibold text-slate-800">{fmtMoney(remaining)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Variance
            <span
              className="ml-1 text-slate-400"
              title="Actual − Expected. Positive = ahead in spending; negative = behind."
            >
              ⓘ
            </span>
          </div>
          <div
            className={`font-semibold ${
              status === "over" ? "text-rose-700" : status === "under" ? "text-sky-700" : "text-emerald-700"
            }`}
          >
            {variance >= 0 ? "+" : ""}
            {fmtMoney(variance)}
            <span className="text-xs text-slate-500 ml-1">
              ({variancePct >= 0 ? "+" : ""}
              {variancePct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Projected final cost
            <span
              className="ml-1 text-slate-400"
              title="If spending continues at the current rate, the project will land here at 100% completion."
            >
              ⓘ
            </span>
          </div>
          <div className="font-semibold text-slate-800">{fmtMoney(projectedTotal)}</div>
        </div>
      </div>
    </div>
  );
}


function AnalysisResult({ result, onAnalyseAnother }) {
  const a = result?.analysis;
  if (!a) return null;
  const progress = Number(a.predicted_progress_percentage || 0);
  const confidence = Number(a.confidence_score || 0);
  const probs = useMemo(() => {
    const raw = a.raw_predictions || {};
    return Object.entries(raw)
      .filter(([k]) => k.startsWith("stage_"))
      .sort((x, y) => Number(y[1]) - Number(x[1]))
      .map(([k, v]) => ({
        key: k,
        label: STAGE_LABELS[k] || k,
        value: Number(v),
        pct: Math.round(Number(v) * 100),
      }));
  }, [a]);
  const features = a.raw_predictions?.features;
  const confLabel = result.confidence_label || "moderate";
  const confChip = CONFIDENCE_STYLES[confLabel] || CONFIDENCE_STYLES.moderate;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Predicted construction stage</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{a.predicted_stage}</div>
            {result.next_stage && (
              <div className="text-xs text-slate-500 mt-1">
                Next planned stage: <span className="font-medium">{result.next_stage}</span>
              </div>
            )}
          </div>
          <span className={`badge border ${confChip}`}>
            confidence: {confLabel.replace("_", " ")} ({Math.round(confidence * 100)}%)
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Estimated progress</span>
            <span className="text-3xl font-bold text-ukwi-700">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-ukwi-500 to-ukwi-300 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      </div>

      {result.cost_estimation && (
        <CostBudgetCard
          estimation={result.cost_estimation}
          totalBudget={result.project_total_budget}
        />
      )}

      {result.summary && (
        <div className="card border-l-4 border-l-ukwi-500">
          <div className="text-xs uppercase tracking-wide text-slate-500">AI summary</div>
          <p className="text-sm text-slate-700 mt-1">{result.summary}</p>
        </div>
      )}

      {result.advice && (
        <div className="card border-l-4 border-l-amber-400 bg-amber-50/40">
          <div className="text-xs uppercase tracking-wide text-amber-700 flex items-center gap-1">
            💡 Recommended next step
          </div>
          <p className="text-sm text-slate-800 mt-1">{result.advice}</p>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-3">Per-stage probabilities</h3>
        <ul className="space-y-2">
          {probs.map((p, i) => (
            <li key={p.key} className="text-sm">
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>{p.label}</span>
                <span className={i === 0 ? "font-semibold text-ukwi-700" : ""}>{p.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full ${i === 0 ? "bg-ukwi-500" : "bg-slate-300"}`}
                  style={{ width: `${p.pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {features && (
        <details className="card">
          <summary className="cursor-pointer font-semibold text-slate-700 text-sm">
            Image features used by the model
          </summary>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(features).map(([k, v]) => (
              <div key={k} className="rounded bg-slate-50 p-2">
                <div className="text-slate-500 uppercase text-[10px] tracking-wide">{k.replace("_", " ")}</div>
                <div className="font-mono text-slate-800">{Number(v).toFixed(3)}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
        <span>Model {a.model_version}</span>
        <span>· {a.processing_time_ms} ms</span>
        <span>· {new Date(a.analysis_date).toLocaleString()}</span>
        <button
          type="button"
          onClick={onAnalyseAnother}
          className="ml-auto text-ukwi-600 hover:underline"
        >
          Analyse another image →
        </button>
      </div>
    </div>
  );
}


export default function AIAnalysisPage() {
  const qc = useQueryClient();
  const projects = useQuery({
    queryKey: ["projects-min"],
    queryFn: () => projectsApi.list().then((r) => r.data),
  });
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  const analyze = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("file", file);
      if (projectId) fd.append("project_id", projectId);
      return aiApi.analyzeImage(fd);
    },
    onSuccess: (r) => {
      setResult(r.data);
      if (projectId) {
        qc.invalidateQueries({ queryKey: ["ai-hist", String(projectId)] });
        qc.invalidateQueries({ queryKey: ["ai-hist", Number(projectId)] });
        qc.invalidateQueries({ queryKey: ["project", Number(projectId), "summary"] });
      }
      toast.success("Analysis complete");
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Analysis failed"),
  });

  const reset = () => {
    setResult(null);
    setFile(null);
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">AI Progress Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">
          Capture or upload a site photo. The CNN classifies the construction stage, estimates
          progress, and gives you the next-step recommendation.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">1. Site image</h2>
              {file && (
                <span className="text-xs text-slate-500">
                  Ready · {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </span>
              )}
            </div>
            <div className="mt-3">
              <ImagePicker value={file} onChange={setFile} disabled={analyze.isPending} />
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold text-slate-800">2. Target project</h2>
            <p className="text-xs text-slate-500 mt-1">
              Linking to a project saves the analysis to its history and updates cost forecasts.
            </p>
            <select
              className="input mt-3"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={analyze.isPending}
            >
              <option value="">— Stateless run (no save) —</option>
              {(projects.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code} · {p.project_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => analyze.mutate()}
              disabled={!file || !projectId || analyze.isPending}
              className="btn-primary flex-1 sm:flex-none"
              title={!projectId ? "Pick a project first" : ""}
            >
              {analyze.isPending ? "🤖 Analysing…" : "🤖 Run AI analysis"}
            </button>
            {result && (
              <button type="button" onClick={reset} className="btn-secondary flex-1 sm:flex-none">
                Start over
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {result ? (
            <AnalysisResult result={result} onAnalyseAnother={reset} />
          ) : (
            <div className="card border-dashed text-center text-slate-500 text-sm py-12">
              <div className="text-4xl mb-2">🤖</div>
              <div className="font-medium text-slate-700">No analysis yet</div>
              <div className="mt-1">Upload or take a photo, choose a project, and run the AI to see results here.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
