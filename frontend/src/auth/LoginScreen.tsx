import React, { useState } from "react";
import { Lock, Mail, AlertCircle, Hammer, CheckCircle2, Eye, EyeOff, ChevronDown, ArrowLeft } from "lucide-react";
import { useAuth } from "./AuthContext";

interface LoginScreenProps {
  onBackToLanding?: () => void;
  onGoToRegister?: () => void;
}

export default function LoginScreen({ onBackToLanding, onGoToRegister }: LoginScreenProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const useDemo = (em: string, pw: string) => {
    setEmail(em);
    setPassword(pw);
    setDemoOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 flex items-center justify-center p-4 font-sans">
      {onBackToLanding && (
        <button
          onClick={onBackToLanding}
          className="absolute top-6 left-6 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to site
        </button>
      )}

      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 ring-1 ring-slate-200/60">
        {/* LEFT — brand panel */}
        <div className="relative bg-gradient-to-br from-orange-600 via-orange-700 to-orange-800 text-white p-10 lg:p-12 flex flex-col justify-between min-h-[560px] overflow-hidden">
          {/* Decorative grid */}
          <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          {/* Glow orbs */}
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-orange-400/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-yellow-500/20 rounded-full blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/15">
              <div className="w-7 h-7 bg-white rounded flex items-center justify-center">
                <Hammer className="w-4 h-4 text-orange-700" />
              </div>
              <span className="font-bold text-sm tracking-wide">UKWI Monitor</span>
            </div>
          </div>

          <div className="relative space-y-6 my-auto py-10">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
              Welcome back to your<br />construction control suite.
            </h2>
            <p className="text-orange-50/85 text-sm leading-relaxed max-w-md">
              Sign in to inspect projects, run AI progress analyses, reconcile budgets against the camera feed, and generate signed deliverables for stakeholders.
            </p>

            <ul className="space-y-3 pt-2 max-w-md">
              <Feature text="AI stage detection from any phone photo or webcam frame" />
              <Feature text="Per-stage budget tracking auto-promoted from analysis results" />
              <Feature text="Audit-grade reports tied to the operator who generated them" />
            </ul>
          </div>

          <div className="relative text-[10px] text-orange-100/70 font-medium tracking-wider uppercase">
            © 2026 UKWI Company Ltd · Internal access
          </div>
        </div>

        {/* RIGHT — form panel */}
        <div className="p-10 lg:p-12 flex flex-col justify-center">
          <div className="space-y-2 mb-8">
            <h1 className="font-bold text-2xl text-slate-950">Sign in</h1>
            <p className="text-sm text-slate-500">Use your UKWI operator account.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded flex items-start gap-2 mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Email</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-lg gap-2 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
                <Mail className="w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@ukwi.rw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-transparent outline-none w-full text-sm text-slate-900 placeholder-slate-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">Password</label>
                <button type="button" className="text-[10px] font-bold uppercase tracking-wider text-orange-600 hover:underline">Forgot?</button>
              </div>
              <div className="flex items-center bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-lg gap-2 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
                <Lock className="w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-transparent outline-none w-full text-sm text-slate-900 placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                className="w-4 h-4 rounded text-orange-600 border-slate-300 focus:ring-orange-500"
              />
              Keep me signed in on this device
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg text-sm uppercase tracking-wider transition-all shadow-lg shadow-orange-600/20"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <button
              onClick={() => setDemoOpen((v) => !v)}
              className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
            >
              <span>Demo accounts</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${demoOpen ? "rotate-180" : ""}`} />
            </button>
            {demoOpen && (
              <div className="mt-3 space-y-2">
                <DemoCard
                  onPick={useDemo}
                  email="admin@ukwi.rw"
                  password="ChangeMe!2026"
                  role="Admin"
                  hint="Full access — users, projects, reports, audit"
                />
              </div>
            )}
          </div>

          <p className="text-center text-xs text-slate-500 mt-6">
            New to UKWI Monitor?{" "}
            <button onClick={onGoToRegister} className="text-orange-600 font-bold hover:underline">
              Create an account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 w-5 h-5 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center flex-shrink-0">
        <CheckCircle2 className="w-3 h-3 text-white" />
      </span>
      <span className="text-sm text-orange-50/90 leading-relaxed">{text}</span>
    </li>
  );
}

function DemoCard({ onPick, email, password, role, hint }: { onPick: (e: string, p: string) => void; email: string; password: string; role: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={() => onPick(email, password)}
      className="w-full text-left bg-slate-50 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-lg px-3 py-2.5 transition-all group"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-900">{email}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">{role}</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>
    </button>
  );
}
