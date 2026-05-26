import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const FEATURES = [
  {
    icon: "🤖",
    title: "AI Progress Detection",
    body: "A trained CNN classifies a site photo into one of seven construction stages — clearing, sub-base, slab, asphalt, line marking, hoops, fencing — and estimates an exact progress percentage.",
  },
  {
    icon: "💰",
    title: "Live Budget Tracking",
    body: "Log materials, labour, equipment, and transport expenses against the project budget. See variance, forecasted total cost, and deviation status update in real time.",
  },
  {
    icon: "📊",
    title: "Dashboards & Charts",
    body: "Multi-project overview, progress-over-time, cost trend, stage distribution. Project managers and clients see the same source of truth.",
  },
  {
    icon: "📄",
    title: "One-click Reports",
    body: "Generate PDF or Excel reports for any project: full status, progress only, budget summary. Branded UKWI templates ready for stakeholders.",
  },
  {
    icon: "🔔",
    title: "Smart Alerts",
    body: "Auto-trigger alerts when a project trends toward budget overrun or schedule slippage. Severity, audit trail, and resolution workflow built in.",
  },
  {
    icon: "🔒",
    title: "Role-based Access",
    body: "Engineers capture data, managers approve and report, clients view read-only dashboards, admins manage users. JWT-secured at every endpoint.",
  },
];

const STAGES = [
  { n: 1, label: "Site Clearing", emoji: "🚜" },
  { n: 2, label: "Sub-base", emoji: "⛏️" },
  { n: 3, label: "Concrete Slab", emoji: "🏗️" },
  { n: 4, label: "Surface Finish", emoji: "🛣️" },
  { n: 5, label: "Line Marking", emoji: "🎨" },
  { n: 6, label: "Hoops & Backboards", emoji: "🏀" },
  { n: 7, label: "Fencing & Final", emoji: "✅" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Capture",
    body: "Site engineer takes a photo with their phone or uploads from the field. No special hardware required.",
  },
  {
    step: "02",
    title: "Analyse",
    body: "The AI service classifies stage, estimates progress %, and emits a calibrated confidence score plus a plain-English summary.",
  },
  {
    step: "03",
    title: "Decide",
    body: "Cost forecasts and variance update automatically. Alerts fire when a project drifts off plan. Reports are one click away.",
  },
];


function NavBar({ user }) {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🏗️</span>
          <span>
            <span className="block font-bold text-slate-800 leading-tight">UKWI Monitor</span>
            <span className="block text-[11px] text-slate-500 uppercase tracking-wide">Construction AI · Rwanda</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
          <a href="#features" className="hover:text-ukwi-600">Features</a>
          <a href="#how" className="hover:text-ukwi-600">How it works</a>
          <a href="#stages" className="hover:text-ukwi-600">Stages</a>
          <a href="#contact" className="hover:text-ukwi-600">Contact</a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Link to="/dashboard" className="btn-primary">Go to dashboard →</Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:inline-flex btn-secondary">Sign in</Link>
              <Link to="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}


function Hero({ user }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-ukwi-700 via-ukwi-500 to-ukwi-100" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px, 60px 60px",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-center">
          <div className="lg:col-span-3 space-y-6">
            <span className="inline-flex items-center gap-2 bg-white/20 backdrop-blur text-xs uppercase tracking-wider px-3 py-1 rounded-full border border-white/30">
              <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
              AI-Based Construction Monitoring
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              Track every basketball court{" "}
              <span className="text-ukwi-100">from photo to handover.</span>
            </h1>
            <p className="text-lg md:text-xl text-ukwi-50 max-w-2xl">
              UKWI Construction Monitor uses computer vision to estimate progress on UKWI Company Ltd's
              court projects, tie that progress to live budget tracking, and surface deviation alerts
              before they become problems.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              {user ? (
                <Link to="/dashboard" className="btn bg-white text-ukwi-700 hover:bg-slate-100">
                  Open dashboard →
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn bg-white text-ukwi-700 hover:bg-slate-100">
                    Create your account
                  </Link>
                  <Link to="/login" className="btn border border-white/40 text-white hover:bg-white/10">
                    I already have an account
                  </Link>
                </>
              )}
            </div>
            <div className="pt-6 grid grid-cols-3 gap-6 max-w-md text-center">
              <div>
                <div className="text-3xl font-bold">7</div>
                <div className="text-xs text-ukwi-100 uppercase tracking-wide">Construction stages</div>
              </div>
              <div>
                <div className="text-3xl font-bold">100%</div>
                <div className="text-xs text-ukwi-100 uppercase tracking-wide">Test accuracy</div>
              </div>
              <div>
                <div className="text-3xl font-bold">60+</div>
                <div className="text-xs text-ukwi-100 uppercase tracking-wide">REST endpoints</div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-white/95 text-slate-800 shadow-2xl p-6 border border-white/40">
              <div className="text-xs uppercase tracking-wide text-slate-500">Sample analysis</div>
              <div className="mt-2 text-lg font-bold">Kigali Court A — KGL-A-001</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Predicted stage</div>
                  <div className="font-semibold text-slate-800 text-sm mt-0.5">Concrete Slab</div>
                </div>
                <div className="rounded bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Progress</div>
                  <div className="font-bold text-2xl text-ukwi-700 leading-none">38.8<span className="text-base">%</span></div>
                </div>
                <div className="rounded bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Confidence</div>
                  <div className="font-bold text-2xl text-emerald-600 leading-none">100<span className="text-base">%</span></div>
                </div>
                <div className="rounded bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Status</div>
                  <div className="text-emerald-700 font-medium text-sm mt-0.5">On track</div>
                </div>
              </div>
              <div className="mt-4 rounded bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                <span className="font-semibold">Next step:</span> Verify rebar spacing and concrete cure
                time before approving the next pour.
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                Generated by basketball_court_cnn v1.0 · 480 ms
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function Features() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="text-xs uppercase tracking-wider text-ukwi-600 font-semibold">What you get</div>
        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-2">
          Built for the realities of Rwandan construction sites.
        </h2>
        <p className="text-slate-600 mt-3">
          Designed around how engineers, project managers, and clients actually work — not generic
          construction software bent to fit.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="card hover:shadow-md hover:border-ukwi-200 transition-all"
          >
            <div className="text-3xl">{f.icon}</div>
            <h3 className="font-semibold text-slate-800 mt-3">{f.title}</h3>
            <p className="text-sm text-slate-600 mt-2">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}


function HowItWorks() {
  return (
    <section id="how" className="bg-slate-50 border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-xs uppercase tracking-wider text-ukwi-600 font-semibold">How it works</div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-2">From a phone photo to a board-ready report.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.step} className="relative">
              <div className="card h-full">
                <div className="text-5xl font-bold text-ukwi-100">{s.step}</div>
                <h3 className="font-semibold text-slate-800 mt-2 text-lg">{s.title}</h3>
                <p className="text-sm text-slate-600 mt-2">{s.body}</p>
              </div>
              {i < HOW_IT_WORKS.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-3 text-2xl text-ukwi-300">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


function StagesShowcase() {
  return (
    <section id="stages" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="text-xs uppercase tracking-wider text-ukwi-600 font-semibold">The seven stages</div>
        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-2">
          Every basketball court, broken into clear milestones.
        </h2>
        <p className="text-slate-600 mt-3">
          The AI is trained on these seven stages. The same taxonomy drives the progress %, the
          stage budget, and the next-step advice the dashboard shows.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
        {STAGES.map((s) => (
          <div
            key={s.n}
            className="card text-center p-4 hover:shadow-md hover:border-ukwi-200 transition-all"
          >
            <div className="text-3xl">{s.emoji}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">Stage {s.n}</div>
            <div className="text-sm font-semibold text-slate-800">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}


function ForClients() {
  return (
    <section className="bg-ukwi-700 text-white">
      <div className="max-w-6xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="text-xs uppercase tracking-wider text-ukwi-100 font-semibold">For clients</div>
          <h2 className="text-3xl md:text-4xl font-bold mt-2">See your court progress without picking up the phone.</h2>
          <p className="text-ukwi-50 mt-4 text-lg">
            Clients funding a UKWI project — government bodies, schools, sports federations — get a
            secure read-only dashboard. Real-time progress percentage, photos from site, current
            spend versus budget, and a complete audit trail. No more weekly status calls.
          </p>
          <ul className="mt-6 space-y-2 text-ukwi-50">
            <li className="flex items-start gap-2"><span>✅</span><span>Live progress and budget against the agreed plan</span></li>
            <li className="flex items-start gap-2"><span>✅</span><span>Site photos as evidence — every analysis links to its source image</span></li>
            <li className="flex items-start gap-2"><span>✅</span><span>Downloadable PDF / Excel reports on demand</span></li>
            <li className="flex items-start gap-2"><span>✅</span><span>Read-only — no risk of accidental changes</span></li>
          </ul>
          <div className="mt-6 flex gap-3">
            <Link to="/register" className="btn bg-white text-ukwi-700 hover:bg-slate-100">
              Request client access
            </Link>
            <a href="#contact" className="btn border border-white/40 text-white hover:bg-white/10">
              Talk to UKWI
            </a>
          </div>
        </div>
        <div className="rounded-2xl bg-white/10 backdrop-blur p-1 shadow-2xl border border-white/30">
          <div className="rounded-xl bg-white text-slate-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Project</div>
                <div className="font-bold">Kigali Court A</div>
              </div>
              <span className="badge bg-emerald-100 text-emerald-700">on track</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded bg-slate-50 p-3">
                <div className="text-[11px] uppercase text-slate-500">Progress</div>
                <div className="text-xl font-bold text-ukwi-700">38.8%</div>
              </div>
              <div className="rounded bg-slate-50 p-3">
                <div className="text-[11px] uppercase text-slate-500">Spent</div>
                <div className="text-xl font-bold">12.4 M RWF</div>
              </div>
              <div className="rounded bg-slate-50 p-3">
                <div className="text-[11px] uppercase text-slate-500">Budget</div>
                <div className="text-xl font-bold">50.0 M RWF</div>
              </div>
              <div className="rounded bg-slate-50 p-3">
                <div className="text-[11px] uppercase text-slate-500">Open alerts</div>
                <div className="text-xl font-bold text-rose-600">0</div>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-ukwi-500 to-ukwi-300" style={{ width: "38.8%" }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>Stage 3 · Concrete Slab</span>
              <span>Next: Surface Finishing</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function Footer() {
  return (
    <footer id="contact" className="bg-slate-900 text-slate-300">
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏗️</span>
            <span className="font-bold text-white">UKWI Monitor</span>
          </div>
          <p className="text-sm text-slate-400 mt-3 max-w-md">
            AI-Based Construction Progress &amp; Budget Monitoring System for UKWI Company Ltd, Rwanda.
            Internal platform — access by invitation.
          </p>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">Product</div>
          <ul className="space-y-2 text-sm">
            <li><a href="#features" className="hover:text-white">Features</a></li>
            <li><a href="#how" className="hover:text-white">How it works</a></li>
            <li><a href="#stages" className="hover:text-white">Stages</a></li>
            <li><Link to="/register" className="hover:text-white">Get started</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">Contact</div>
          <ul className="space-y-2 text-sm">
            <li>UKWI Company Ltd</li>
            <li>Kigali, Rwanda</li>
            <li><a href="mailto:contact@ukwi.rw" className="hover:text-white">contact@ukwi.rw</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <span>© {new Date().getFullYear()} UKWI Company Ltd. All rights reserved.</span>
          <span>Internal use only · Built with ❤️ in Kigali</span>
        </div>
      </div>
    </footer>
  );
}


export default function LandingPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-white">
      <NavBar user={user} />
      <Hero user={user} />
      <Features />
      <HowItWorks />
      <StagesShowcase />
      <ForClients />
      <Footer />
    </div>
  );
}
