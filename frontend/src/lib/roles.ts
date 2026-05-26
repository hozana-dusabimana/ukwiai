// Single source of truth for "what can this role do" — used by Sidebar to
// hide tabs and by components to disable action buttons.

export type Role = "admin" | "project_manager" | "engineer" | "viewer" | string;

export interface Capabilities {
  // Tabs
  canSeeDashboard: boolean;
  canSeeAiAnalysis: boolean;
  canSeeProjects: boolean;
  canSeeFinancials: boolean;
  canSeeSiteLogs: boolean;
  canSeeReports: boolean;
  canSeeSystemHealth: boolean;
  canSeeUsers: boolean;
  canSeeSettings: boolean;
  // Mutating actions
  canCreateProject: boolean;
  canUploadImage: boolean;
  canRunAi: boolean;
  canAddExpense: boolean;
  canResolveAlert: boolean;
  canGenerateReport: boolean;
  canManageTeam: boolean;
  canManageUsers: boolean;
}

export function capabilitiesFor(role: Role | undefined): Capabilities {
  const isAdmin = role === "admin";
  const isPM = role === "project_manager";
  const isEng = role === "engineer";
  const isViewer = role === "viewer";

  return {
    // Tabs — every authenticated user sees the core dashboards.
    canSeeDashboard: true,
    canSeeAiAnalysis: isAdmin || isPM || isEng,
    canSeeProjects: true,
    canSeeFinancials: isAdmin || isPM || isEng,
    canSeeSiteLogs: true,
    canSeeReports: isAdmin || isPM,
    canSeeSystemHealth: isAdmin,
    canSeeUsers: isAdmin,
    canSeeSettings: true,

    // Mutating actions
    canCreateProject: isAdmin || isPM,
    canUploadImage: isAdmin || isPM || isEng,
    canRunAi: isAdmin || isPM || isEng,
    canAddExpense: isAdmin || isPM || isEng,
    canResolveAlert: isAdmin || isPM,
    canGenerateReport: isAdmin || isPM,
    canManageTeam: isAdmin || isPM,
    canManageUsers: isAdmin,
    // viewer falls through with everything false except read tabs
    ...(isViewer ? {} : {}),
  };
}

export function roleLabel(role: Role | undefined): string {
  switch (role) {
    case "admin": return "Administrator";
    case "project_manager": return "Project Manager";
    case "engineer": return "Site Engineer";
    case "viewer": return "Viewer";
    default: return role || "User";
  }
}
