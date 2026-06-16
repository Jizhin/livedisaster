from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import distinct, func, select

from app.api.deps import DbSession
from app.models.district import District
from app.models.report import Report

router = APIRouter()


def _counts(db, filters: list) -> dict:
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total = db.scalar(select(func.count(Report.id)).where(*filters)) or 0
    safe = db.scalar(
        select(func.count(Report.id)).where(*filters, Report.content.ilike("%[safe now]%"))
    ) or 0
    contributors = db.scalar(
        select(func.count(distinct(Report.reporter_name))).where(*filters)
    ) or 0
    today_total = db.scalar(
        select(func.count(Report.id)).where(*filters, Report.created_at >= today)
    ) or 0
    today_safe = db.scalar(
        select(func.count(Report.id)).where(
            *filters, Report.created_at >= today, Report.content.ilike("%[safe now]%")
        )
    ) or 0

    return {
        "active_alerts": max(total - safe, 0),
        "safe_updates": safe,
        "contributors": contributors,
        "today_alerts": max(today_total - today_safe, 0),
        "today_safe": today_safe,
    }


@router.get("/stats")
def get_stats(
    db: DbSession,
    locality: str | None = Query(None),
    district_slug: str | None = Query(None),
) -> dict:
    base = [
        Report.is_approved.is_(True),
        Report.source_type == "community",
    ]

    district_id: int | None = None
    if district_slug:
        d = db.scalar(select(District).where(District.slug == district_slug))
        if d:
            district_id = d.id

    if district_id:
        base.append(Report.district_id == district_id)

    loc_filters = list(base)
    if locality:
        loc_filters.append(func.lower(Report.locality) == locality.lower().strip())

    result = _counts(db, loc_filters)

    # When locality is provided, also return the district-wide totals separately
    if locality and district_id:
        result["district"] = _counts(db, base)

    return result
