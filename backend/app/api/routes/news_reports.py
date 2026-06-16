from fastapi import APIRouter, Query
from app.api.deps import DbSession
from app.schemas.news_report import NewsReportRead
from app.services import news_reports as news_service

router = APIRouter()


@router.get("/districts/{district_slug}/news", response_model=list[NewsReportRead])
def district_news(
    district_slug: str,
    db: DbSession,
    limit: int = Query(default=30, le=60),
) -> list[NewsReportRead]:
    return news_service.district_news(db, district_slug, limit)


@router.get("/news/recent", response_model=list[NewsReportRead])
def recent_news(
    db: DbSession,
    limit: int = Query(default=10, le=30),
) -> list[NewsReportRead]:
    return news_service.recent_news(db, limit)
