from fastapi import APIRouter, File, UploadFile
from app.api.deps import DbSession
from app.schemas.common import ImageRead
from app.services.images import attach_report_image

router = APIRouter()


@router.post("/reports/{report_id}/images", response_model=ImageRead, status_code=201)
async def upload_report_image(report_id: int, db: DbSession, file: UploadFile = File(...)) -> ImageRead:
    return await attach_report_image(db, report_id, file)

