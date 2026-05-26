import React from "react";
import { Search, Bell, LogOut, Settings as SettingsIcon, MapPin } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

interface HeaderProps {
  currentTab: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeProjectName?: string;
  activeProjectLocation?: string;
  onNavigate: (tab: string) => void;
  unreadCount?: number;
}

export default function Header({
  currentTab,
  searchQuery,
  setSearchQuery,
  activeProjectName = "UKWI Project",
  activeProjectLocation,
  onNavigate,
  unreadCount = 0,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const initials = (user?.full_name || "U U").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const searchPlaceholder =
    currentTab === "system-health" ? "Search system events..." :
    currentTab === "site-logs" ? "Search alerts and notifications..." :
    "Search projects or scans...";

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 flex justify-between items-center h-16 px-6 lg:px-10 w-full">
      <div className="flex items-center gap-6 flex-1">
        {currentTab === "projects" || currentTab === "project-detail" ? (
          <div className="flex items-center gap-4">
            <h2 className="font-sans text-xl font-bold text-gray-900 truncate max-w-[240px]" title={activeProjectName}>{activeProjectName}</h2>
            {activeProjectLocation && (
              <div className="hidden lg:flex items-center bg-gray-50 border border-gray-200 px-3 py-1 rounded gap-1.5 text-xs text-gray-600">
                <MapPin className="text-gray-400 w-4 h-4" />
                <span className="truncate max-w-[200px]">{activeProjectLocation}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 w-full max-w-md">
            <div className="flex items-center w-full bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg focus-within:ring-2 focus-within:ring-sky-100 focus-within:border-gray-400">
              <Search className="text-gray-400 w-4 h-4 mr-2" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                aria-label="Search field"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-sm w-full text-gray-800 placeholder-gray-400"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 lg:gap-6">
        <div className="flex items-center gap-2 lg:gap-3">
          <button onClick={() => onNavigate("site-logs")} className="p-2 text-gray-500 hover:bg-gray-50 rounded-full relative" title="Site logs & alerts">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-orange-600 text-white text-[9px] font-bold rounded-full px-1 flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          <button onClick={() => onNavigate("settings")} className="p-2 text-gray-500 hover:bg-gray-50 rounded-full" title="Settings">
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="h-6 w-[1.5px] bg-gray-200 hidden md:block"></div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-xs font-bold text-slate-900 truncate max-w-[160px]" title={user?.full_name}>{user?.full_name || "—"}</div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{user?.role || ""}</div>
          </div>
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm border border-gray-200" title={user?.email}>
            {initials || "U"}
          </div>
          <button onClick={logout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
