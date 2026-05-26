import React, { useEffect, useState } from "react";
import { Users, UserPlus, X, Search, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { capabilitiesFor, roleLabel } from "../lib/roles";
import { useToast } from "../ui/Toast";
import { Modal, InlineError } from "../ui/primitives";

interface Assignee {
  id: number;
  project_id: number;
  user_id: number;
  user_full_name: string;
  user_email: string;
  user_role: string;
  assigned_by: number;
  assigned_at: string;
}
interface AssignableUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

interface TeamPanelProps {
  projectId: number;
  ownerId?: number;
}

export default function TeamPanel({ projectId, ownerId }: TeamPanelProps) {
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);
  const toast = useToast();
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api<Assignee[]>(`/api/projects/${projectId}/assignees`);
      setAssignees(list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const remove = async (a: Assignee) => {
    if (a.user_id === ownerId) {
      toast.error("Cannot remove the project owner.");
      return;
    }
    if (!confirm(`Remove ${a.user_full_name} from this project?`)) return;
    try {
      await api(`/api/projects/${projectId}/assignees/${a.user_id}`, { method: "DELETE" });
      setAssignees((all) => all.filter((x) => x.user_id !== a.user_id));
      toast.success(`${a.user_full_name} removed from project`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <header className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-orange-600" /> Project team
          <span className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">{assignees.length}</span>
        </h3>
        {caps.canManageTeam && (
          <button
            onClick={() => setAddOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" /> Add member
          </button>
        )}
      </header>

      {error && <div className="p-4"><InlineError message={error} /></div>}

      {loading ? (
        <div className="p-6 text-center text-xs text-gray-400">Loading team…</div>
      ) : assignees.length === 0 ? (
        <div className="p-6 text-center text-xs text-gray-400">
          No team members yet.{caps.canManageTeam && " Add the first one with the button above."}
        </div>
      ) : (
        <ul className="divide-y divide-gray-150">
          {assignees.map((a) => {
            const isOwner = a.user_id === ownerId;
            const isYou = a.user_id === user?.id;
            return (
              <li key={a.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {(a.user_full_name?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">
                      {a.user_full_name}
                      {isYou && <span className="ml-2 text-[9px] uppercase tracking-wider font-bold text-orange-600">You</span>}
                      {isOwner && <span className="ml-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-emerald-600"><ShieldCheck className="w-3 h-3" /> Owner</span>}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono truncate">{a.user_email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${roleBadgeClass(a.user_role)}`}>
                    {roleLabel(a.user_role)}
                  </span>
                  {caps.canManageTeam && !isOwner && (
                    <button onClick={() => remove(a)} className="text-gray-400 hover:text-red-600 p-1" title="Remove">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {addOpen && (
        <AddMemberModal
          projectId={projectId}
          existingIds={new Set(assignees.map((a) => a.user_id))}
          onClose={() => setAddOpen(false)}
          onAdded={() => { toast.success("Member added"); load(); }}
        />
      )}
    </section>
  );
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "admin": return "bg-red-50 text-red-700 border-red-200";
    case "project_manager": return "bg-orange-50 text-orange-700 border-orange-200";
    case "engineer": return "bg-sky-50 text-sky-700 border-sky-200";
    case "viewer": return "bg-gray-50 text-gray-700 border-gray-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function AddMemberModal({
  projectId, existingIds, onClose, onAdded,
}: {
  projectId: number;
  existingIds: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const q = query ? `?search=${encodeURIComponent(query)}` : "";
        const list = await api<AssignableUser[]>(`/api/users/assignable${q}`);
        setUsers(list);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const add = async (u: AssignableUser) => {
    setAdding(u.id);
    try {
      await api(`/api/projects/${projectId}/assignees`, {
        method: "POST",
        body: { user_id: u.id },
      });
      onAdded();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add team member"
      footer={
        <button onClick={onClose} className="text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-slate-900 px-4 py-2">
          Done
        </button>
      }
    >
      <div className="flex items-center bg-gray-50 border border-gray-200 px-3 py-2 rounded gap-2">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="bg-transparent outline-none w-full text-sm"
        />
      </div>

      {error && <InlineError message={error} />}

      <div className="max-h-80 overflow-y-auto -mx-6 px-6">
        {loading ? (
          <div className="py-6 text-center text-xs text-gray-400">Searching…</div>
        ) : users.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">No users match.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.map((u) => {
              const already = existingIds.has(u.id);
              return (
                <li key={u.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                      {(u.full_name?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{u.full_name}</div>
                      <div className="text-[10px] text-gray-400 font-mono truncate">{u.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${roleBadgeClass(u.role)}`}>
                      {roleLabel(u.role)}
                    </span>
                    {already ? (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">Added</span>
                    ) : (
                      <button
                        onClick={() => add(u)}
                        disabled={adding === u.id}
                        className="bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded"
                      >
                        {adding === u.id ? "Adding…" : "Add"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
