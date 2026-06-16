from fastapi import APIRouter
from app.api.deps import DbSession
from app.core.errors import AppError
from app.crud import alerts as alert_crud
from app.crud import comments as comment_crud
from app.crud import districts as district_crud
from app.crud import reports as report_crud
from app.schemas.alert import AlertCreate, AlertRead
from app.schemas.comment import CommentModeration, CommentRead
from app.schemas.district import DistrictCreate, DistrictRead
from app.schemas.report import ReportModeration, ReportRead

router = APIRouter()


@router.post("/districts", response_model=DistrictRead, status_code=201)
def create_district(payload: DistrictCreate, db: DbSession) -> DistrictRead:
    return district_crud.create(db, payload)


@router.patch("/reports/{report_id}", response_model=ReportRead)
def moderate_report(report_id: int, payload: ReportModeration, db: DbSession) -> ReportRead:
    report = report_crud.moderate(db, report_id, payload)
    if not report:
        raise AppError("Report not found", 404)
    return ReportRead.model_validate(report).model_copy(update=report_crud.counts(db, report.id))


@router.patch("/comments/{comment_id}", response_model=CommentRead)
def moderate_comment(comment_id: int, payload: CommentModeration, db: DbSession) -> CommentRead:
    comment = comment_crud.moderate(db, comment_id, payload)
    if not comment:
        raise AppError("Comment not found", 404)
    return comment


@router.post("/alerts", response_model=AlertRead, status_code=201)
def create_alert(payload: AlertCreate, db: DbSession) -> AlertRead:
    return alert_crud.create(db, payload)

