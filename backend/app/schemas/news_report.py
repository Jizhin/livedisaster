from datetime import datetime
from app.schemas.common import ORMModel


class NewsReportRead(ORMModel):
    id: int
    district_id: int
    district_slug: str | None = None
    district_name: str | None = None
    title: str
    content: str | None = None
    source_url: str
    image_url: str | None = None
    source_name: str
    severity: str | None = None
    created_at: datetime
