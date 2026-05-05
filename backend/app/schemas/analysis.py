from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


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
    summary: str | None = None
    advice: str | None = None
    next_stage: str | None = None
    confidence_label: str | None = None
