from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload
from app.models.comment import Comment
from app.models.report import Report, ReportStatus
from app.models.verification import Verification, VerificationKind
from app.schemas.report import ReportCreate, ReportModeration


def _approved_reports() -> Select[tuple[Report]]:
    return (
        select(Report)
        .options(selectinload(Report.images), selectinload(Report.district))
        .where(Report.is_approved.is_(True))
        .where(Report.source_type == "community")  # community reports only; news goes to NewsReport
    )


def list_for_district(db: Session, district_id: int, sort: str = "newest", date_filter: str = "today") -> list[Report]:
    query = _approved_reports().where(Report.district_id == district_id)
    if sort == "most_verified":
        query = query.outerjoin(Verification).group_by(Report.id).order_by(func.count(Verification.id).desc())
    elif sort == "recently_resolved":
        query = query.where(Report.status == ReportStatus.resolved).order_by(Report.updated_at.desc())
    else:
        query = query.order_by(Report.created_at.desc())
    return list(db.scalars(query).unique())


def list_latest(db: Session, limit: int = 6) -> list[Report]:
    query = _approved_reports().order_by(Report.created_at.desc()).limit(limit)
    return list(db.scalars(query).unique())


def get(db: Session, report_id: int) -> Report | None:
    query = (
        _approved_reports()
        .options(selectinload(Report.comments), selectinload(Report.verifications))
        .where(Report.id == report_id)
    )
    return db.scalar(query)


def create(db: Session, district_id: int, payload: ReportCreate) -> Report:
    report = Report(district_id=district_id, **payload.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def moderate(db: Session, report_id: int, payload: ReportModeration) -> Report | None:
    report = db.get(Report, report_id)
    if not report:
        return None
    report.is_approved = payload.is_approved
    if payload.status:
        report.status = payload.status
    db.commit()
    db.refresh(report)
    return report


def counts(db: Session, report_id: int) -> dict[str, int]:
    rows = db.execute(
        select(Verification.kind, func.count(Verification.id))
        .where(Verification.report_id == report_id)
        .group_by(Verification.kind)
    ).all()
    vote_counts = {kind.value: count for kind, count in rows}
    comments = db.scalar(
        select(func.count(Comment.id)).where(Comment.report_id == report_id, Comment.is_approved.is_(True))
    )
    return {
        "confirmed_count": vote_counts.get(VerificationKind.confirm.value, 0),
        "incorrect_count": vote_counts.get(VerificationKind.incorrect.value, 0),
        "resolved_count": vote_counts.get(VerificationKind.resolved.value, 0),
        "comment_count": comments or 0,
    }


def batch_counts(db: Session, report_ids: list[int]) -> dict[int, dict[str, int]]:
    """Single-query replacement for calling counts() in a loop (avoids N+1)."""
    if not report_ids:
        return {}

    verification_rows = db.execute(
        select(Verification.report_id, Verification.kind, func.count(Verification.id))
        .where(Verification.report_id.in_(report_ids))
        .group_by(Verification.report_id, Verification.kind)
    ).all()

    comment_rows = db.execute(
        select(Comment.report_id, func.count(Comment.id))
        .where(Comment.report_id.in_(report_ids), Comment.is_approved.is_(True))
        .group_by(Comment.report_id)
    ).all()

    result: dict[int, dict[str, int]] = {
        rid: {"confirmed_count": 0, "incorrect_count": 0, "resolved_count": 0, "comment_count": 0}
        for rid in report_ids
    }
    for rid, kind, cnt in verification_rows:
        key = f"{kind.value}_count" if hasattr(kind, "value") else f"{kind}_count"
        if key in result[rid]:
            result[rid][key] = cnt
    for rid, cnt in comment_rows:
        result[rid]["comment_count"] = cnt
    return result

