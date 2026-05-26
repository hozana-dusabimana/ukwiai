import React, { useState } from "react";
import { Hammer, ArrowLeft, ArrowRight, AlertCircle, Mail, User, Phone, Lock, Shield, CheckCircle2, Eye, EyeOff, Wrench, ClipboardList, Eye as EyeRole } from "lucide-react";
import { useAuth } from "./AuthContext";

interface RegisterScreenProps {
  onBackToLanding?: () => void;
  onGoToLogin: () => void;
}

type Step = 0 | 1 | 2;

const STEPS = [
  { num: 1, title: "Profile", caption: "Who you are" },
  { num: 2, title: "Role", caption: "What you do" },
  { num: 3, title: "Credentials", caption: "Secure access" },
];

export default function RegisterScreen({ onBackToLanding, onGoToLogin }: RegisterScreenProps) {
  const { register } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "engineer",
    password: "",
    confirm: "",
  });
  const [showPwd, setShowPwd] = useState(false);

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  const validateStep = (s: Step): string | null => {
    if (s === 0) {
      if (!form.full_name.trim()) return "Tell us your full name.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return "Enter a valid work email.";
      return null;
    }
    if (s === 1) {
      if (!form.role) return "Pick a role.";
      return null;
    }
    if (s === 2) {
      if (form.password.length < 8) return "Password must be at least 8 characters.";
      if (form.password !== form.confirm) return "Passwords do not match.";
      return null;
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep(((step + 1) as Step));
  };

  const back = () => {
    setError(null);
    setStep(((step - 1) as Step));
  };

  const submit = async () => {
    const err = validateStep(2);
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        role: form.role,
      });
      // AuthProvider auto-logs in on success → App.tsx replaces screen.
    } catch (e: any) {
      setError(e.message || "Could not create account");
    } finally {
      setSubmitting(false);
    }
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
        {/* LEFT — brand + steps */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-10 lg:p-12 flex flex-col justify-between min-h-[620px] overflow-hidden">
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-20 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />

          <div className="relative flex items-center gap-2.5">
            <div className="w-9 h-9 bg-orange-600 rounded flex items-center justify-center">
              <Hammer className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">UKWI Monitor</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Construction Intelligence</div>
            </div>
          </div>

          <div className="relative my-auto py-10 space-y-8">
            <div className="space-y-3">
              <h2 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
                Three quick steps and you're inside.
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed max-w-md">
                We use your role to scope what you see — admins get the full system, engineers see assigned projects, viewers get read-only insight.
              </p>
            </div>

            {/* Stepper */}
            <ol className="space-y-4">
              {STEPS.map((s, i) => {
                const state = i < step ? "done" : i === step ? "active" : "pending";
                return (
                  <li key={s.num} className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all ${
                      state === "done" ? "bg-emerald-500 border-emerald-500 text-white" :
                      state === "active" ? "bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-600/30" :
                      "bg-transparent border-slate-700 text-slate-500"
                    }`}>
                      {state === "done" ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                    </div>
                    <div className={state === "pending" ? "opacity-50" : ""}>
                      <div className={`text-sm font-bold ${state === "active" ? "text-white" : "text-slate-300"}`}>{s.title}</div>
                      <div className="text-[11px] text-slate-500">{s.caption}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="relative text-[10px] text-slate-500 font-medium tracking-wider uppercase">
            Already have an account?{" "}
            <button onClick={onGoToLogin} className="text-orange-400 hover:text-orange-300 font-bold">
              Sign in
            </button>
          </div>
        </div>

        {/* RIGHT — form panel */}
        <div className="p-10 lg:p-12 flex flex-col">
          <div className="space-y-1 mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-orange-600">Step {step + 1} of {STEPS.length}</div>
            <h1 className="font-bold text-2xl text-slate-950">{STEPS[step].title}</h1>
            <p className="text-sm text-slate-500">
              {step === 0 && "Tell us who you are."}
              {step === 1 && "Pick the role that matches your responsibilities."}
              {step === 2 && "Choose a strong password — minimum 8 characters."}
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden my-6">
            <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded flex items-start gap-2 mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex-1">
            {step === 0 && (
              <div className="space-y-4">
                <Field label="Full name" icon={<User className="w-4 h-4" />}>
                  <input
                    required
                    autoFocus
                    value={form.full_name}
                    onChange={(e) => update("full_name", e.target.value)}
                    placeholder="Jane Doe"
                    className="bg-transparent outline-none w-full text-sm text-slate-900 placeholder-slate-400"
                  />
                </Field>
                <Field label="Work email" icon={<Mail className="w-4 h-4" />}>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="you@ukwi.rw"
                    className="bg-transparent outline-none w-full text-sm text-slate-900 placeholder-slate-400"
                  />
                </Field>
                <Field label="Phone (optional)" icon={<Phone className="w-4 h-4" />}>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="+250 78..."
                    className="bg-transparent outline-none w-full text-sm text-slate-900 placeholder-slate-400"
                  />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-1 gap-3">
                <RoleCard
                  picked={form.role === "engineer"}
                  onPick={() => update("role", "engineer")}
                  icon={<Wrench className="w-5 h-5" />}
                  title="Site Engineer"
                  body="Upload photos, run AI analyses, log expenses on assigned projects."
                />
                <RoleCard
                  picked={form.role === "project_manager"}
                  onPick={() => update("role", "project_manager")}
                  icon={<ClipboardList className="w-5 h-5" />}
                  title="Project Manager"
                  body="Everything an engineer does, plus stage approvals and report generation."
                />
                <RoleCard
                  picked={form.role === "viewer"}
                  onPick={() => update("role", "viewer")}
                  icon={<EyeRole className="w-5 h-5" />}
                  title="Viewer"
                  body="Read-only access to dashboards and AI insights. Cannot modify data."
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Field label="Password" icon={<Lock className="w-4 h-4" />}>
                  <input
                    required
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="At least 8 characters"
                    className="bg-transparent outline-none w-full text-sm text-slate-900 placeholder-slate-400"
                  />
                  <button type="button" onClick={() => setShowPwd((v) => !v)} className="text-slate-400 hover:text-slate-700">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </Field>
                <Field label="Confirm password" icon={<Lock className="w-4 h-4" />}>
                  <input
                    required
                    type={showPwd ? "text" : "password"}
                    value={form.confirm}
                    onChange={(e) => update("confirm", e.target.value)}
                    placeholder="Repeat password"
                    className="bg-transparent outline-none w-full text-sm text-slate-900 placeholder-slate-400"
                  />
                </Field>

                <PasswordStrength password={form.password} />

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 leading-relaxed">
                  By creating an account you accept the{" "}
                  <span className="font-bold text-slate-900">UKWI internal terms</span> and agree that your actions on this system are
                  audit-logged with your user identifier.
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-slate-100">
            {step > 0 ? (
              <button
                type="button"
                onClick={back}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-slate-900 px-4 py-2.5 rounded"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onGoToLogin}
                className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 px-4 py-2.5 rounded"
              >
                I already have an account
              </button>
            )}

            {step < 2 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-2.5 rounded shadow-lg shadow-orange-600/20 transition-all"
              >
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold text-xs uppercase tracking-wider px-6 py-2.5 rounded shadow-lg shadow-orange-600/20"
              >
                {submitting ? "Creating account..." : "Create account"} <Shield className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-700 mb-1.5">{label}</span>
      <div className="flex items-center bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-lg gap-2 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
        <span className="text-slate-400">{icon}</span>
        {children}
      </div>
    </label>
  );
}

function RoleCard({ picked, onPick, icon, title, body }: { picked: boolean; onPick: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`text-left rounded-lg border-2 p-4 flex items-start gap-3 transition-all ${
        picked
          ? "border-orange-500 bg-orange-50 shadow-md shadow-orange-500/10"
          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0 ${picked ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-600"}`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900">{title}</h3>
          {picked && <CheckCircle2 className="w-4 h-4 text-orange-600" />}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </button>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "At least 8 characters", pass: password.length >= 8 },
    { label: "Contains a number", pass: /\d/.test(password) },
    { label: "Contains uppercase", pass: /[A-Z]/.test(password) },
    { label: "Contains a symbol", pass: /[!@#$%^&*(),.?":{}|<>_\-+=]/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const pct = (passed / checks.length) * 100;
  const color = passed <= 1 ? "bg-red-500" : passed === 2 ? "bg-amber-500" : passed === 3 ? "bg-sky-500" : "bg-emerald-500";

  return (
    <div className="space-y-2">
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <li key={c.label} className={`text-[10px] flex items-center gap-1.5 ${c.pass ? "text-emerald-700" : "text-slate-400"}`}>
            <CheckCircle2 className={`w-3 h-3 ${c.pass ? "text-emerald-500" : "text-slate-300"}`} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
