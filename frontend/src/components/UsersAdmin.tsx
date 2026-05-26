import React, { useEffect, useState } from "react";
import { Users, Search, ArrowRight, UserPlus, Power, Trash2, Shield } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../lib/roles";
import { useToast } from "../ui/Toast";
import { PageLoader, InlineError, EmptyState, Modal } from "../ui/primitives";

interface UserRow {
  id: number;
  full_name: string;
  email: string;
  role: string;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
}

const ROLES = ["admin", "project_manager", "engineer", "viewer"];

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set("search", q);
      if (roleFilter) qs.set("role", roleFilter);
      qs.set("limit", "200");
      const list = await api<UserRow[]>(`/api/users?${qs.toString()}`);
      setUsers(list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, roleFilter]);

  const changeRole = async (u: UserRow, role: string) => {
    if (u.role === role) return;
    try {
      const updated = await api<UserRow>(`/api/users/${u.id}`, { method: "PUT", body: { role } });
      setUsers((all) => all.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`${u.full_name} is now ${roleLabel(role)}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleActive = async (u: UserRow) => {
    const verb = u.is_active ? "deactivate" : "activate";
    try {
      const updated = await api<UserRow>(`/api/users/${u.id}/${verb}`, { method: "PATCH" });
      setUsers((all) => all.map((x) => (x.id === u.id ? updated : x)));
      toast.info(`${u.full_name} ${u.is_active ? "deactivated" : "activated"}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const remove = async (u: UserRow) => {
    if (u.id === me?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }
    if (!confirm(`Delete ${u.full_name}? This cannot be undone.`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      setUsers((all) => all.filter((x) => x.id !== u.id));
      toast.success(`${u.full_name} removed`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
            <span>Administration</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-orange-600">Users</span>
          </nav>
          <h1 className="font-sans text-2xl font-bold text-gray-950">User management</h1>
          <p className="text-xs text-gray-500 mt-1">Promote, demote, deactivate, or delete operator accounts.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs uppercase tracking-wider py-2 px-4 rounded flex items-center gap-1.5 self-start md:self-auto"
        >
          <UserPlus className="w-4 h-4" /> New user
        </button>
      </header>

      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="flex-1 flex items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" className="bg-transparent outline-none w-full text-sm" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="bg-white border border-gray-200 px-3 py-2 rounded text-xs font-bold text-slate-900">
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
      </div>

      {error && <InlineError message={error} />}

      {loading ? <PageLoader label="Loading users" /> : users.length === 0 ? (
        <EmptyState title="No users match" body="Clear filters or invite someone with the New user button." />
      ) : (
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <header className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-orange-600" /> {users.length} user{users.length === 1 ? "" : "s"}</h3>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead>
                <tr className="bg-slate-900 text-[#A3B8CC]">
                  {["User", "Role", "Status", "Joined", "Actions"].map((h, i) => (
                    <th key={h} className={`px-6 py-3 font-bold text-[10px] uppercase tracking-wider ${i === 4 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 text-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className={`hover:bg-gray-50/50 ${u.is_active ? "" : "opacity-60"}`}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                          {(u.full_name?.[0] || "?").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">
                            {u.full_name}
                            {u.id === me?.id && <span className="ml-2 text-[9px] uppercase tracking-wider font-bold text-orange-600">You</span>}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                        disabled={u.id === me?.id}
                        className={`bg-white border px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${roleSelectClass(u.role)}`}
                        title={u.id === me?.id ? "You cannot change your own role" : ""}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                      </select>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-wider border ${
                        u.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}>{u.is_active ? "Active" : "Suspended"}</span>
                    </td>
                    <td className="px-6 py-3 font-mono text-[11px] text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={u.id === me?.id}
                          className="text-[10px] uppercase tracking-wider font-bold text-slate-700 hover:text-slate-900 disabled:opacity-40 inline-flex items-center gap-1"
                          title={u.is_active ? "Deactivate" : "Activate"}
                        >
                          <Power className="w-3.5 h-3.5" /> {u.is_active ? "Suspend" : "Activate"}
                        </button>
                        <button
                          onClick={() => remove(u)}
                          disabled={u.id === me?.id}
                          className="text-[10px] uppercase tracking-wider font-bold text-red-600 hover:text-red-700 disabled:opacity-40 inline-flex items-center gap-1"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={() => { toast.success("User created"); load(); }} />}
    </div>
  );
}

function roleSelectClass(role: string): string {
  switch (role) {
    case "admin": return "border-red-200 text-red-700 bg-red-50";
    case "project_manager": return "border-orange-200 text-orange-700 bg-orange-50";
    case "engineer": return "border-sky-200 text-sky-700 bg-sky-50";
    default: return "border-gray-200 text-gray-700 bg-gray-50";
  }
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "engineer", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api("/api/users", {
        method: "POST",
        body: {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          phone: form.phone.trim() || undefined,
        },
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create a new user"
      footer={
        <>
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 px-4 py-2">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || !form.full_name || !form.email || !form.password}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded inline-flex items-center gap-1.5"
          >
            <Shield className="w-3.5 h-3.5" /> {submitting ? "Creating…" : "Create user"}
          </button>
        </>
      }
    >
      {error && <InlineError message={error} />}
      <Field label="Full name">
        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="bg-transparent outline-none w-full text-sm" placeholder="Jane Doe" />
      </Field>
      <Field label="Email">
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="bg-transparent outline-none w-full text-sm" placeholder="jane@ukwi.rw" />
      </Field>
      <Field label="Temporary password">
        <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="bg-transparent outline-none w-full text-sm font-mono" placeholder="Min 8 characters" />
      </Field>
      <Field label="Role">
        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="bg-transparent outline-none w-full text-sm">
          {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
      </Field>
      <Field label="Phone (optional)">
        <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="bg-transparent outline-none w-full text-sm" placeholder="+250 78..." />
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
