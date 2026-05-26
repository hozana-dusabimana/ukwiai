import React from "react";
import { User, Mail, Phone, Shield, LogOut, ArrowRight, ExternalLink, BookOpen } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function Settings() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-8">
      <header>
        <nav className="flex text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-2 items-center mb-1">
          <span>Account</span>
          <ArrowRight className="w-3 h-3" />
          <span className="text-orange-600">Settings</span>
        </nav>
        <h1 className="font-sans text-2xl font-bold text-gray-950">Account & Workspace</h1>
        <p className="text-xs text-gray-500 mt-1">Profile details, access role, and session controls.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
            <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg">
              {user.full_name?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <div className="font-bold text-slate-900">{user.full_name}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded">{user.role}</span>
            </div>
          </div>

          <Row icon={<User className="w-4 h-4" />} label="Full name" value={user.full_name} />
          <Row icon={<Mail className="w-4 h-4" />} label="Email" value={user.email} />
          <Row icon={<Phone className="w-4 h-4" />} label="Phone" value={user.phone || "—"} />
          <Row icon={<Shield className="w-4 h-4" />} label="Status" value={user.is_active ? "Active" : "Suspended"} />
        </section>

        <section className="bg-slate-900 text-white rounded-lg p-6 shadow space-y-5">
          <h3 className="font-bold flex items-center gap-2"><Shield className="w-4 h-4 text-orange-400" /> Session</h3>
          <p className="text-xs text-gray-300 leading-relaxed">
            Signing out clears your access token from this device. You'll need to authenticate again with your UKWI credentials.
          </p>
          <button onClick={logout} className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded flex items-center justify-center gap-1.5">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><BookOpen className="w-4 h-4 text-orange-600" /> Support resources</h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <ExternalRow label="API documentation" hint="Swagger UI for every backend endpoint" href="/docs" />
          <ExternalRow label="System health" hint="Live container + database status" href="/api/system/health" />
          <ExternalRow label="UKWI engineering wiki" hint="Internal runbooks and incident response" href="https://intranet.ukwi.rw" />
          <ExternalRow label="Email engineering" hint="ops@ukwi.rw" href="mailto:ops@ukwi.rw" />
        </ul>
      </section>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 last:border-b-0">
      <div className="flex items-center gap-2 text-gray-500 text-xs">
        {icon}
        <span className="font-bold uppercase tracking-wider text-[10px]">{label}</span>
      </div>
      <div className="text-sm text-slate-900 font-bold">{value}</div>
    </div>
  );
}

function ExternalRow({ label, hint, href }: { label: string; hint: string; href: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded p-3 flex items-center justify-between gap-3 transition-colors group">
        <div>
          <div className="font-bold text-slate-900">{label}</div>
          <div className="text-[10px] text-gray-500">{hint}</div>
        </div>
        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-orange-600" />
      </a>
    </li>
  );
}
