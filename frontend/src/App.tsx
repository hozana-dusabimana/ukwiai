import React, { useEffect, useState, useCallback, useMemo } from "react";
import { LayoutDashboard, Cpu, Building, FileText, Bell } from "lucide-react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import AnalysisWorkspace from "./components/AnalysisWorkspace";
import ProjectDetails from "./components/ProjectDetails";
import SystemHealth from "./components/SystemHealth";
import DashboardOverview from "./components/DashboardOverview";
import Financials from "./components/Financials";
import SiteLogs from "./components/SiteLogs";
import Reports from "./components/Reports";
import Settings from "./components/Settings";
import ProjectsList from "./components/ProjectsList";
import UsersAdmin from "./components/UsersAdmin";
import LoginScreen from "./auth/LoginScreen";
import RegisterScreen from "./auth/RegisterScreen";
import Landing from "./auth/Landing";
import { useAuth } from "./auth/AuthContext";
import { api } from "./lib/api";
import { ScanHistory, AuditLog, OverviewData } from "./types";
import { PageLoader } from "./ui/primitives";

type PublicView = "landing" | "login" | "register";

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [publicView, setPublicView] = useState<PublicView>("landing");
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scans, setScans] = useState<ScanHistory[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [unreadAlerts, setUnreadAlerts] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const [s, l, o] = await Promise.all([
        api<ScanHistory[]>("/api/scans").catch(() => []),
        api<AuditLog[]>("/api/logs").catch(() => []),
        api<OverviewData>("/api/overview").catch(() => null),
      ]);
      setScans(s);
      setLogs(l);
      setOverview(o);
      if (selectedProjectId == null && o?.activeProject) {
        setSelectedProjectId(o.activeProject.id);
      }
      // unread alerts badge
      try {
        const alerts = await api<Array<{ is_read: boolean; resolved_at: string | null }>>("/api/alerts?unresolved_only=true&limit=50");
        setUnreadAlerts(alerts.filter((a) => !a.is_read).length);
      } catch {
        setUnreadAlerts(0);
      }
    } catch (err) {
      console.error("Initial data fetch failed:", err);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  // The "active project" follows the user's selection when one is set,
  // otherwise falls back to the server's default (first project). Switching it
  // re-derives the header, sidebar, dashboard card and charts in one place.
  const activeProject = useMemo(() => {
    const list = overview?.projects ?? [];
    if (selectedProjectId != null) {
      const match = list.find((p) => p.id === selectedProjectId);
      if (match) return match;
    }
    return overview?.activeProject ?? null;
  }, [overview, selectedProjectId]);

  const overviewView = useMemo(
    () => (overview ? { ...overview, activeProject } : overview),
    [overview, activeProject]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <PageLoader label="Restoring session" />
      </div>
    );
  }
  if (!user) {
    if (publicView === "login") {
      return (
        <LoginScreen
          onBackToLanding={() => setPublicView("landing")}
          onGoToRegister={() => setPublicView("register")}
        />
      );
    }
    if (publicView === "register") {
      return (
        <RegisterScreen
          onBackToLanding={() => setPublicView("landing")}
          onGoToLogin={() => setPublicView("login")}
        />
      );
    }
    return (
      <Landing
        onSignIn={() => setPublicView("login")}
        onRegister={() => setPublicView("register")}
      />
    );
  }

  const navigateToTab = (tab: string) => setCurrentTab(tab);

  const handleAnalysisResult = (newScan: ScanHistory) => {
    setScans((prev) => [newScan, ...prev]);
    if (newScan.projectId) setSelectedProjectId(newScan.projectId);
    setCurrentTab("project-detail");
    refresh();
  };

  const handleSelectHistoricalScan = (scan: ScanHistory) => {
    if (scan.projectId) setSelectedProjectId(scan.projectId);
    setCurrentTab("project-detail");
  };

  const openProject = (id: number) => {
    setSelectedProjectId(id);
    setCurrentTab("project-detail");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-slate-900">
      <Header
        currentTab={currentTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeProjectName={activeProject?.name || "UKWI Project"}
        activeProjectLocation={activeProject?.location}
        projects={overview?.projects || []}
        activeProjectId={activeProject?.id ?? null}
        onSelectProject={(id) => setSelectedProjectId(id)}
        onNavigate={navigateToTab}
        unreadCount={unreadAlerts}
      />

      <div className="flex-1 flex flex-row relative min-h-[calc(100vh-64px)]">
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={navigateToTab}
          onNewAnalysisTriggered={() => navigateToTab("ai-analysis")}
          activeProject={activeProject}
        />

        <main className="flex-1 px-6 lg:px-12 py-8 md:ml-64 w-full max-w-[1440px] mx-auto overflow-x-hidden min-h-full">
          {currentTab === "dashboard" && (
            <DashboardOverview scans={scans} overview={overviewView} onNavigateToTab={navigateToTab} onOpenProject={openProject} />
          )}
          {currentTab === "ai-analysis" && (
            <AnalysisWorkspace
              scans={scans}
              overview={overviewView}
              onAnalysisResult={handleAnalysisResult}
              onSelectScan={handleSelectHistoricalScan}
            />
          )}
          {currentTab === "projects" && <ProjectsList onOpenProject={openProject} />}
          {currentTab === "project-detail" && <ProjectDetails projectId={selectedProjectId} />}
          {currentTab === "financials" && <Financials defaultProjectId={selectedProjectId} />}
          {currentTab === "site-logs" && <SiteLogs />}
          {currentTab === "reports" && <Reports />}
          {currentTab === "users" && <UsersAdmin />}
          {currentTab === "settings" && <Settings />}
          {currentTab === "system-health" && <SystemHealth logs={logs} searchQuery={searchQuery} />}
        </main>
      </div>

      <div className="md:hidden sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-14 px-6 flex justify-between items-center z-40 shadow-lg">
        {[
          { id: "dashboard", icon: LayoutDashboard, label: "Dash" },
          { id: "ai-analysis", icon: Cpu, label: "Scan" },
          { id: "projects", icon: Building, label: "Projects" },
          { id: "site-logs", icon: Bell, label: "Alerts" },
          { id: "system-health", icon: FileText, label: "Health" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => navigateToTab(t.id)}
            className={`flex flex-col items-center gap-0.5 ${currentTab === t.id ? "text-orange-600 font-bold" : "text-gray-400"}`}
            aria-label={t.label}
          >
            <t.icon className="w-5 h-5" />
            <span className="text-[8px] font-bold uppercase tracking-widest">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
