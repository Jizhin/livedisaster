from datetime import datetime
from pydantic import Field
from app.models.report import ReportStatus
from app.schemas.common import ImageRead, ORMModel
from app.schemas.comment import CommentRead


class ReportCreate(ORMModel):
    reporter_name: str = Field(default="Anonymous", min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=500)
    severity: str = Field(default="warn", pattern=r"^(safe|warn|critical)$")
    category: str | None = Field(default=None, max_length=40)
    location_attached: bool = False
    latitude: float | None = None
    longitude: float | None = None
    locality: str | None = None
    state: str | None = None
    country: str | None = None
    pincode: str | None = None


class ReportRead(ORMModel):
    id: int
    district_id: int
    district_slug: str | None = None
    district_name: str | None = None
    reporter_name: str
    content: str
    severity: str = "warn"
    category: str | None = None
    status: ReportStatus
    location_attached: bool
    latitude: float | None = None
    longitude: float | None = None
    locality: str | None = None
    state: str | None = None
    country: str | None = None
    pincode: str | None = None
    created_at: datetime
    updated_at: datetime
    images: list[ImageRead] = []
    confirmed_count: int = 0
    incorrect_count: int = 0
    resolved_count: int = 0
    comment_count: int = 0
    views_count: int = 0
    source_type: str = "community"
    source_url: str | None = None


class ReportDetail(ReportRead):
    comments: list[CommentRead] = []


class ReportModeration(ORMModel):
    is_approved: bool
    status: ReportStatus | None = None

