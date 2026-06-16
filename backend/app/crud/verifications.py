from sqlalchemy.orm import Session
from app.models.report import Report, ReportStatus
from app.models.verification import Verification, VerificationKind
from app.schemas.verification import VerificationCreate


def create(db: Session, report: Report, payload: VerificationCreate) -> Verification:
    vote = Verification(report_id=report.id, **payload.model_dump())
    db.add(vote)
    if payload.kind == VerificationKind.resolved:
        report.status = ReportStatus.resolved
    db.commit()
    db.refresh(vote)
    return vote

