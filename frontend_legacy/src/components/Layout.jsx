import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { notificationsApi, alertsApi, systemApi } from "../api/endpoints";

// `roles` (when present) gates the sidebar entry — viewers don't see "AI
// Analysis" or "Users" because they cannot use those pages.
const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/projects", label: "Projects", icon: "🏗️" },
  { to: "/ai-analysis", label: "AI Analysis", icon: "🤖", roles: ["admin", "project_manager", "engineer"] },
  { to: "/alerts", label: "Alerts", icon: "🔔" },
  { to: "/notifications", label: "Notifications", icon: "📬" },
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
          <div className="flex items-center gap-1 md:gap-2">
            <SystemStatusPill />
            <NotificationBell />
            <AlertBell />
            <UserMenu user={user} onLogout={onLogout} />
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


function SystemStatusPill() {
  const { data, isLoading } = useQuery({
    queryKey: ["layout", "system-health"],
    queryFn: () => systemApi.health().then((r) => r.data),
    refetchInterval: 60_000,
  });
  const ok = data?.status === "ok";
  const tone = isLoading
    ? { dot: "bg-slate-300", ring: "ring-slate-200", label: "checking…", text: "text-slate-500" }
    : ok
    ? { dot: "bg-emerald-500", ring: "ring-emerald-200", label: "All systems normal", text: "text-emerald-700" }
    : { dot: "bg-rose-500", ring: "ring-rose-200", label: "Service issue", text: "text-rose-700" };
  return (
    <Link
      to="/dashboard"
      title={`${tone.label}${data?.environment ? ` · ${data.environment}` : ""}`}
      className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-slate-100 transition-colors`}
    >
      <span className={`w-2 h-2 rounded-full ${tone.dot} ring-2 ${tone.ring}`} />
      <span className={`text-[11px] font-medium ${tone.text} hidden lg:inline`}>{tone.label}</span>
    </Link>
  );
}


function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: ["notifications", "unread-bell"],
    queryFn: () => notificationsApi.list({ unread_only: true, limit: 8 }).then((r) => r.data),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const count = items.length;
  const badge = count > 9 ? "9+" : String(count);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">Notifications</span>
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-ukwi-600 hover:underline">View all</Link>
            </div>
            {items.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                <div className="text-2xl mb-1">📭</div>
                You're all caught up
              </div>
            ) : (
              <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id} className="p-3 hover:bg-slate-50 group">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-ukwi-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{n.title}</div>
                        {n.message && <div className="text-xs text-slate-500 truncate">{n.message}</div>}
                        <div className="text-[11px] text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        className="opacity-0 group-hover:opacity-100 text-[11px] text-slate-500 hover:text-ukwi-600 transition-opacity"
                        title="Mark read"
                      >
                        ✓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}


function AlertBell() {
  const [open, setOpen] = useState(false);
  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts", "open-bell"],
    queryFn: () => alertsApi.list({ unresolved_only: true, limit: 8 }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const count = alerts.length;
  const badge = count > 9 ? "9+" : String(count);
  const hasCritical = alerts.some((a) => a.severity === "critical");
  const SEV = { low: "bg-slate-400", medium: "bg-amber-500", high: "bg-orange-500", critical: "bg-rose-500" };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
        aria-label="Alerts"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full ${hasCritical ? "bg-rose-500" : "bg-amber-500"} text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white`}>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">Open alerts</span>
              <Link to="/alerts" onClick={() => setOpen(false)} className="text-xs text-ukwi-600 hover:underline">View all</Link>
            </div>
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                <div className="text-2xl mb-1">🛡️</div>
                Nothing needs attention
              </div>
            ) : (
              <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {alerts.map((a) => (
                  <li key={a.id} className="p-3 hover:bg-slate-50">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${SEV[a.severity] || "bg-slate-400"}`} />
                      <Link
                        to={`/projects/${a.project_id}`}
                        onClick={() => setOpen(false)}
                        className="flex-1 min-w-0"
                      >
                        <div className="text-sm text-slate-800 truncate">{a.message}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 capitalize">
                          {a.severity} · {String(a.alert_type).replace(/_/g, " ")} · #{a.project_id}
                        </div>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}


function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const initials = (user?.full_name || "U")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 hover:bg-slate-100 rounded-lg px-2 py-1 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="hidden md:flex flex-col items-end leading-tight">
          <span className="text-sm text-slate-700 font-medium">{user?.full_name}</span>
          <span className="text-[11px] text-slate-500 capitalize">
            {String(user?.role || "").replace("_", " ")}
          </span>
        </span>
        <span
          className="w-9 h-9 rounded-full bg-gradient-to-br from-ukwi-500 to-ukwi-700 text-white text-xs font-bold flex items-center justify-center ring-2 ring-white shadow-sm"
          title={user?.full_name}
        >
          {initials}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          className={`hidden md:inline text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
          >
            <div className="px-3 py-3 border-b border-slate-100">
              <div className="font-semibold text-slate-800 truncate">{user?.full_name}</div>
              <div className="text-xs text-slate-500 truncate">{user?.email}</div>
              <div className="mt-1.5">
                <span className="badge bg-ukwi-100 text-ukwi-700 border border-ukwi-200 capitalize">
                  {String(user?.role || "").replace("_", " ")}
                </span>
              </div>
            </div>
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              role="menuitem"
            >
              <span>👤</span>
              <span>My profile</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
              role="menuitem"
            >
              <span>🚪</span>
              <span>Sign out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}


