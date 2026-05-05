from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict


ReportFormat = Literal["pdf", "excel"]
ReportType = Literal["progress", "budget", "full", "summary"]


class ReportGenerateRequest(BaseModel):
    project_id: int
    report_type: ReportType
    format: ReportFormat = "pdf"
    period_start: date | None = None
    period_end: date | None = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int | None
    report_type: str
    file_path: str
    generated_by: int
    generated_at: datetime
    period_start: date | None
    period_end: date | None
