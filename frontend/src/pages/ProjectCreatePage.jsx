import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { projectsApi } from "../api/endpoints";

export default function ProjectCreatePage() {
  const [form, setForm] = useState({
    project_name: "", project_code: "", location: "", client_name: "",
    court_type: "outdoor", court_dimensions: "28m x 15m",
    start_date: "", expected_end_date: "",
    total_budget: 0, description: "",
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
    <div>
      <h1 className="text-2xl font-bold mb-4">New project</h1>
      <form onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <div><label className="label">Project name</label><input className="input" required value={form.project_name} onChange={set("project_name")} /></div>
        <div><label className="label">Project code</label><input className="input" required value={form.project_code} onChange={set("project_code")} /></div>
        <div><label className="label">Location</label><input className="input" value={form.location} onChange={set("location")} /></div>
        <div><label className="label">Client</label><input className="input" value={form.client_name} onChange={set("client_name")} /></div>
        <div><label className="label">Court type</label>
          <select className="input" value={form.court_type} onChange={set("court_type")}>
            <option value="outdoor">Outdoor</option>
            <option value="indoor">Indoor</option>
          </select>
        </div>
        <div><label className="label">Dimensions</label><input className="input" value={form.court_dimensions} onChange={set("court_dimensions")} /></div>
        <div><label className="label">Start date</label><input type="date" className="input" value={form.start_date} onChange={set("start_date")} /></div>
        <div><label className="label">Expected end</label><input type="date" className="input" value={form.expected_end_date} onChange={set("expected_end_date")} /></div>
        <div><label className="label">Total budget (RWF)</label><input type="number" min="0" className="input" value={form.total_budget} onChange={set("total_budget")} /></div>
        <div className="md:col-span-2"><label className="label">Description</label><textarea className="input" rows="3" value={form.description} onChange={set("description")} /></div>
        <div className="md:col-span-2 flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={() => navigate("/projects")}>Cancel</button>
          <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
