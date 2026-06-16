from fastapi import APIRouter
from app.api.deps import DbSession
from app.schemas.district import DistrictSummary
from app.schemas.report import ReportRead
from app.services import districts as district_service
from app.services import reports as report_service
from app.services.manorama_scraper import get_sub_areas

router = APIRouter()


@router.get("/districts", response_model=list[DistrictSummary])
def list_districts(db: DbSession) -> list[DistrictSummary]:
    return district_service.district_summaries(db)


@router.get("/districts/{district_slug}/reports", response_model=list[ReportRead])
def district_reports(
    district_slug: str,
    db: DbSession,
    sort: str = "newest",
    date_filter: str = "today",
) -> list[ReportRead]:
    # Returns ALL reports for this district — both community posts and
    # news-sourced reports stored by the poller. source_type field in
    # each row tells the frontend which kind it is.
    return report_service.district_feed(db, district_slug, sort, date_filter)


@router.get("/districts/{district_slug}/sub-areas")
def district_sub_areas(district_slug: str) -> dict:
    return {"sub_areas": get_sub_areas(district_slug)}
