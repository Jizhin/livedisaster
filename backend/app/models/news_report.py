from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class NewsReport(Base):
    """Scraped news articles and IMD weather alerts — separate from community Report."""
    __tablename__ = "news_reports"

    id:           Mapped[int]       = mapped_column(primary_key=True)
    district_id:  Mapped[int]       = mapped_column(ForeignKey("districts.id"), index=True)
    title:        Mapped[str]       = mapped_column(String(500))
    content:      Mapped[str | None]= mapped_column(Text, nullable=True)
    source_url:   Mapped[str]       = mapped_column(String(700), unique=True, index=True)
    image_url:    Mapped[str | None]= mapped_column(String(700), nullable=True)
    source_name:  Mapped[str]       = mapped_column(String(100))  # "Manorama Online", "IMD", etc.
    severity:     Mapped[str | None]= mapped_column(String(20), nullable=True)  # red/orange/yellow
    created_at:   Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow, index=True)

    district = relationship("District")
