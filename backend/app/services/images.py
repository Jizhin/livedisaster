from pathlib import Path
from uuid import uuid4
from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.errors import AppError
from app.models.report import ReportImage


ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_SIZE = 10 * 1024 * 1024


async def attach_report_image(db: Session, report_id: int, file: UploadFile) -> ReportImage:
    suffix = ALLOWED_TYPES.get(file.content_type or "")
    if not suffix:
        raise AppError("Only JPG, PNG, and WEBP images are allowed", 415)

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise AppError("Image must be 10MB or smaller", 413)

    upload_dir = Path(get_settings().upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{suffix}"
    (upload_dir / filename).write_bytes(contents)

    image = ReportImage(report_id=report_id, file_path=filename, alt_text=file.filename)
    db.add(image)
    db.commit()
    db.refresh(image)
    return image

