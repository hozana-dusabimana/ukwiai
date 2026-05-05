import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/projects", label: "Projects", icon: "🏗️" },
  { to: "/ai-analysis", label: "AI Analysis", icon: "🤖" },
  { to: "/alerts", label: "Alerts", icon: "🔔" },
  { to: "/reports", label: "Reports", icon: "📄" },
  { to: "/users", label: "Users", icon: "👥", adminOnly: true },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 bg-ukwi-700 text-white flex flex-col">
        <div className="px-5 py-4 border-b border-ukwi-600">
          <Link to="/" className="block">
            <div className="font-bold text-lg">UKWI Monitor</div>
            <div className="text-xs text-ukwi-100">Construction AI</div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems
            .filter((it) => !it.adminOnly || hasRole("admin"))
            .map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded text-sm hover:bg-ukwi-600 ${
                    isActive ? "bg-ukwi-600" : ""
                  }`
                }
              >
                <span>{it.icon}</span>
                <span>{it.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="p-3 border-t border-ukwi-600 text-xs">
          <div className="font-semibold">{user?.full_name}</div>
          <div className="opacity-80">{user?.role}</div>
          <button onClick={onLogout} className="mt-2 w-full bg-ukwi-600 hover:bg-ukwi-500 rounded py-1 text-sm">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="text-slate-700 font-semibold">UKWI Construction Monitor</div>
          <div className="text-sm text-slate-500">{new Date().toLocaleDateString()}</div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
