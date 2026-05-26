import { useAuth } from "../contexts/AuthContext";

/**
 * Conditionally render children based on the current user's role.
 *
 * Usage:
 *   <RoleGate roles={["admin", "project_manager"]}>
 *     <button>Create project</button>
 *   </RoleGate>
 *
 * Optional `fallback` renders when the user's role does not match — handy for
 * showing an inline "read-only — ask an admin to upgrade your role" hint.
 *
 * This is a UX guard, not a security guard. The backend still enforces the
 * actual permission checks; this just stops users seeing buttons they can't use.
 */
export default function RoleGate({ roles, fallback = null, children }) {
  const { hasRole } = useAuth();
  return hasRole(...roles) ? children : fallback;
}
