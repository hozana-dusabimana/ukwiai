import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { usersApi } from "../api/endpoints";

const ROLES = ["admin", "project_manager", "engineer", "viewer"];

export default function UsersPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list().then(r => r.data) });

  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "viewer", phone: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => { toast.success("User created"); qc.invalidateQueries({ queryKey: ["users"] }); setForm({ full_name: "", email: "", password: "", role: "viewer", phone: "" }); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }) => active ? usersApi.deactivate(id) : usersApi.activate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>

      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="card grid grid-cols-1 md:grid-cols-5 gap-2">
        <input className="input" required placeholder="Full name" value={form.full_name} onChange={set("full_name")} />
        <input className="input" required type="email" placeholder="Email" value={form.email} onChange={set("email")} />
        <input className="input" required type="password" placeholder="Password" value={form.password} onChange={set("password")} />
        <select className="input" value={form.role} onChange={set("role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        <button disabled={create.isPending} className="btn-primary">{create.isPending ? "Saving…" : "Create"}</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data || []).map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2 pr-4">{u.full_name}</td>
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{u.role}</td>
                <td className="py-2 pr-4">{u.is_active ? "Yes" : "No"}</td>
                <td className="py-2 pr-4">
                  <button className="btn-secondary text-xs" onClick={() => toggle.mutate({ id: u.id, active: u.is_active })}>
                    {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
