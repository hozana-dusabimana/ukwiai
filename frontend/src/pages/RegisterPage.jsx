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

const HIGHLIGHTS = [
  {
    icon: "🤖",
    title: "AI tools tailored to your role",
    body: "Engineers analyse photos, managers approve and report, viewers browse — pick what fits.",
  },
  {
    icon: "🔒",
    title: "Secure by default",
    body: "Work-email sign-in, JWT-protected API, role-based access end-to-end.",
  },
  {
    icon: "⚡",
    title: "Two minutes to get started",
    body: "No admin approval needed for engineer / manager / viewer accounts.",
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
        <div className="text-xs uppercase tracking-wider text-ukwi-100 font-semibold">Join the team</div>
        <h2 className="text-3xl xl:text-4xl font-bold mt-2 leading-tight">
          Create your UKWI account in two quick steps.
        </h2>
        <p className="text-ukwi-50 mt-4 max-w-md">
          Pick the role that matches how you'll use the platform — site engineer, project manager,
          or viewer for clients. Admin accounts are issued separately by an existing admin.
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
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
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
      <div>
        <label className="label" htmlFor="reg-name">Full name *</label>
        <input
          id="reg-name"
          className="input"
          required
          placeholder="e.g. Jean-Paul Habimana"
          value={form.full_name}
          onChange={set("full_name")}
          autoFocus
        />
      </div>

      <div>
        <label className="label" htmlFor="reg-email">Work email *</label>
        <input
          id="reg-email"
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
        <label className="label" htmlFor="reg-pwd">Password *</label>
        <input
          id="reg-pwd"
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
        <label className="label" htmlFor="reg-phone">Phone (optional)</label>
        <input
          id="reg-phone"
          className="input"
          placeholder="+250 7xx xxx xxx"
          value={form.phone}
          onChange={set("phone")}
        />
      </div>

      <button type="submit" className="btn-primary w-full mt-2">Continue →</button>
    </form>
  );
}


function RoleStep({ form, setForm, busy, onBack, onSubmit }) {
  const choose = (value) => setForm({ ...form, role: value });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {ROLES.map((r) => {
          const selected = form.role === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => choose(r.value)}
              className={`w-full text-left p-4 rounded-lg border transition-all relative ${
                selected
                  ? "border-ukwi-500 bg-ukwi-50 ring-2 ring-ukwi-200"
                  : "border-slate-200 bg-white hover:border-ukwi-300 hover:bg-slate-50"
              }`}
            >
              {r.recommended && (
                <span className="absolute -top-2 right-3 text-[10px] uppercase tracking-wide bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
              <div className="flex gap-3">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 ${
                    selected ? "bg-ukwi-100" : "bg-slate-100"
                  }`}
                >
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-800">{r.label}</div>
                    {selected && (
                      <span className="w-5 h-5 rounded-full bg-ukwi-500 text-white flex items-center justify-center text-xs flex-shrink-0">
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{r.summary}</div>
                  <ul className="text-xs text-slate-600 mt-2 space-y-0.5">
                    {r.perks.map((p) => (
                      <li key={p} className="flex gap-1.5">
                        <span className={selected ? "text-ukwi-500" : "text-slate-400"}>•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">
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
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-2xl font-bold text-slate-800">
                {step === 1 ? "Create your account" : "Choose your role"}
              </h1>
              <span className="text-xs text-slate-400">Step {step} of 2</span>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {step === 1
                ? "We use this to personalise your dashboard and audit trail."
                : "Pick the role that best matches how you'll use UKWI Monitor."}
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

            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="flex-1 h-px bg-slate-200" />
              <span>or</span>
              <span className="flex-1 h-px bg-slate-200" />
            </div>

            <Link to="/login" className="btn-secondary w-full">
              I already have an account
            </Link>
          </div>

          <div className="text-center text-xs text-slate-500 mt-4">
            <Link to="/" className="hover:underline">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
