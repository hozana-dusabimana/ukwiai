from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict

from app.schemas.cost import CostEstimationOut


class ProgressAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: int
    image_id: int
    project_id: int
    predicted_stage: str | None
    predicted_progress_percentage: Decimal | None
    confidence_score: Decimal | None
    model_version: str | None
    analysis_date: datetime
    processing_time_ms: int | None
    raw_predictions: dict | None


class AnalyzeResponse(BaseModel):
    analysis: ProgressAnalysisOut
    cost_estimation_id: int | None = None
    # Full cost-vs-budget snapshot computed from this prediction. Lets the
    # frontend show "expected cost spent / actual / remaining" alongside the
    # stage prediction without a second round-trip.
    cost_estimation: CostEstimationOut | None = None
    project_total_budget: Decimal | None = None
    summary: str | None = None
    advice: str | None = None
    next_stage: str | None = None
    confidence_label: str | None = None
    # Material-aware, market-priced cost prediction for this site (independent of
    # the planning budget — a stage's predicted cost can exceed its allocation).
    materials_visible: list[str] = []
    cost_prediction: dict | None = None
    predicted_stage_cost: dict | None = None
    # Predicted money consumed so far, rolled up from the per-stage market bill
    # at the detected stage (completed stages in full + the current stage
    # pro-rated by within-stage progress). Distinct from the planning budget.
    money_consumed: dict | None = None
    # The court's measured footprint (FIBA-standard check + which sport the size
    # implies). Surfaces the "measurement of the basketball court".
    court_measurement: dict | None = None
    # Sport the IMAGE structures show ("basketball"/"volleyball"/"unknown").
    structure_sport: str | None = None
    # Soft, non-blocking note when the measured footprint looks like the wrong
    # sport (e.g. volleyball-sized). Clear volleyball *structures* are rejected
    # outright (422) before reaching here; this catches the early-phase case.
    sport_warning: str | None = None
