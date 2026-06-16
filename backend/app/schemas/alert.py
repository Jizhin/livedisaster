from datetime import datetime
from pydantic import Field
from app.schemas.common import ORMModel


class AlertCreate(ORMModel):
    district_id: int
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=2, max_length=500)
    source: str = Field(default="District Collector", max_length=120)
    severity: str = Field(default="official", max_length=40)
    is_active: bool = True


class AlertRead(ORMModel):
    id: int
    district_id: int
    district_slug: str | None = None
    district_name: str | None = None
    title: str
    content: str
    source: str
    severity: str
    is_active: bool
    created_at: datetime
