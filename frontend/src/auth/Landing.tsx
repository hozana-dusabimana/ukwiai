import React from "react";
import { Hammer, Camera, Coins, FileBarChart2, ShieldCheck, ArrowRight, CheckCircle2, Building, Cpu, Sparkles } from "lucide-react";

interface LandingProps {
  onSignIn: () => void;
  onRegister: () => void;
}

export default function Landing({ onSignIn, onRegister }: LandingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 font-sans text-slate-900 selection:bg-orange-500/20">
      <NavBar onSignIn={onSignIn} onRegister={onRegister} />
      <Hero onSignIn={onSignIn} onRegister={onRegister} />
      <Stats />
      <Features />
      <HowItWorks />
      <FinalCta onRegister={onRegister} onSignIn={onSignIn} />
      <Footer />
    </div>
  );
}

function NavBar({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-orange-600 rounded flex items-center justify-center">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">UKWI Monitor</div>
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Construction Intelligence</div>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-xs font-bold uppercase tracking-wider text-gray-600">
          <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
          <a href="#how" className="hover:text-slate-900 transition-colors">How it works</a>
          <a href="#stats" className="hover:text-slate-900 transition-colors">By the numbers</a>
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={onSignIn} className="text-xs font-bold uppercase tracking-wider px-3 py-2 rounded text-slate-700 hover:bg-slate-100 transition-colors">
            Sign in
          </button>
          <button onClick={onRegister} className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 text-white shadow-sm">
            Get started
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(234,88,12,0.10),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.06),transparent_50%)]" />
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-6">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-full">
            <Sparkles className="w-3 h-3" />
            AI-driven construction progress
          </span>
          <h1 className="font-sans font-bold text-4xl lg:text-6xl leading-[1.05] tracking-tight text-slate-950">
            See every site as the<br />
            <span className="text-orange-600">camera sees it</span> — not as<br />
            paperwork claims.
          </h1>
          <p className="text-base lg:text-lg text-slate-600 leading-relaxed max-w-xl">
            UKWI Monitor pairs a custom-trained CNN with live budget tracking so engineers, project managers, and clients all watch the same source of truth: the photos coming off your basketball-court construction sites.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button onClick={onRegister} className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded shadow-lg shadow-slate-900/10 transition-all hover:scale-[1.02]">
              Create operator account
              <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={onSignIn} className="inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-slate-900 text-slate-900 font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded transition-all">
              Sign in
            </button>
          </div>
          <div className="flex items-center gap-6 pt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> No credit card</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Self-hosted ready</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> JWT auth</span>
          </div>
        </div>

        <div className="lg:col-span-5 relative">
          <HeroMock />
        </div>
      </div>
    </section>
  );
}

function HeroMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-br from-orange-500/20 via-transparent to-slate-900/10 rounded-3xl blur-3xl -z-10" />
      <div className="bg-slate-950 rounded-xl shadow-2xl border border-slate-800 overflow-hidden">
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-2 text-[10px] text-slate-400 font-mono tracking-wider">ukwi-monitor / project · basketball-playground</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-orange-400 font-bold">Latest AI prediction</div>
              <div className="text-white font-bold mt-1">Hoops & Backboards Installation</div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">92.0 % progress · 100 % confidence</div>
            </div>
            <div className="relative w-14 h-14">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="28" cy="28" r="22" stroke="#1e293b" strokeWidth="6" fill="none" />
                <circle cx="28" cy="28" r="22" stroke="#ea580c" strokeWidth="6" fill="none" strokeDasharray="138" strokeDashoffset="11" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold">92%</div>
            </div>
          </div>
          {[
            { label: "Site Clearing & Excavation", state: "Complete", color: "bg-emerald-500" },
            { label: "Sub-base Preparation", state: "Complete", color: "bg-emerald-500" },
            { label: "Hoops & Backboards", state: "In progress", color: "bg-orange-500" },
            { label: "Fencing & Final Touches", state: "Not started", color: "bg-slate-700" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between text-xs">
              <span className="text-slate-300 truncate">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${row.color}`} />
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{row.state}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-slate-800 pt-3 flex justify-between text-[10px] uppercase tracking-widest font-bold">
            <span className="text-slate-500">Spent (AI)</span>
            <span className="text-white font-mono normal-case text-sm">RWF 449.6K of 1.0M</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stats() {
  const stats = [
    { value: "100%", label: "Held-out test accuracy on synthetic data" },
    { value: "<25min", label: "Train-from-scratch on a single CPU" },
    { value: "7 stages", label: "Canonical court construction phases" },
    { value: "60+", label: "REST endpoints, all JWT-protected" },
  ];
  return (
    <section id="stats" className="border-y border-slate-200 bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-12 grid grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center lg:text-left">
            <div className="font-mono text-2xl lg:text-3xl font-bold text-slate-950">{s.value}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: <Camera className="w-5 h-5" />,
      title: "Computer-vision progress detection",
      body: "MobileNetV2 transfer learning over the 7 canonical court stages. Predict stage and overall progress from any phone photo or webcam frame.",
    },
    {
      icon: <Coins className="w-5 h-5" />,
      title: "Live budget reconciliation",
      body: "Per-stage allocations, AI-inferred spend, recorded expenses, and forecast variance all in one panel — no spreadsheet hand-off.",
    },
    {
      icon: <Building className="w-5 h-5" />,
      title: "Project portfolio view",
      body: "Engineers, project managers, viewers — each role sees only the projects they're assigned to, enforced at the database query layer.",
    },
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      title: "JWT-only access",
      body: "Every API call carries a per-user token. Audit logs record the originating subject. Reports are signed with the operator who generated them.",
    },
    {
      icon: <FileBarChart2 className="w-5 h-5" />,
      title: "PDF + Excel reports",
      body: "Generate progress, budget, summary, or full reports on demand. ReportLab + openpyxl produce auditor-ready files in seconds.",
    },
    {
      icon: <Cpu className="w-5 h-5" />,
      title: "Heuristic fallback",
      body: "If the CNN weights aren't shipped, the AI service falls back to a colour/edge heuristic so the dashboard never goes blank.",
    },
  ];
  return (
    <section id="features" className="py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600">What it does</span>
          <h2 className="font-bold text-3xl lg:text-4xl mt-3 mb-4 tracking-tight">From a photo to a financial decision in seconds.</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Every feature on this page is wired to the actual backend you're about to deploy — not a screenshot demo.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it) => (
            <div key={it.title} className="group bg-white border border-slate-200 rounded-xl p-6 hover:border-orange-500/50 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                {it.icon}
              </div>
              <h3 className="font-bold text-slate-900 mt-4 mb-1.5">{it.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Capture",
      body: "Upload a site photo or grab a frame from the device webcam right inside the dashboard.",
    },
    {
      number: "02",
      title: "Analyse",
      body: "The FastAPI backend forwards the image to the AI service, which returns stage + progress + confidence.",
    },
    {
      number: "03",
      title: "Decide",
      body: "Per-stage spend is auto-promoted, alerts fire on overruns, and reports are one click away.",
    },
  ];
  return (
    <section id="how" className="py-20 lg:py-24 bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">How it works</span>
          <h2 className="font-bold text-3xl lg:text-4xl mt-3 mb-4 tracking-tight">Three steps. Real artefacts. No wizardry.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10">
          {steps.map((s, i) => (
            <div key={s.number} className="relative">
              {i < steps.length - 1 && <div className="hidden md:block absolute top-8 left-[60%] right-[-20%] h-px bg-gradient-to-r from-orange-500/40 to-transparent" />}
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center font-mono font-bold text-lg shadow-lg shadow-orange-600/30">
                  {s.number}
                </div>
                <h3 className="text-xl font-bold mt-5">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed mt-2">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onRegister, onSignIn }: { onRegister: () => void; onSignIn: () => void }) {
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-4xl mx-auto px-6 lg:px-10">
        <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-2xl p-10 lg:p-14 text-white text-center shadow-xl">
          <h2 className="font-bold text-3xl lg:text-4xl mb-4 tracking-tight">Ready to see what the camera sees?</h2>
          <p className="text-orange-50/90 text-sm lg:text-base leading-relaxed max-w-xl mx-auto mb-8">
            Create your operator account and run the first AI analysis on a real site image in under five minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={onRegister} className="bg-white text-orange-700 hover:bg-orange-50 font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded shadow-lg transition-all hover:scale-[1.02]">
              Create account
            </button>
            <button onClick={onSignIn} className="bg-orange-800/30 hover:bg-orange-800/50 text-white border border-white/20 font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded transition-all">
              I have an account
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-orange-600 rounded flex items-center justify-center">
            <Hammer className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-700">UKWI Construction Monitor</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="/docs" className="hover:text-slate-900">API docs</a>
          <a href="/api/system/health" className="hover:text-slate-900">System health</a>
          <span className="text-slate-400">© 2026 UKWI Company Ltd · Internal</span>
        </div>
      </div>
    </footer>
  );
}
