from fastapi import APIRouter
from app.api.deps import DbSession
from app.schemas.comment import CommentCreate
from app.schemas.report import ReportDetail
from app.services import reports as report_service

router = APIRouter()


@router.post("/reports/{report_id}/comments", response_model=ReportDetail, status_code=201)
def add_comment(report_id: int, payload: CommentCreate, db: DbSession) -> ReportDetail:
    return report_service.add_comment(db, report_id, payload)

