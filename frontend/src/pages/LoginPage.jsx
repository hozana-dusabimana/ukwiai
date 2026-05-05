import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "../contexts/AuthContext";

const HIGHLIGHTS = [
  {
    icon: "🤖",
    title: "AI progress tracking",
    body: "Site photo in, construction stage + percentage out.",
  },
  {
    icon: "💰",
    title: "Live budget vs spend",
    body: "Variance, forecasts, and overrun alerts in real time.",
  },
  {
    icon: "🏀",
    title: "Built for basketball courts",
    body: "Trained on the seven canonical UKWI construction stages.",
  },
];


function BrandPanel() {
  return (
    <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-ukwi-700 via-ukwi-500 to-ukwi-100 text-white p-12 flex-col relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, white 1.5px, transparent 1.5px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)",
          backgroundSize: "50px 50px, 70px 70px",
        }}
      />
      <Link to="/" className="relative flex items-center gap-2 hover:opacity-90">
        <span className="text-3xl">🏗️</span>
        <span>
          <span className="block font-bold leading-tight">UKWI Monitor</span>
          <span className="block text-[11px] uppercase tracking-wide text-ukwi-100">Construction AI · Rwanda</span>
        </span>
      </Link>

      <div className="relative flex-1 flex flex-col justify-center">
        <div className="text-xs uppercase tracking-wider text-ukwi-100 font-semibold">Welcome back</div>
        <h2 className="text-3xl xl:text-4xl font-bold mt-2 leading-tight">
          The fastest way to see how every UKWI court is really going.
        </h2>
        <p className="text-ukwi-50 mt-4 max-w-md">
          Sign in to access live progress, budget burn-down, AI analyses, and stakeholder reports
          for your projects.
        </p>

        <div className="mt-8 space-y-4 max-w-md">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="flex gap-3 items-start">
              <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center text-lg">
                {h.icon}
              </div>
              <div>
                <div className="font-semibold text-white">{h.title}</div>
                <div className="text-sm text-ukwi-50">{h.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative text-xs text-ukwi-100">
        © {new Date().getFullYear()} UKWI Company Ltd · Internal use only
      </div>
    </div>
  );
}


export default function LoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (user) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <BrandPanel />

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Compact brand for mobile / when side panel is hidden */}
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <span className="text-2xl">🏗️</span>
            <span className="font-bold text-slate-800">UKWI Monitor</span>
          </Link>

          <div className="card">
            <h1 className="text-2xl font-bold text-slate-800">Sign in</h1>
            <p className="text-sm text-slate-500 mt-1">
              Use your UKWI work email to access your dashboard.
            </p>

            <form onSubmit={onSubmit} className="space-y-4 mt-6">
              <div>
                <label className="label" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="you@ukwi.rw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label !mb-0" htmlFor="login-password">Password</label>
                  <Link to="/forgot-password" className="text-xs text-ukwi-500 hover:underline">
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPwd ? "text" : "password"}
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-12"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                    tabIndex={-1}
                  >
                    {showPwd ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? "Signing in…" : "Sign in →"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="flex-1 h-px bg-slate-200" />
              <span>or</span>
              <span className="flex-1 h-px bg-slate-200" />
            </div>

            <Link to="/register" className="btn-secondary w-full">
              Create a new account
            </Link>

            <div className="mt-5 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
              <div className="font-semibold text-slate-700 mb-1">Demo admin</div>
              <div>Email: <span className="font-mono">admin@ukwi.rw</span></div>
              <div>Password: <span className="font-mono">ChangeMe!2026</span></div>
              <div className="mt-1 text-slate-400">Replace this seeded admin in production — see README.</div>
            </div>
          </div>

          <div className="text-center text-xs text-slate-500 mt-4">
            <Link to="/" className="hover:underline">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
