from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class SiteImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    image_path: str
    image_url: str | None
    captured_date: datetime | None
    uploaded_by: int
    latitude: Decimal | None
    longitude: Decimal | None
    weather_conditions: str | None
    notes: str | None
    file_size: int | None
    original_filename: str | None
    created_at: datetime
