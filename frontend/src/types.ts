export interface ScanHistory {
  id: string;
  projectId?: number | null;
  // Backing SiteImage id when this card is a persisted capture; null for
  // placeholder cards (projects with no images yet). Used to delete the entry.
  imageId?: number | null;
  title: string;
  date: string;
  progress: number;
  image: string;
  stageName: string;
  confidence: number;
  advisory: string;
  budgetConsumed: string;
  remainingBudget: string;
  projectedVariance: string;
  varianceStatus: 'ON TRACK' | 'CRITICAL' | 'WARNING';
}

export interface SystemService {
  name: string;
  status: 'Online' | 'Offline' | 'Healthy' | 'Active';
  latency?: string;
  capacity?: string;
  version?: string;
  nodes?: string;
  details: string;
  type: 'api' | 'ai' | 'database' | 'workers';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  entity: string;
  status: 'Success' | 'Modified' | 'Alert';
  reference: string;
}

export interface OverviewData {
  activeProject: {
    id: number;
    name: string;
    location: string;
    code: string;
    status?: string;
    totalBudget?: string;
  } | null;
  projects?: Array<{
    id: number;
    name: string;
    code: string;
    location: string;
    status: string;
    totalBudget: string;
  }>;
  totals: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    totalBudget: string;
    totalSpent: string;
    remainingBudget: string;
    averageProgress: number;
    onTrackCount: number;
    overBudgetCount: number;
  } | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  location: string;
  region: string;
  confidence: number;
  stage: string;
  capturedAt: string;
  timeline: {
    label: string;
    status: 'Complete' | 'In Progress' | 'Pending';
    dateInfo?: string;
  }[];
  advisory: string;
  budgetConsumed: string;
  remainingBudget: string;
  projectedVariance: string;
  laborEfficiency: string;
  efficiencyGain: string;
  structuralLoad: string;
}
