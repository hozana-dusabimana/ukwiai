import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { projectsApi } from "../api/endpoints";


export default function ProjectCreatePage() {
  const [form, setForm] = useState({
    project_name: "",
    project_code: "",
    location: "",
    client_name: "",
    court_type: "outdoor",
    court_dimensions: "28m x 15m",
    start_date: "",
    expected_end_date: "",
    total_budget: 0,
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        total_budget: Number(form.total_budget),
        start_date: form.start_date || null,
        expected_end_date: form.expected_end_date || null,
      };
      const r = await projectsApi.create(payload);
      toast.success("Project created");
      navigate(`/projects/${r.data.id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not create");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link to="/projects" className="text-xs text-slate-500 hover:text-ukwi-600">
          ← Back to projects
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1">New project</h1>
        <p className="text-sm text-slate-500">
          Set up a new basketball-court project. You can add stages, photos, and expenses later.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-800">Identification</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Project name *</label>
              <input
                className="input"
                required
                placeholder="e.g. Kigali Court A"
                value={form.project_name}
                onChange={set("project_name")}
              />
            </div>
            <div>
              <label className="label">Project code *</label>
              <input
                className="input font-mono"
                required
                placeholder="e.g. KGL-A-001"
                value={form.project_code}
                onChange={set("project_code")}
              />
              <p className="text-xs text-slate-400 mt-1">
                A short code used in reports and file names. Must be unique.
              </p>
            </div>
            <div>
              <label className="label">Location</label>
              <input
                className="input"
                placeholder="e.g. Musanze, Northern Province"
                value={form.location}
                onChange={set("location")}
              />
            </div>
            <div>
              <label className="label">Client</label>
              <input
                className="input"
                placeholder="e.g. City of Kigali"
                value={form.client_name}
                onChange={set("client_name")}
              />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-800">Court specification</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Court type</label>
              <select className="input" value={form.court_type} onChange={set("court_type")}>
                <option value="outdoor">Outdoor</option>
                <option value="indoor">Indoor</option>
              </select>
            </div>
            <div>
              <label className="label">Dimensions</label>
              <input
                className="input"
                placeholder="e.g. 28m x 15m"
                value={form.court_dimensions}
                onChange={set("court_dimensions")}
              />
              <p className="text-xs text-slate-400 mt-1">FIBA full-size is 28m × 15m.</p>
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-800">Schedule &amp; budget</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Start date</label>
              <input type="date" className="input" value={form.start_date} onChange={set("start_date")} />
            </div>
            <div>
              <label className="label">Expected end</label>
              <input type="date" className="input" value={form.expected_end_date} onChange={set("expected_end_date")} />
            </div>
            <div>
              <label className="label">Total budget (RWF)</label>
              <input
                type="number"
                min="0"
                className="input"
                placeholder="50000000"
                value={form.total_budget}
                onChange={set("total_budget")}
              />
            </div>
          </div>
        </div>

        <div className="card space-y-2">
          <h2 className="font-semibold text-slate-800">Description</h2>
          <textarea
            className="input"
            rows="4"
            placeholder="Anything stakeholders should know — site conditions, special requirements, milestones."
            value={form.description}
            onChange={set("description")}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={() => navigate("/projects")}>
            Cancel
          </button>
          <button disabled={busy} className="btn-primary">
            {busy ? "Saving…" : "Create project →"}
          </button>
        </div>
      </form>
    </div>
  );
}
