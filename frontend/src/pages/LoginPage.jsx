import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ukwi-700 via-ukwi-500 to-ukwi-100 px-4">
      <div className="w-full max-w-md card">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-ukwi-700">UKWI Monitor</div>
          <div className="text-sm text-slate-500">AI-Based Construction Progress & Budget</div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="input" autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="login-password">Password</label>
            <input
              id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="input" autoComplete="current-password"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <Link to="/forgot-password" className="text-ukwi-500 hover:underline">Forgot password?</Link>
          <Link to="/register" className="text-ukwi-500 hover:underline">Register</Link>
        </div>
      </div>
    </div>
  );
}
