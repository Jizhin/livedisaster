from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.district import District
from app.schemas.district import DistrictCreate


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

