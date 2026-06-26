import re
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.district import District
from app.schemas.district import DistrictCreate


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def get_or_create_by_name(db: Session, name: str) -> District:
    """Find or create a district/country row by name (used for global reports)."""
    slug = _slugify(name)
    district = db.scalar(select(District).where(District.slug == slug))
    if district:
        return district
    try:
        district = District(name=name, slug=slug, is_active=True)
        db.add(district)
        db.commit()
        db.refresh(district)
        return district
    except IntegrityError:
        db.rollback()
        return db.scalar(select(District).where(District.slug == slug))


def get_by_slug(db: Session, slug: str) -> District | None:
    return db.scalar(select(District).where(District.slug == slug, District.is_active.is_(True)))


def list_active(db: Session) -> list[District]:
    return list(db.scalars(select(District).where(District.is_active.is_(True)).order_by(District.name)))


def create(db: Session, payload: DistrictCreate) -> District:
    district = District(**payload.model_dump())
    db.add(district)
    db.commit()
    db.refresh(district)
    return district

