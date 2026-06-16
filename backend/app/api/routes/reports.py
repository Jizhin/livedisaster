from fastapi import APIRouter, Query
from app.api.deps import DbSession
from app.schemas.report import ReportCreate, ReportDetail, ReportRead
from app.services import reports as report_service

router = APIRouter()


@router.get("/reports/recent", response_model=list[ReportRead])
def recent_reports(db: DbSession, limit: int = Query(default=6, le=20)) -> list[ReportRead]:
    return report_service.recent_reports(db, limit)


@router.post("/districts/{district_slug}/reports", response_model=ReportRead, status_code=201)
def create_report(district_slug: str, payload: ReportCreate, db: DbSession) -> ReportRead:
    return report_service.create_report(db, district_slug, payload)


@router.get("/reports/{report_id}", response_model=ReportDetail)
def get_report(report_id: int, db: DbSession) -> ReportDetail:
    return report_service.report_detail(db, report_id)


@router.post("/reports/{report_id}/view", response_model=ReportRead)
def increment_view(report_id: int, db: DbSession) -> ReportRead:
    return report_service.increment_view(db, report_id)

