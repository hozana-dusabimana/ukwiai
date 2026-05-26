import React from "react";
import {
  LayoutDashboard,
  Cpu,
  Building,
  Coins,
  ScrollText,
  FileText,
  Settings,
  FileBarChart2,
  Users,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { capabilitiesFor, roleLabel } from "../lib/roles";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onNewAnalysisTriggered: () => void;
  activeProject: { id?: number; name: string; location: string; code: string } | null;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  onNewAnalysisTriggered,
  activeProject,
}: SidebarProps) {
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);

  const projectName = activeProject?.name || "No active project";
  const projectLocation = activeProject?.location || "Awaiting first project";
  const projectInitial = (activeProject?.name?.[0] || "U").toUpperCase();

  const allTabs = [
    { id: "dashboard",     label: "Dashboard",     icon: LayoutDashboard, show: caps.canSeeDashboard },
    { id: "ai-analysis",   label: "AI Analysis",   icon: Cpu,             show: caps.canSeeAiAnalysis },
    { id: "projects",      label: "Projects",      icon: Building,        show: caps.canSeeProjects },
    { id: "financials",    label: "Financials",    icon: Coins,           show: caps.canSeeFinancials },
    { id: "site-logs",     label: "Site Logs",     icon: ScrollText,      show: caps.canSeeSiteLogs },
    { id: "reports",       label: "Reports",       icon: FileBarChart2,   show: caps.canSeeReports },
    { id: "users",         label: "Users",         icon: Users,           show: caps.canSeeUsers },
    { id: "system-health", label: "System Health", icon: FileText,        show: caps.canSeeSystemHealth },
  ];
  const tabs = allTabs.filter((t) => t.show);

  return (
    <aside className="hidden md:flex flex-col h-[calc(100vh-64px)] w-64 bg-white border-r border-gray-200 py-6 fixed left-0 top-16 z-30 select-none">
      <div className="px-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-slate-900 rounded flex items-center justify-center text-white font-bold text-lg">
            {projectInitial}
          </div>
          <div className="min-w-0">
            <div className="font-sans font-bold text-gray-950 leading-tight truncate" title={projectName}>{projectName}</div>
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1 truncate" title={projectLocation}>
              {projectLocation}
            </div>
          </div>
        </div>

        {caps.canRunAi && (
          <button
            onClick={onNewAnalysisTriggered}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded font-semibold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
          >
            New Analysis
          </button>
        )}
        {!caps.canRunAi && (
          <div className="w-full bg-gray-50 border border-gray-200 text-gray-500 py-2 px-4 rounded text-[10px] uppercase tracking-widest font-bold text-center">
            {roleLabel(user?.role)} · Read only
          </div>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded text-left transition-all ${
                isActive
                  ? "bg-sky-50 text-slate-900 border-l-4 border-orange-600 font-semibold"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <IconComponent className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-orange-600" : "text-gray-400"}`} />
              <span className="font-sans text-xs font-bold uppercase tracking-wider">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-4 pt-4 border-t border-gray-100 space-y-1">
        <button
          onClick={() => setCurrentTab("settings")}
          className={`w-full flex items-center gap-3.5 px-4 py-2 rounded text-left transition-colors ${
            currentTab === "settings"
              ? "bg-sky-50 text-slate-900"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Settings className="w-5 h-5 text-gray-400" />
          <span className="font-sans text-xs font-bold uppercase tracking-wider">Settings</span>
        </button>
        <div className="px-4 py-2 text-[10px] text-gray-400 font-mono uppercase tracking-wider truncate">
          {user?.email}
        </div>
      </div>
    </aside>
  );
}
