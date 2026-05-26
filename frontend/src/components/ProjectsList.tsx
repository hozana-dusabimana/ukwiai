import React, { useEffect, useState } from "react";
import { Plus, Search, ArrowRight, Building, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { capabilitiesFor } from "../lib/roles";
import { useToast } from "../ui/Toast";
import { PageLoader, InlineError, EmptyState, Modal } from "../ui/primitives";

interface Project {
  id: number;
  project_name: string;
  project_code: string;
  location?: string;
  client_name?: string;
  court_type?: string;
  status: string;
  total_budget: number | string;
  start_date?: string;
  expected_end_date?: string;
}

interface ProjectsListProps {
  onOpenProject: (id: number) => void;
}

export default function ProjectsList({ onOpenProject }: ProjectsListProps) {
  const toast = useToast();
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [openCreate, setOpenCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await api<Project[]>(`/api/projects?limit=100${statusFilter ? `&status=${statusFilter}` : ""}${q ? `&search=${encodeURIComponent(q)}` : ""}`);
      setProjects(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, statusFilter]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Operations</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-orange-600">Projects</span>
          </nav>
          <h1 className="font-sans text-2xl font-bold text-gray-950">Project Portfolio</h1>
          <p className="text-xs text-gray-500 mt-1">All UKWI basketball-court projects under monitoring.</p>
        </div>
        {caps.canCreateProject && (
          <button onClick={() => setOpenCreate(true)} className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs uppercase tracking-wider py-2 px-4 rounded flex items-center gap-1.5 self-start md:self-auto">
            <Plus className="w-4 h-4" /> New project
          </button>
        )}
      </header>

      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="flex-1 flex items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or code..." className="bg-transparent outline-none w-full text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white border border-gray-200 px-3 py-2 rounded text-xs font-bold text-slate-900">
          <option value="">All statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {error && <InlineError message={error} />}
      {loading ? <PageLoader label="Loading projects" /> : projects.length === 0 ? (
        <EmptyState
          title="No projects match"
          body="Try clearing filters or creating a new project."
          action={caps.canCreateProject ? <button onClick={() => setOpenCreate(true)} className="bg-orange-600 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded">Create project</button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <div key={p.id} onClick={() => onOpenProject(p.id)} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm cursor-pointer hover:border-orange-500 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-sky-50 text-slate-900 rounded border border-sky-100">
                  <Building className="w-5 h-5" />
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${statusClass(p.status)}`}>{p.status.replace(/_/g, " ")}</span>
              </div>
              <h3 className="font-bold text-slate-900 truncate" title={p.project_name}>{p.project_name}</h3>
              <div className="text-[10px] text-gray-400 font-mono mt-0.5">{p.project_code}</div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-3">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{p.location || "Location not set"}</span>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Budget</span>
                <span className="font-mono font-bold text-sm text-slate-900">{fmtRwf(p.total_budget)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateProjectModal open={openCreate} onClose={() => setOpenCreate(false)} onCreated={() => { toast.success("Project created"); load(); }} />
    </div>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "active": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "completed": return "bg-sky-50 text-sky-700 border-sky-200";
    case "on_hold": return "bg-amber-50 text-amber-700 border-amber-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function fmtRwf(n: number | string): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `RWF ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `RWF ${(v / 1_000).toFixed(1)}K`;
  return `RWF ${v.toFixed(0)}`;
}

function CreateProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    project_name: "",
    project_code: "",
    location: "",
    client_name: "",
    court_type: "full_court",
    total_budget: "",
    start_date: new Date().toISOString().slice(0, 10),
    expected_end_date: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setForm({
      project_name: "", project_code: "", location: "", client_name: "",
      court_type: "full_court", total_budget: "",
      start_date: new Date().toISOString().slice(0, 10),
      expected_end_date: "", description: "",
    });
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api("/api/projects", {
        method: "POST",
        body: {
          ...form,
          total_budget: form.total_budget ? Number(form.total_budget) : undefined,
          start_date: form.start_date ? new Date(form.start_date).toISOString() : undefined,
          expected_end_date: form.expected_end_date ? new Date(form.expected_end_date).toISOString() : undefined,
        },
      });
      onCreated();
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
      title="New construction project"
      footer={
        <>
          <button onClick={() => { reset(); onClose(); }} className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-slate-900 px-4 py-2">Cancel</button>
          <button onClick={submit} disabled={submitting || !form.project_name || !form.project_code} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded">
            {submitting ? "Creating..." : "Create project"}
          </button>
        </>
      }
    >
      {error && <InlineError message={error} />}
      <Field label="Project name *"><input required value={form.project_name} onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))} className="w-full bg-transparent outline-none text-sm" placeholder="Kigali Arena Court B" /></Field>
      <Field label="Project code *"><input required value={form.project_code} onChange={(e) => setForm((f) => ({ ...f, project_code: e.target.value }))} className="w-full bg-transparent outline-none text-sm" placeholder="KGL-2026-04" /></Field>
      <Field label="Location"><input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full bg-transparent outline-none text-sm" placeholder="Gasabo District" /></Field>
      <Field label="Client"><input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} className="w-full bg-transparent outline-none text-sm" placeholder="City of Kigali" /></Field>
      <Field label="Court type">
        <select value={form.court_type} onChange={(e) => setForm((f) => ({ ...f, court_type: e.target.value }))} className="w-full bg-transparent outline-none text-sm">
          <option value="full_court">Full court</option>
          <option value="half_court">Half court</option>
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
        </select>
      </Field>
      <Field label="Total budget (RWF)"><input type="number" min="0" value={form.total_budget} onChange={(e) => setForm((f) => ({ ...f, total_budget: e.target.value }))} className="w-full bg-transparent outline-none text-sm" placeholder="42500000" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date"><input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full bg-transparent outline-none text-sm" /></Field>
        <Field label="Expected end"><input type="date" value={form.expected_end_date} onChange={(e) => setForm((f) => ({ ...f, expected_end_date: e.target.value }))} className="w-full bg-transparent outline-none text-sm" /></Field>
      </div>
      <Field label="Description"><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full bg-transparent outline-none text-sm h-20 resize-none" placeholder="Court purpose, special requirements..." /></Field>
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
