from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.errors import AppError
from app.models.report import ReportImage

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 10 * 1024 * 1024


async def attach_report_image(db: Session, report_id: int, file: UploadFile) -> ReportImage:
    if (file.content_type or "") not in ALLOWED_TYPES:
        raise AppError("Only JPG, PNG, and WEBP images are allowed", 415)

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise AppError("Image must be 10MB or smaller", 413)

    settings = get_settings()

    if settings.cloudinary_cloud_name:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.upload(
            contents,
            folder="livedisaster",
            resource_type="image",
        )
        file_path = result["secure_url"]
    else:
        from pathlib import Path
        from uuid import uuid4
        suffix_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
        suffix = suffix_map.get(file.content_type or "", ".jpg")
        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid4().hex}{suffix}"
        (upload_dir / filename).write_bytes(contents)
        file_path = filename

    image = ReportImage(report_id=report_id, file_path=file_path, alt_text=file.filename)
    db.add(image)
    db.commit()
    db.refresh(image)
    return image
