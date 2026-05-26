// Overlays the latest AI prediction on top of backend timeline rows so the
// UI reflects what the CNN sees, not just the human-recorded status.

export interface StageRow {
  stage_order: number;
  stage_name: string;
  status: string;
  expected_progress?: number | string;
  allocated_budget?: number | string;
  actual_cost?: number | string;
}

export interface AnalysisLike {
  predicted_stage?: string | null;
  predicted_progress_percentage?: number | string | null;
  confidence_score?: number | string | null;
}

export type DerivedStatus = "complete" | "in_progress" | "not_started";

export interface DerivedStage<T extends StageRow> {
  stage: T;
  status: DerivedStatus;
  aiDerived: boolean;
  fillPercent: number;
  /** Per-stage spend estimate. When AI marks the stage complete, this equals the allocated budget;
   *  in-progress = allocated * fill; not-started = 0. When not AI-derived, falls back to actual_cost. */
  estimatedSpent: number;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function deriveStageView<T extends StageRow>(
  stages: T[],
  latest: AnalysisLike | null | undefined
): DerivedStage<T>[] {
  // Fallback: pure backend view.
  if (!latest?.predicted_stage) {
    return stages.map((s) => {
      const status = mapBackendStatus(s.status);
      const fill = backendFill(s, status);
      return { stage: s, status, aiDerived: false, fillPercent: fill, estimatedSpent: Number(s.actual_cost) || 0 };
    });
  }

  const predName = normalize(String(latest.predicted_stage));
  // Match exact, then substring, in either direction.
  const predicted =
    stages.find((s) => normalize(s.stage_name) === predName) ||
    stages.find((s) => normalize(s.stage_name).includes(predName) || predName.includes(normalize(s.stage_name)));

  if (!predicted) {
    return stages.map((s) => {
      const status = mapBackendStatus(s.status);
      const fill = backendFill(s, status);
      return { stage: s, status, aiDerived: false, fillPercent: fill, estimatedSpent: Number(s.actual_cost) || 0 };
    });
  }

  const predictedOrder = predicted.stage_order;
  const predProgress = Math.max(0, Math.min(100, Number(latest.predicted_progress_percentage) || 0));

  return stages.map((s) => {
    const alloc = Number(s.allocated_budget) || 0;
    if (s.stage_order < predictedOrder) {
      return { stage: s, status: "complete" as const, aiDerived: true, fillPercent: 100, estimatedSpent: alloc };
    }
    if (s.stage_order === predictedOrder) {
      if (predProgress >= 98) {
        return { stage: s, status: "complete" as const, aiDerived: true, fillPercent: 100, estimatedSpent: alloc };
      }
      const fill = withinStageProgress(stages, predictedOrder, predProgress);
      return { stage: s, status: "in_progress" as const, aiDerived: true, fillPercent: fill, estimatedSpent: alloc * (fill / 100) };
    }
    return { stage: s, status: "not_started" as const, aiDerived: true, fillPercent: 0, estimatedSpent: 0 };
  });
}

function mapBackendStatus(raw: string): DerivedStatus {
  const s = (raw || "").toLowerCase();
  if (s.includes("complete")) return "complete";
  if (s.includes("progress")) return "in_progress";
  return "not_started";
}

function backendFill(s: StageRow, status: DerivedStatus): number {
  if (status === "complete") return 100;
  if (status === "not_started") return 0;
  const alloc = Number(s.allocated_budget) || 0;
  const spent = Number(s.actual_cost) || 0;
  return alloc > 0 ? Math.min(100, Math.max(0, (spent / alloc) * 100)) : 50;
}

// Given total project progress predProgress and stages with expected_progress
// thresholds, estimate how far into the current stage we are (0..100).
function withinStageProgress(stages: StageRow[], currentOrder: number, predProgress: number): number {
  const prevStage = stages.find((s) => s.stage_order === currentOrder - 1);
  const currStage = stages.find((s) => s.stage_order === currentOrder);
  const prevEnd = Number(prevStage?.expected_progress) || 0;
  const currEnd = Number(currStage?.expected_progress) || prevEnd + 100;
  const span = Math.max(1, currEnd - prevEnd);
  return Math.max(0, Math.min(100, ((predProgress - prevEnd) / span) * 100));
}

export function statusLabel(status: DerivedStatus): string {
  return status === "complete" ? "Complete" : status === "in_progress" ? "In progress" : "Not started";
}

export function statusClass(status: DerivedStatus): string {
  if (status === "complete") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "in_progress") return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}
