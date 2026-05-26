import React from "react";
import { Cpu, Coins, Building2, Sparkles, CheckSquare, ArrowRight } from "lucide-react";
import { ScanHistory, OverviewData } from "../types";
import { StatCard } from "../ui/primitives";
import DashboardCharts from "./DashboardCharts";

interface DashboardOverviewProps {
  scans: ScanHistory[];
  overview: OverviewData | null;
  onNavigateToTab: (tab: string) => void;
  onOpenProject?: (id: number) => void;
}

export default function DashboardOverview({ scans, overview, onNavigateToTab, onOpenProject }: DashboardOverviewProps) {
  const activeProjectName = overview?.activeProject?.name || "No active project";
  const activeProjectLocation = overview?.activeProject?.location || "Awaiting first project";
  const totals = overview?.totals;
  const totalScans = scans.length;
  const recentScan = scans[0];
  const projectsList = overview?.projects || [];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-sans text-2xl font-bold text-gray-950">UKWI Site Executive Suite</h1>
        <p className="text-xs text-gray-400 mt-1">Centralised control hub for engineers, financial planners, and AI verification.</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          icon={<Building2 className="w-5 h-5" />}
          label="Active project"
          value={<span className="truncate" title={activeProjectName}>{activeProjectName}</span>}
          subtitle={activeProjectLocation}
        />
        <StatCard
          icon={<Cpu className="w-5 h-5" />}
          label="AI inference scans"
          value={`${totalScans}`}
          subtitle={totals ? `${totals.totalProjects} project${totals.totalProjects === 1 ? "" : "s"} tracked` : "Awaiting data"}
          accent="orange"
        />
        <StatCard
          icon={<Coins className="w-5 h-5" />}
          label="Total allocated funds"
          value={totals?.totalBudget || "RWF 0"}
          subtitle={totals ? `${totals.totalSpent} spent` : "—"}
          accent="emerald"
        />
        <StatCard
          icon={<CheckSquare className="w-5 h-5" />}
          label="Average progress"
          value={totals ? `${totals.averageProgress.toFixed(1)}%` : "—"}
          subtitle={totals ? `${totals.onTrackCount} on track · ${totals.overBudgetCount} over budget` : "—"}
          accent="sky"
        />
      </section>

      <DashboardCharts projectId={overview?.activeProject?.id} />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <header className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Active stage inspector</h3>
            <button onClick={() => onNavigateToTab("ai-analysis")} className="text-[10px] uppercase tracking-wider font-bold text-orange-600 hover:underline flex items-center gap-1">
              Launch analyser <ArrowRight className="w-3 h-3" />
            </button>
          </header>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            Verify real-time physical progress against construction stages. Computer vision identifies structural compliance and progress percentage.
          </p>
          {recentScan ? (
            <div className="bg-gray-50 border border-gray-200 rounded p-4 flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 bg-white rounded border border-gray-200 overflow-hidden">
                <img src={recentScan.image} alt="recent scan" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-bold text-orange-500">Most recent scan</div>
                <div className="font-bold text-sm text-slate-900 truncate" title={recentScan.title}>{recentScan.title}</div>
                <div className="font-mono text-[10px] text-gray-400">{recentScan.date} · {recentScan.progress}% complete</div>
              </div>
              <button onClick={() => onNavigateToTab("project-detail")} className="bg-white border border-gray-200 text-slate-900 text-xs font-bold py-2 px-4 rounded uppercase tracking-wider hover:bg-gray-50">Inspect</button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">No scans yet — head to AI Analysis to upload a site photo.</p>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-gray-200 rounded-lg p-6 space-y-3 shadow-sm">
          <h3 className="font-bold text-slate-900 pb-2 border-b border-gray-100">Quick actions</h3>
          <ActionButton icon={<Sparkles className="w-4 h-4" />} label="Run new AI scan" hint="Upload or capture a site photo" onClick={() => onNavigateToTab("ai-analysis")} />
          <ActionButton icon={<Building2 className="w-4 h-4" />} label="Open projects" hint="Browse and manage all projects" onClick={() => onNavigateToTab("projects")} />
          <ActionButton icon={<Coins className="w-4 h-4" />} label="Track budget" hint="See expenses and variance" onClick={() => onNavigateToTab("financials")} />
          <ActionButton icon={<CheckSquare className="w-4 h-4" />} label="View audit log" hint="Inspect admin transactions" onClick={() => onNavigateToTab("system-health")} />
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <header className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Project portfolio</h3>
          <button onClick={() => onNavigateToTab("projects")} className="text-[10px] uppercase tracking-wider font-bold text-orange-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </header>
        {projectsList.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">No projects yet. Create one from the Projects tab.</div>
        ) : (
          <ul className="divide-y divide-gray-150">
            {projectsList.slice(0, 5).map((p) => (
              <li key={p.id} onClick={() => onOpenProject?.(p.id)} className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 truncate" title={p.name}>{p.name}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{p.code} · {p.location || "Location not set"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-slate-900">{p.totalBudget}</span>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                    p.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    p.status === "completed" ? "bg-sky-50 text-sky-700 border-sky-200" :
                    "bg-gray-50 text-gray-700 border-gray-200"
                  }`}>{p.status.replace(/_/g, " ")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActionButton({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full bg-slate-50 hover:bg-sky-50 text-slate-900 border border-gray-200 rounded p-3 text-left flex items-center gap-3 group transition-all">
      <span className="text-gray-400 group-hover:text-orange-500">{icon}</span>
      <div>
        <span className="font-bold text-xs text-slate-900 block">{label}</span>
        <span className="text-[10px] text-gray-500 block">{hint}</span>
      </div>
    </button>
  );
}
