import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException
from ..core.config import settings

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 10 * 1024 * 1024


async def save_image(file: UploadFile) -> str:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 10MB")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(exist_ok=True)

    with open(upload_dir / filename, "wb") as f:
        f.write(contents)

    return filename
