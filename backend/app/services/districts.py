from sqlalchemy.orm import Session
from app.crud import districts as district_crud
from app.crud import reports as report_crud
from app.schemas.district import DistrictSummary


def district_summaries(db: Session) -> list[DistrictSummary]:
    summaries: list[DistrictSummary] = []
    for district in district_crud.list_active(db):
        reports = report_crud.list_for_district(db, district.id)
        latest = reports[0] if reports else None
        summaries.append(
            DistrictSummary(
                id=district.id,
                name=district.name,
                slug=district.slug,
                is_active=district.is_active,
                active_reports_count=len(reports),
                latest_activity=latest.content if latest else None,
                latest_activity_time=latest.created_at.isoformat() if latest else None,
            )
        )
    return summaries

