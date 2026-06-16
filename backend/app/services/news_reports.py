from sqlalchemy import select
from sqlalchemy.orm import Session
from app.crud import districts as district_crud
from app.core.errors import AppError
from app.models.news_report import NewsReport
from app.schemas.news_report import NewsReportRead


def _serialize(nr: NewsReport) -> NewsReportRead:
    return NewsReportRead.model_validate(nr).model_copy(update={
        "district_slug": nr.district.slug,
        "district_name": nr.district.name,
    })


def district_news(db: Session, district_slug: str, limit: int = 30) -> list[NewsReportRead]:
    district = district_crud.get_by_slug(db, district_slug)
    if not district:
        raise AppError("District not found", 404)
    rows = db.scalars(
        select(NewsReport)
        .where(NewsReport.district_id == district.id)
        .order_by(NewsReport.created_at.desc())
        .limit(limit)
    ).all()
    return [_serialize(r) for r in rows]


def recent_news(db: Session, limit: int = 10) -> list[NewsReportRead]:
    rows = db.scalars(
        select(NewsReport)
        .order_by(NewsReport.created_at.desc())
        .limit(limit)
    ).all()
    return [_serialize(r) for r in rows]
