import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { authApi } from "../api/endpoints";

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.register(form);
      toast.success("Account created — please sign in");
      navigate("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ukwi-700 via-ukwi-500 to-ukwi-100 px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-xl font-bold mb-4">Create account</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><label className="label">Full name</label><input className="input" required value={form.full_name} onChange={set("full_name")} /></div>
          <div><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={set("email")} /></div>
          <div><label className="label">Password (min 8)</label><input className="input" type="password" required minLength={8} value={form.password} onChange={set("password")} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set("phone")} /></div>
          <button disabled={busy} className="btn-primary w-full">{busy ? "Creating…" : "Create account"}</button>
        </form>
        <div className="mt-3 text-sm text-center">
          <Link to="/login" className="text-ukwi-500 hover:underline">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
