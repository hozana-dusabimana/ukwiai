import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { aiApi, projectsApi } from "../api/endpoints";

export default function AIAnalysisPage() {
  const projects = useQuery({ queryKey: ["projects-min"], queryFn: () => projectsApi.list().then(r => r.data) });
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const onPick = (f) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    setResult(null);
  };

  const analyze = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("file", file);
      if (projectId) fd.append("project_id", projectId);
      return aiApi.analyzeImage(fd);
    },
    onSuccess: (r) => {
      setResult(r.data);
      toast.success("Analysis complete");
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Analysis failed"),
  });

  const a = result?.analysis;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">AI Analysis</h1>

      <div className="card grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Target project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— select project —</option>
            {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
          </select>
          <label className="label mt-3">Site image</label>
          <input type="file" accept="image/*" onChange={(e) => onPick(e.target.files[0])} />
          <button disabled={!file || !projectId || analyze.isPending} className="btn-primary mt-3" onClick={() => analyze.mutate()}>
            {analyze.isPending ? "Analyzing…" : "Run analysis"}
          </button>
        </div>
        <div className="flex items-center justify-center bg-slate-100 rounded">
          {preview ? <img src={preview} alt="" className="max-h-72 object-contain" /> : <div className="text-slate-400 text-sm py-12">No image selected</div>}
        </div>
      </div>

      {a && (
        <div className="card grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-slate-500 uppercase">Predicted stage</div>
            <div className="text-xl font-semibold">{a.predicted_stage}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Progress</div>
            <div className="text-3xl font-bold text-ukwi-700">{Number(a.predicted_progress_percentage).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Confidence</div>
            <div className="text-3xl font-bold text-emerald-600">{(Number(a.confidence_score) * 100).toFixed(1)}%</div>
          </div>
          <div className="md:col-span-3 text-sm text-slate-500">
            Model: {a.model_version} · {a.processing_time_ms} ms · {new Date(a.analysis_date).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
