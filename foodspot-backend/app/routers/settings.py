from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pathlib import Path
import io

from PIL import Image

from ..core.database import get_db
from ..core.config import settings
from ..models.settings import SiteSettings

router = APIRouter()

HERO_BG_KEY = "hero_bg_url"
UPLOADS_DIR = Path(settings.upload_dir)


class UrlPayload(BaseModel):
    url: str


@router.get("/api/settings/hero-bg")
def get_hero_bg(db: Session = Depends(get_db)):
    row = db.query(SiteSettings).filter(SiteSettings.key == HERO_BG_KEY).first()
    return {"url": row.value if row else None}


@router.post("/api/settings/hero-bg/upload")
async def upload_hero_bg(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload an image file. Saves to uploads/hero-bg.jpg and stores the URL in DB."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents))
        img = img.convert("RGB")
        UPLOADS_DIR.mkdir(exist_ok=True)
        save_path = UPLOADS_DIR / "hero-bg.jpg"
        img.save(str(save_path), "JPEG", quality=95, optimize=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    url = "/uploads/hero-bg.jpg"
    _upsert(db, HERO_BG_KEY, url)
    return {"url": url}


@router.post("/api/settings/hero-bg")
def set_hero_bg(payload: UrlPayload, db: Session = Depends(get_db)):
    """Set hero background by URL directly."""
    if not payload.url.strip():
        raise HTTPException(status_code=400, detail="url must not be empty")
    url = payload.url.strip()
    _upsert(db, HERO_BG_KEY, url)
    return {"url": url}


def _upsert(db: Session, key: str, value: str) -> None:
    row = db.query(SiteSettings).filter(SiteSettings.key == key).first()
    if row:
        row.value = value
    else:
        db.add(SiteSettings(key=key, value=value))
    db.commit()
