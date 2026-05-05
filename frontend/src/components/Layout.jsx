import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// `roles` (when present) gates the sidebar entry — viewers don't see "AI
// Analysis" or "Users" because they cannot use those pages.
const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/projects", label: "Projects", icon: "🏗️" },
  { to: "/ai-analysis", label: "AI Analysis", icon: "🤖", roles: ["admin", "project_manager", "engineer"] },
  { to: "/alerts", label: "Alerts", icon: "🔔" },
  { to: "/reports", label: "Reports", icon: "📄" },
  { to: "/users", label: "Users", icon: "👥", roles: ["admin"] },
];


function SidebarBody({ user, hasRole, onLogout, onNavigate }) {
  return (
    <>
      <div className="px-5 py-4 border-b border-ukwi-600 flex items-center gap-2">
        <Link to="/dashboard" onClick={onNavigate} className="block">
          <div className="font-bold text-lg flex items-center gap-2">
            <span>🏗️</span>
            <span>UKWI Monitor</span>
          </div>
          <div className="text-xs text-ukwi-100">Construction AI</div>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems
          .filter((it) => !it.roles || hasRole(...it.roles))
          .map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/dashboard"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded text-sm hover:bg-ukwi-600 transition-colors ${
                  isActive ? "bg-ukwi-600 font-semibold" : ""
                }`
              }
            >
              <span>{it.icon}</span>
              <span>{it.label}</span>
            </NavLink>
          ))}
      </nav>
      <div className="p-3 border-t border-ukwi-600 text-xs">
        <Link to="/profile" onClick={onNavigate} className="block hover:bg-ukwi-600 rounded p-2 -m-2">
          <div className="font-semibold truncate">{user?.full_name}</div>
          <div className="opacity-80 capitalize">{String(user?.role || "").replace("_", " ")}</div>
        </Link>
        <button
          onClick={onLogout}
          className="mt-2 w-full bg-ukwi-600 hover:bg-ukwi-500 rounded py-1.5 text-sm transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  );
}


export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer on every route change so users don't get
  // stranded with a half-open menu when they tap a link.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (drawerOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [drawerOpen]);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const currentPage = navItems.find((it) =>
    it.to === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname.startsWith(it.to)
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-ukwi-700 text-white flex-col flex-shrink-0">
        <SidebarBody user={user} hasRole={hasRole} onLogout={onLogout} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-ukwi-700 text-white flex flex-col shadow-xl animate-[slideIn_.2s_ease-out]">
            <SidebarBody
              user={user}
              hasRole={hasRole}
              onLogout={onLogout}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              type="button"
              className="md:hidden text-slate-700 hover:text-slate-900 p-1 -ml-1"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="text-slate-700 font-semibold truncate">
                {currentPage ? currentPage.label : "UKWI Construction Monitor"}
              </div>
              <div className="text-[11px] text-slate-500 hidden sm:block">
                {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600">
            <span className="hidden md:inline">{user?.full_name}</span>
            <span
              className="w-8 h-8 rounded-full bg-gradient-to-br from-ukwi-500 to-ukwi-700 text-white text-xs font-bold flex items-center justify-center"
              title={user?.full_name}
            >
              {(user?.full_name || "U")
                .split(" ")
                .map((s) => s[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      {/* Slide-in keyframes — kept inline so we don't fight Tailwind's purge. */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
