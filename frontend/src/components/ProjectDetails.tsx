import React, { useEffect, useRef, useState } from "react";
import { Brain, CheckCircle2, AlertTriangle, ArrowRight, Award, Upload, MapPin, Sparkles, Building, ImageIcon, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { capabilitiesFor } from "../lib/roles";
import { useToast } from "../ui/Toast";
import { PageLoader, InlineError, EmptyState, Modal } from "../ui/primitives";
import TeamPanel from "./TeamPanel";

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

interface Project {
  id: number;
  project_name: string;
  project_code: string;
  location?: string;
  client_name?: string;
  total_budget: number | string;
  status: string;
  start_date?: string;
  expected_end_date?: string;
  court_type?: string;
  created_by?: number;
}
interface TimelineRow {
  stage_order: number;
  stage_name: string;
  expected_progress: number;
  expected_cost_percent: number;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  allocated_budget: number;
  actual_cost: number;
  ai_inferred_cost?: number;
  ai_predicted_cost?: number;
  effective_spent?: number;
  status: string;
}
interface Summary {
  project: Project;
  total_expenses: number | string;
  total_ai_predicted_cost?: number | string;
  effective_total_spent?: number | string;
  latest_progress: number | null;
  latest_confidence: number | null;
  deviation_status: string | null;
  images_count: number;
  alerts_count: number;
  open_alerts_count: number;
}
interface AnalysisRow {
  id: number;
  image_id: number;
  predicted_stage?: string;
  predicted_progress_percentage: number;
  confidence_score: number;
  model_version?: string;
  analysis_date: string;
}
interface SiteImage {
  id: number;
  image_url?: string;
  image_path: string;
  original_filename?: string;
  captured_date?: string;
  created_at: string;
}

interface ProjectDetailsProps {
  projectId: number | null;
  onDeleted?: () => void;
}

export default function ProjectDetails({ projectId, onDeleted }: ProjectDetailsProps) {
  const toast = useToast();
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [history, setHistory] = useState<AnalysisRow[]>([]);
  const [images, setImages] = useState<SiteImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (projectId == null) return;
    setDeleting(true);
    try {
      await api(`/api/projects/${projectId}`, { method: "DELETE" });
      toast.success("Project deleted");
      setConfirmDelete(false);
      onDeleted?.();
    } catch (e: any) {
      toast.error(e.message || "Could not delete project");
    } finally {
      setDeleting(false);
    }
  };

  const load = async () => {
    if (projectId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [s, t, h, imgs] = await Promise.all([
        api<Summary>(`/api/projects/${projectId}/summary`),
        api<TimelineRow[]>(`/api/projects/${projectId}/timeline`),
        api<AnalysisRow[]>(`/api/ai/projects/${projectId}/analysis-history?limit=10`).catch(() => []),
        api<SiteImage[]>(`/api/projects/${projectId}/images?limit=12`).catch(() => []),
      ]);
      setSummary(s);
      setTimeline(t);
      setHistory(h);
      setImages(imgs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  if (projectId == null) {
    return <EmptyState title="No project selected" body="Pick a project from the Projects tab to inspect its details." />;
  }
  if (loading) return <PageLoader label="Loading project details" />;
  if (error) return <InlineError message={error} />;
  if (!summary) return <EmptyState title="Project not found" body="Could not load that project." />;

  const p = summary.project;
  const progress = Math.round(summary.latest_progress ?? 0);
  const confidence = Number(((summary.latest_confidence ?? 0) * 100).toFixed(1));
  const featuredImage = images[0];
  // Headline spend = the effective figure (recorded expenses, or the AI's
  // market-priced prediction when nothing is logged). Because the prediction is
  // grounded in materials + terrain + market, it can exceed the planned budget.
  const totalSpent = Number(summary.effective_total_spent ?? summary.total_expenses) || 0;
  const totalBudget = Number(p.total_budget) || 0;
  const overBudget = totalSpent > totalBudget;
  const terrainLabel = (p as any).terrain_assessment?.difficulty_label as string | undefined;
  const terrainMult = Number((p as any).terrain_difficulty ?? 1);

  const confCircumference = 2 * Math.PI * 64;
  const confOffset = confCircumference - (confidence / 100) * confCircumference;

  // Who can delete: the project owner may remove it only while it hasn't been
  // analysed yet (no AI runs on record); admins can always remove it.
  const isAdmin = user?.role === "admin";
  const isOwner = user?.id != null && user.id === p.created_by;
  const hasBeenAnalysed = history.length > 0 || summary.latest_progress != null;
  const canDelete = isAdmin || (isOwner && !hasBeenAnalysed);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Projects</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-slate-900 font-bold truncate max-w-[260px]" title={p.project_name}>{p.project_name}</span>
          </nav>
          <h1 className="font-sans text-2xl font-bold text-gray-950">{p.project_name}</h1>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
            <span className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5" /> {p.project_code}</span>
            {p.location && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {p.location}</span>}
            {terrainLabel && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                  terrainMult >= 1.45 ? "bg-red-50 text-red-700 border-red-200" :
                  terrainMult >= 1.2 ? "bg-amber-50 text-amber-700 border-amber-200" :
                  terrainMult < 1.0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  "bg-gray-50 text-gray-700 border-gray-200"
                }`}
                title={`Terrain difficulty multiplier applied to terrain-sensitive stage costs`}
              >
                Terrain: {terrainLabel} ×{terrainMult.toFixed(2)}
              </span>
            )}
            <span className={`inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
              p.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              p.status === "completed" ? "bg-sky-50 text-sky-700 border-sky-200" :
              "bg-gray-50 text-gray-700 border-gray-200"
            }`}>{p.status.replace(/_/g, " ")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="border border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs uppercase tracking-wider py-2 px-4 rounded flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Delete project
            </button>
          )}
          {caps.canUploadImage && (
            <button onClick={() => setUploadOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs uppercase tracking-wider py-2 px-4 rounded flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Upload site image
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden relative shadow-sm">
            <div className="aspect-video w-full bg-gray-50 relative">
              {featuredImage ? (
                <img referrerPolicy="no-referrer" src={featuredImage.image_url || featuredImage.image_path} alt={featuredImage.original_filename || "Site image"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                  <ImageIcon className="w-12 h-12 mb-2" />
                  <span className="text-xs uppercase tracking-wider font-bold">No site images yet</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent flex justify-between items-end">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1.5 bg-orange-600 text-white px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider shadow">
                    <Brain className="w-4 h-4" />
                    <span>AI Stage Prediction</span>
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    {history[0]?.predicted_stage || "Awaiting first analysis"}
                  </h3>
                  {history[0] && (
                    <p className="text-[11px] text-white/70 font-mono">
                      {Number(history[0].predicted_progress_percentage || 0).toFixed(1)}% progress · {(Number(history[0].confidence_score || 0) * 100).toFixed(0)}% confidence
                    </p>
                  )}
                </div>
                {featuredImage && (
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded text-white text-right font-mono text-xs hidden sm:block">
                    <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest leading-none mb-1">Captured</p>
                    <div>{new Date(featuredImage.captured_date || featuredImage.created_at).toLocaleString()}</div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-900 text-md">Structural timeline</h3>
              <span className={`text-[10px] font-bold tracking-wider uppercase ${overBudget ? "text-red-600" : "text-emerald-600"}`}>
                {overBudget ? "Over budget" : summary.deviation_status === "under" ? "Under budget" : (summary.deviation_status || "On track")}
              </span>
            </div>
            {timeline.length === 0 ? (
              <p className="text-xs text-gray-400">Timeline not configured yet — seeded stages will appear here as work progresses.</p>
            ) : (
              <ol className="space-y-3">
                {timeline.map((stage) => {
                  const alloc = Number(stage.allocated_budget) || 0;
                  const recorded = Number(stage.actual_cost) || 0;
                  // Market-priced AI prediction (can exceed the allocation).
                  const aiCost = Number(stage.ai_predicted_cost ?? stage.ai_inferred_cost) || 0;
                  const effective = Number(stage.effective_spent ?? Math.max(recorded, aiCost));
                  const aiDriving = aiCost > 0 && aiCost > recorded;
                  const stageOver = effective > alloc && alloc > 0;
                  const fill = alloc > 0 ? Math.min(100, (effective / alloc) * 100) : 0;
                  const status = stage.status; // backend status: completed | in_progress | not_started | delayed
                  return (
                    <li key={stage.stage_order} className="border border-gray-100 rounded p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-400 font-bold">#{stage.stage_order}</span>
                          <span className="font-bold text-sm text-slate-900">{stage.stage_name}</span>
                          {aiDriving && (
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded" title="Spent value inferred from latest AI scan">AI</span>
                          )}
                        </div>
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${backendStatusClass(status)}`}>{backendStatusLabel(status)}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] text-gray-500 uppercase font-bold mb-2">
                        <span>Expected progress: <span className="text-slate-900 font-mono normal-case">{Number(stage.expected_progress || 0).toFixed(1)}%</span></span>
                        <span>Allocated: <span className="text-slate-900 font-mono normal-case">{fmtRwf(alloc)}</span></span>
                        <span>
                          {aiDriving && recorded === 0 ? "Predicted: " : "Spent: "}
                          <span className={`font-mono normal-case ${stageOver ? "text-red-600 font-bold" : "text-slate-900"}`}>{fmtRwf(effective)}</span>
                          {aiDriving && recorded === 0 && <span className="ml-1 text-orange-600 normal-case">(AI)</span>}
                          {stageOver && <span className="ml-1 text-red-600 normal-case">· +{fmtRwf(effective - alloc)} over plan</span>}
                          {recorded > 0 && aiCost > 0 && recorded < aiCost && <span className="ml-1 text-gray-400 normal-case">(recorded {fmtRwf(recorded)})</span>}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                        <div className={`h-full transition-all ${stageOver ? "bg-red-500" : status === "completed" ? "bg-emerald-500" : status === "in_progress" ? "bg-orange-500" : status === "delayed" ? "bg-red-500" : "bg-gray-300"}`} style={{ width: `${fill}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <header className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-md flex items-center gap-2"><Sparkles className="w-4 h-4 text-orange-600" /> AI analysis history</h3>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{history.length} runs</span>
            </header>
            {history.length === 0 ? (
              <EmptyState title="No analyses yet" body="Run AI Analysis on a site photo to populate this history." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-900 text-[#A3B8CC]">
                      {["When", "Stage", "Progress", "Confidence", "Model"].map((h) => (
                        <th key={h} className="px-6 py-3 font-bold text-[10px] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150 text-slate-700">
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className="px-6 py-3 font-mono text-gray-500">{new Date(row.analysis_date).toLocaleString()}</td>
                        <td className="px-6 py-3 font-bold text-slate-900">{row.predicted_stage || "—"}</td>
                        <td className="px-6 py-3 font-mono">{Number(row.predicted_progress_percentage || 0).toFixed(1)}%</td>
                        <td className="px-6 py-3 font-mono">{(Number(row.confidence_score || 0) * 100).toFixed(1)}%</td>
                        <td className="px-6 py-3 text-[10px] font-mono text-gray-400 uppercase">{row.model_version || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-8">
          <section className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col items-center text-center shadow-sm">
            <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6">Analysis confidence</h4>
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle className="text-gray-100" cx="80" cy="80" fill="transparent" r="64" stroke="currentColor" strokeWidth="12" />
                <circle className="text-slate-900 transition-all duration-1000" cx="80" cy="80" fill="transparent" r="64" stroke="currentColor" strokeWidth="12" strokeDasharray={`${confCircumference}`} strokeDashoffset={confOffset} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900">{confidence}%</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Match</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Latest progress: {progress}%</span>
            </div>
          </section>

          <section className="bg-slate-900 text-white p-6 rounded-lg space-y-4 shadow border-l-4 border-orange-600">
            <div className="flex items-center gap-2 opacity-85">
              <Brain className="w-5 h-5 text-orange-400" />
              <h4 className="font-bold text-xs uppercase tracking-widest text-orange-400">AI advisory</h4>
            </div>
            <p className="text-sm leading-relaxed text-gray-200 italic">
              {history[0]?.predicted_stage
                ? `Latest detection: ${history[0].predicted_stage}. Confidence ${(Number(history[0].confidence_score || 0) * 100).toFixed(0)}%.`
                : "No AI analysis on record. Upload a site image and run AI Analysis."}
            </p>
          </section>

          <section className={`bg-white border rounded-lg p-6 border-l-4 space-y-2 shadow-sm ${overBudget ? "border-red-200 border-l-red-600" : "border-emerald-200 border-l-emerald-600"}`}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className={`text-[10px] font-bold uppercase tracking-widest leading-none ${overBudget ? "text-red-600" : "text-emerald-600"}`}>
                  {overBudget ? "Over budget by" : "Under budget by"}
                </h4>
                <p className="font-mono text-lg font-bold text-slate-950 mt-2">{fmtRwf(Math.abs(totalSpent - totalBudget))}</p>
              </div>
              {overBudget ? <AlertTriangle className="text-red-600 w-5 h-5" /> : <Award className="text-emerald-600 w-5 h-5" />}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Spent {fmtRwf(totalSpent)} of {fmtRwf(totalBudget)} ({totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : "0"}% consumed).
            </p>
          </section>

          <TeamPanel projectId={projectId} ownerId={p.created_by} />
        </div>
      </div>

      <UploadImageModal open={uploadOpen} onClose={() => setUploadOpen(false)} projectId={projectId} onUploaded={() => { toast.success("Image uploaded"); load(); }} />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete project"
        footer={
          <>
            <button onClick={() => setConfirmDelete(false)} className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-slate-900 px-4 py-2">Cancel</button>
            <button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> {deleting ? "Deleting..." : "Delete permanently"}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-700 leading-relaxed">
          This permanently removes <span className="font-bold">{p.project_name}</span> ({p.project_code}) and its stages, team and uploads. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

function fmtRwf(n: number | string): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}RWF ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}RWF ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}RWF ${abs.toFixed(0)}`;
}

function UploadImageModal({ open, onClose, projectId, onUploaded }: { open: boolean; onClose: () => void; projectId: number; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const onPick = (f: File | null) => {
    if (!f) { setPreview(null); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setError("Pick an image file first."); return; }
    setSubmitting(true); setError(null);
    try {
      const form = new FormData();
      form.set("file", f);
      if (notes) form.set("notes", notes);
      if (weather) form.set("weather_conditions", weather);
      form.set("captured_date", new Date().toISOString());
      await api(`/api/projects/${projectId}/images/upload`, { method: "POST", body: form });
      onUploaded();
      setNotes(""); setWeather(""); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
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
      onClose={onClose}
      title="Upload site image"
      footer={
        <>
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-slate-900 px-4 py-2">Cancel</button>
          <button onClick={submit} disabled={submitting} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded">
            {submitting ? "Uploading..." : "Upload"}
          </button>
        </>
      }
    >
      {error && <InlineError message={error} />}
      <div>
        <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Photo</span>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onPick(e.target.files?.[0] || null)} className="block w-full text-xs" />
        {preview && <img src={preview} alt="preview" className="mt-3 w-full max-h-56 object-cover rounded border border-gray-200" />}
      </div>
      <label className="block">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Weather</span>
        <input value={weather} onChange={(e) => setWeather(e.target.value)} className="w-full bg-gray-50 border border-gray-200 px-3 py-2.5 rounded text-sm outline-none" placeholder="Clear, 24°C" />
      </label>
      <label className="block">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-gray-50 border border-gray-200 px-3 py-2.5 rounded text-sm outline-none h-20 resize-none" placeholder="Visible defects, crew on site..." />
      </label>
    </Modal>
  );
}
