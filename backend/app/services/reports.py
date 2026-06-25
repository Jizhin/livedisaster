import time
from sqlalchemy.orm import Session
from app.core.errors import AppError
from app.crud import comments as comment_crud
from app.crud import districts as district_crud
from app.crud import reports as report_crud
from app.crud import verifications as verification_crud
from app.models.report import Report
from app.schemas.comment import CommentCreate
from app.schemas.report import ReportCreate, ReportDetail, ReportRead
from app.schemas.verification import VerificationCreate, VerificationCounts

_feed_cache: tuple[float, list[ReportRead]] | None = None
_FEED_TTL = 20  # seconds — matches frontend poll interval


def _serialize_report(db: Session, report: Report) -> ReportRead:
    district_info = {
        "district_slug": report.district.slug,
        "district_name": report.district.name,
    }
    return ReportRead.model_validate(report).model_copy(
        update=report_crud.counts(db, report.id) | district_info
    )


def _serialize_reports_batch(db: Session, reports: list[Report]) -> list[ReportRead]:
    """Serialize a list of reports using batched count queries (avoids N+1)."""
    all_counts = report_crud.batch_counts(db, [r.id for r in reports])
    result = []
    for r in reports:
        district_info = {"district_slug": r.district.slug, "district_name": r.district.name}
        result.append(
            ReportRead.model_validate(r).model_copy(update=all_counts.get(r.id, {}) | district_info)
        )
    return result


def recent_reports(db: Session, limit: int = 6) -> list[ReportRead]:
    return _serialize_reports_batch(db, report_crud.list_latest(db, min(limit, 50)))


def feed_all_reports(db: Session, limit: int = 40) -> list[ReportRead]:
    global _feed_cache
    now = time.monotonic()
    if _feed_cache is not None and now - _feed_cache[0] < _FEED_TTL:
        return _feed_cache[1]
    rows = report_crud.list_latest(db, min(limit, 50))
    data = _serialize_reports_batch(db, rows)
    _feed_cache = (now, data)
    return data


def invalidate_feed_cache() -> None:
    global _feed_cache
    _feed_cache = None


def district_feed(db: Session, district_slug: str, sort: str = "newest", date_filter: str = "today") -> list[ReportRead]:
    district = district_crud.get_by_slug(db, district_slug)
    if not district:
        raise AppError("District not found", 404)
    return _serialize_reports_batch(db, report_crud.list_for_district(db, district.id, sort, date_filter))


def create_report(db: Session, district_slug: str, payload: ReportCreate) -> ReportRead:
    district = district_crud.get_by_slug(db, district_slug)
    if not district:
        raise AppError("District not found", 404)
    report = report_crud.create(db, district.id, payload)
    invalidate_feed_cache()
    return _serialize_report(db, report)


def report_detail(db: Session, report_id: int) -> ReportDetail:
    report = report_crud.get(db, report_id)
    if not report:
        raise AppError("Report not found", 404)
    counts = report_crud.counts(db, report.id)
    comments = comment_crud.list_for_report(db, report.id)
    return ReportDetail.model_validate(report).model_copy(update=counts | {"comments": comments})


def add_comment(db: Session, report_id: int, payload: CommentCreate) -> ReportDetail:
    report = report_crud.get(db, report_id)
    if not report:
        raise AppError("Report not found", 404)
    comment_crud.create(db, report_id, payload)
    return report_detail(db, report_id)


def increment_view(db: Session, report_id: int) -> ReportRead:
    report = report_crud.get(db, report_id)
    if not report:
        raise AppError("Report not found", 404)
    report.views_count = (report.views_count or 0) + 1
    db.commit()
    db.refresh(report)
    return _serialize_report(db, report)


def verify_report(db: Session, report_id: int, payload: VerificationCreate) -> VerificationCounts:
    report = report_crud.get(db, report_id)
    if not report:
        raise AppError("Report not found", 404)
    verification_crud.create(db, report, payload)
    counts = report_crud.counts(db, report.id)
    return VerificationCounts(
        confirmed_count=counts["confirmed_count"],
        incorrect_count=counts["incorrect_count"],
        resolved_count=counts["resolved_count"],
    )
