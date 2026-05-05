import { useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../api/endpoints";

const ROLE_BADGE = {
  admin: "bg-rose-100 text-rose-700 border-rose-200",
  project_manager: "bg-ukwi-100 text-ukwi-700 border-ukwi-200",
  engineer: "bg-emerald-100 text-emerald-700 border-emerald-200",
  viewer: "bg-slate-100 text-slate-700 border-slate-200",
};


export default function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.changePassword(form);
      toast.success("Password updated");
      setForm({ current_password: "", new_password: "" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const initials = (user?.full_name || "U")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">My profile</h1>

      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-ukwi-500 to-ukwi-700 text-white font-bold text-xl flex items-center justify-center shadow-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-slate-800">{user?.full_name}</div>
            <div className="text-sm text-slate-500 truncate">{user?.email}</div>
            <div className="mt-1">
              <span className={`badge border capitalize ${ROLE_BADGE[user?.role] || "bg-slate-100 text-slate-700"}`}>
                {String(user?.role || "").replace("_", " ")}
              </span>
            </div>
          </div>
        </div>
        {user?.phone && (
          <div className="mt-4 text-sm text-slate-600">
            <span className="text-slate-500">Phone: </span>
            {user.phone}
          </div>
        )}
        {user?.created_at && (
          <div className="mt-1 text-xs text-slate-500">
            Member since {new Date(user.created_at).toLocaleDateString()}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="card space-y-3">
        <div>
          <h2 className="font-semibold text-slate-800">Change password</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Use a strong password — at least 8 characters, mixed case and numbers recommended.
          </p>
        </div>
        <div>
          <label className="label">Current password</label>
          <input
            className="input"
            type="password"
            required
            value={form.current_password}
            onChange={set("current_password")}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={form.new_password}
            onChange={set("new_password")}
            autoComplete="new-password"
          />
        </div>
        <button disabled={busy} className="btn-primary">
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
