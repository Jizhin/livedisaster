from fastapi import APIRouter, Query
from app.api.deps import DbSession
from app.schemas.report import ReportCreate, ReportCreateGlobal, ReportDetail, ReportRead
from app.services import reports as report_service

router = APIRouter()


@router.get("/reports/recent", response_model=list[ReportRead])
def recent_reports(db: DbSession, limit: int = Query(default=6, le=50)) -> list[ReportRead]:
    return report_service.recent_reports(db, limit)


@router.get("/reports/feed", response_model=list[ReportRead])
def reports_feed(db: DbSession, limit: int = Query(default=40, le=50)) -> list[ReportRead]:
    """Live feed of most recent community reports across all districts."""
    return report_service.feed_all_reports(db, limit)


@router.post("/reports", response_model=ReportRead, status_code=201)
def create_global_report(payload: ReportCreateGlobal, db: DbSession) -> ReportRead:
    """Submit a report from anywhere in the world."""
    return report_service.create_report_global(db, payload)


@router.post("/districts/{district_slug}/reports", response_model=ReportRead, status_code=201)
def create_report(district_slug: str, payload: ReportCreate, db: DbSession) -> ReportRead:
    return report_service.create_report(db, district_slug, payload)


@router.get("/reports/{report_id}", response_model=ReportDetail)
def get_report(report_id: int, db: DbSession) -> ReportDetail:
    return report_service.report_detail(db, report_id)


@router.post("/reports/{report_id}/view", response_model=ReportRead)
def increment_view(report_id: int, db: DbSession) -> ReportRead:
    return report_service.increment_view(db, report_id)

