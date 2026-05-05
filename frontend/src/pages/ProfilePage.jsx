import { useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../api/endpoints";

export default function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: "", new_password: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await authApi.changePassword(form);
      toast.success("Password changed");
      setForm({ current_password: "", new_password: "" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="card">
        <div className="text-sm"><b>Name:</b> {user?.full_name}</div>
        <div className="text-sm"><b>Email:</b> {user?.email}</div>
        <div className="text-sm"><b>Role:</b> {user?.role}</div>
      </div>
      <form onSubmit={onSubmit} className="card space-y-3">
        <h2 className="font-semibold">Change password</h2>
        <div><label className="label">Current password</label><input className="input" type="password" required value={form.current_password} onChange={set("current_password")} /></div>
        <div><label className="label">New password</label><input className="input" type="password" required minLength={8} value={form.new_password} onChange={set("new_password")} /></div>
        <button className="btn-primary">Update password</button>
      </form>
    </div>
  );
}
