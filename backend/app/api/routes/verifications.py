from fastapi import APIRouter
from app.api.deps import DbSession
from app.schemas.verification import VerificationCounts, VerificationCreate
from app.services import reports as report_service

router = APIRouter()


@router.post("/reports/{report_id}/verifications", response_model=VerificationCounts, status_code=201)
def verify_report(report_id: int, payload: VerificationCreate, db: DbSession) -> VerificationCounts:
    return report_service.verify_report(db, report_id, payload)

