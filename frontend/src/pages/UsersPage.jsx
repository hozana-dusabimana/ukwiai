import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { usersApi } from "../api/endpoints";

const ROLES = ["admin", "project_manager", "engineer", "viewer"];

const ROLE_BADGE = {
  admin: "bg-rose-100 text-rose-700 border-rose-200",
  project_manager: "bg-ukwi-100 text-ukwi-700 border-ukwi-200",
  engineer: "bg-emerald-100 text-emerald-700 border-emerald-200",
  viewer: "bg-slate-100 text-slate-700 border-slate-200",
};


export default function UsersPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  const empty = { full_name: "", email: "", password: "", role: "engineer", phone: "" };
  const [form, setForm] = useState(empty);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["users"] });
      setForm(empty);
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }) =>
      active ? usersApi.deactivate(id) : usersApi.activate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Users</h1>
        <p className="text-sm text-slate-500">
          Admin only — invite teammates and clients, manage roles, deactivate accounts.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="card"
      >
        <h2 className="font-semibold text-slate-800 mb-3">Invite a new user</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" required placeholder="e.g. Jean-Paul Habimana" value={form.full_name} onChange={set("full_name")} />
          </div>
          <div>
            <label className="label">Work email</label>
            <input className="input" required type="email" placeholder="user@ukwi.rw" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input className="input" required type="password" minLength={8} placeholder="8+ characters" value={form.password} onChange={set("password")} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={set("role")}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <input className="input" placeholder="+250 7xx xxx xxx" value={form.phone} onChange={set("phone")} />
          </div>
          <div className="flex items-end">
            <button disabled={create.isPending} className="btn-primary w-full">
              {create.isPending ? "Creating…" : "+ Invite user"}
            </button>
          </div>
        </div>
      </form>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Team ({(list.data || []).length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="py-3 px-4 font-semibold">Name</th>
                <th className="py-3 px-4 font-semibold">Email</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Joined</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {(list.data || []).map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-800">{u.full_name}</td>
                  <td className="py-3 px-4 text-slate-600">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`badge border capitalize ${ROLE_BADGE[u.role] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                      {u.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {u.is_active ? (
                      <span className="badge bg-emerald-100 text-emerald-700 border border-emerald-200">active</span>
                    ) : (
                      <span className="badge bg-slate-200 text-slate-600">inactive</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      className={`text-xs ${u.is_active ? "text-rose-600 hover:underline" : "text-emerald-600 hover:underline"}`}
                      onClick={() => toggle.mutate({ id: u.id, active: u.is_active })}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {(!list.data || list.data.length === 0) && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
