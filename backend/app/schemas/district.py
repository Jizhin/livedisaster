from pydantic import Field
from app.schemas.common import ORMModel


class DistrictCreate(ORMModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")


class DistrictRead(DistrictCreate):
    id: int
    is_active: bool


class DistrictSummary(DistrictRead):
    active_reports_count: int
    latest_activity: str | None = None
    latest_activity_time: str | None = None

