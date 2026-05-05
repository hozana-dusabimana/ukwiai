import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { authApi } from "../api/endpoints";

const ROLES = [
  {
    value: "engineer",
    label: "Site Engineer",
    icon: "🛠️",
    summary: "Capture progress on the ground.",
    perks: [
      "Upload site photos",
      "Run AI progress analysis",
      "Record materials, labour, equipment expenses",
    ],
    recommended: true,
  },
  {
    value: "project_manager",
    label: "Project Manager",
    icon: "📋",
    summary: "Plan, budget, report.",
    perks: [
      "Create and edit projects",
      "Generate PDF / Excel reports",
      "Resolve alerts and approve milestones",
      "Everything a Site Engineer can do",
    ],
  },
  {
    value: "viewer",
    label: "Viewer",
    icon: "👁️",
    summary: "Read-only access for clients & auditors.",
    perks: [
      "Browse projects, dashboards, and reports",
      "Download generated reports",
      "Cannot modify data — useful for client logins",
    ],
  },
];


function StepIndicator({ step }) {
  const steps = [
    { n: 1, label: "Personal info" },
    { n: 2, label: "Choose role" },
  ];
  return (
    <ol className="flex items-center gap-3 text-xs mb-6">
      {steps.map((s, i) => {
        const active = step === s.n;
        const done = step > s.n;
        return (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                done
                  ? "bg-emerald-500 text-white"
                  : active
                  ? "bg-ukwi-500 text-white ring-4 ring-ukwi-100"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? "✓" : s.n}
            </span>
            <span className={active ? "font-semibold text-slate-700" : "text-slate-500"}>{s.label}</span>
            {i < steps.length - 1 && <span className="w-8 h-px bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}


function PersonalInfoStep({ form, setForm, onNext }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Tell us about you</h2>
      <p className="text-sm text-slate-500 -mt-2">
        We use this to personalise your dashboard and record-keeping audit trail.
      </p>

      <div>
        <label className="label">Full name *</label>
        <input
          className="input"
          required
          placeholder="e.g. Jean-Paul Habimana"
          value={form.full_name}
          onChange={set("full_name")}
          autoFocus
        />
      </div>

      <div>
        <label className="label">Work email *</label>
        <input
          className="input"
          type="email"
          required
          placeholder="you@ukwi.rw"
          value={form.email}
          onChange={set("email")}
        />
        <p className="text-xs text-slate-400 mt-1">Used for sign-in and password recovery.</p>
      </div>

      <div>
        <label className="label">Password *</label>
        <input
          className="input"
          type="password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          value={form.password}
          onChange={set("password")}
        />
      </div>

      <div>
        <label className="label">Phone (optional)</label>
        <input
          className="input"
          placeholder="+250 7xx xxx xxx"
          value={form.phone}
          onChange={set("phone")}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Link to="/login" className="btn-secondary flex-1 text-center">Back to sign in</Link>
        <button type="submit" className="btn-primary flex-1">Continue →</button>
      </div>
    </form>
  );
}


function RoleStep({ form, setForm, busy, onBack, onSubmit }) {
  const choose = (value) => setForm({ ...form, role: value });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">What will you do here?</h2>
      <p className="text-sm text-slate-500 -mt-2">
        Pick the role that best matches how you'll use UKWI Monitor. An admin can change this later.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROLES.map((r) => {
          const selected = form.role === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => choose(r.value)}
              className={`text-left p-4 rounded-lg border transition-all relative ${
                selected
                  ? "border-ukwi-500 bg-ukwi-50 ring-2 ring-ukwi-200 shadow-sm"
                  : "border-slate-200 bg-white hover:border-ukwi-300 hover:bg-slate-50"
              }`}
            >
              {r.recommended && (
                <span className="absolute -top-2 right-3 text-[10px] uppercase tracking-wide bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
              <div className="text-2xl">{r.icon}</div>
              <div className="font-semibold text-slate-800 mt-2">{r.label}</div>
              <div className="text-xs text-slate-500 mb-2">{r.summary}</div>
              <ul className="text-xs text-slate-600 space-y-1">
                {r.perks.map((p) => (
                  <li key={p} className="flex gap-1.5">
                    <span className={selected ? "text-ukwi-500" : "text-slate-400"}>•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              {selected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-ukwi-500 text-white flex items-center justify-center text-xs">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 mt-2">
        Note — administrator accounts cannot be self-created; an existing admin must invite you.
      </p>

      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onBack} disabled={busy}>
          ← Back
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={onSubmit}
          disabled={busy || !form.role}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </div>
    </div>
  );
}


export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    role: "engineer",
  });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    setBusy(true);
    try {
      // Strip empty optional fields so backend sees `null`-ish
      const payload = { ...form };
      if (!payload.phone) delete payload.phone;
      await authApi.register(payload);
      toast.success("Account created — please sign in");
      navigate("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ukwi-700 via-ukwi-500 to-ukwi-100 px-4 py-8">
      <div className={`w-full ${step === 2 ? "max-w-3xl" : "max-w-md"} card`}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Create your UKWI account</h1>
          <span className="text-xs text-slate-400">Step {step} of 2</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Two quick steps. Nothing is published until both are complete.
        </p>

        <StepIndicator step={step} />

        {step === 1 ? (
          <PersonalInfoStep form={form} setForm={setForm} onNext={() => setStep(2)} />
        ) : (
          <RoleStep
            form={form}
            setForm={setForm}
            busy={busy}
            onBack={() => setStep(1)}
            onSubmit={submit}
          />
        )}

        <div className="mt-4 text-sm text-center text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="text-ukwi-500 hover:underline font-medium">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
